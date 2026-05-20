# Change: Refactor to Hexagonal Architecture (SOLID + GRASP)

## Why

The current `src/` layout — `infrastructure/`, `modules/`, `shared/` — is layered-ish, but the dependency direction is not enforced and several SOLID/GRASP principles are violated in ways that already make the code harder to change:

- **DIP** — application services depend on concrete adapters, not interfaces. `SubscriptionService` is typed against `GithubClient`, `MailerService`, `SubscriptionRepository`, `UnitOfWork`. Only `NotificationPublisher` is a port (1 of ~6 outbound dependencies).
- **SRP** — `GithubClient` simultaneously owns HTTP, caching, JSON parsing, rate-limit detection, and metrics emission. `NotificationService.start()` consumes a queue, fans out to a mailer, and emits metrics in one closure.
- **OCP / Pure Fabrication** — VCS, SMTP, and AMQP are hard-coded into business code. The empty `src/shared/types/vcs-{release,repository}.type.ts` stubs already on this branch signal the intent to abstract VCS providers; the rest of the codebase blocks that until ports exist.
- **Cross-module reach-in** — `notification.service` imports `buildUnsubscribeUrl` from `subscription/`; `scanner.service` imports `Subscriber` from `notification/`. There is no place that owns "the contract between bounded contexts."
- **Inconsistent inbound auth** — REST uses an api-key Fastify plugin; gRPC re-implements the same check inside every handler. The protected behavior should sit behind a single abstraction (Protected Variations).
- **DB types leak into the domain** — `Subscription` is `typeof subscriptionsTable.$inferSelect`. Service code consumes Drizzle rows directly; there is no domain object that owns "a subscription's invariants."

This proposal restructures the service around the **Hexagonal (Ports & Adapters)** architecture so the dependency rule becomes a one-line invariant ("everything points to `domain/`"), and applies SOLID/GRASP at each seam. No user-visible behavior changes.

## What Changes

### Structural

- **NEW** `src/domain/` — entities (`Subscription`, `TrackedRepository`, `Release`), value objects, domain errors, and **ports** (inbound use-case interfaces + outbound SPI interfaces). Zero infrastructure imports.
- **NEW** `src/application/` — use cases that implement inbound ports and depend only on outbound ports. One use case per business operation: `Subscribe`, `ConfirmSubscription`, `Unsubscribe`, `ListSubscriptions`, `ScanReleases`, `NotifySubscribers`.
- **NEW** `src/adapters/inbound/` — Fastify (REST), gRPC, cron (scanner trigger), AMQP consumer (notification trigger). Each calls a use case.
- **NEW** `src/adapters/outbound/` — Drizzle persistence, RabbitMQ publisher, Nodemailer mailer, Redis cache, GitHub VCS client, Prometheus metrics — each implementing an outbound port.
- **NEW** `src/composition/` — promoted home for `container.ts` (the composition root) and `bootstrap.ts` (former `index.ts`).
- **MOVED** existing files migrate into the new tree; current `infrastructure/` + `modules/` folders are removed at the end of the migration.
- **NEW** dependency lint rule (`dependency-cruiser` or `eslint-plugin-boundaries`) enforces the layer direction so the architecture cannot regress silently.

### SOLID / GRASP applications (concrete)

- **DIP**: every use case depends on an outbound port interface; concrete adapters are wired in `composition/container.ts`. Existing `NotificationPublisher` port is the template; we extend the pattern to all other outbound collaborators.
- **SRP**: split `GithubClient` into a transport-only `GithubVcsClient` (HTTP + parsing) and a caching decorator (`CachingVcsProvider`) that wraps any `VcsProvider`. Metrics emission moves to a thin observability decorator or stays as direct `prom-client` imports inside outbound adapters only — see `design.md`.
- **ISP**: outbound ports are narrow. `VcsProvider` exposes only `getRepository` + `getLatestRelease`. Repository ports expose only the methods their consumer needs (subscription-side vs scanner-side reads).
- **OCP / Polymorphism / Protected Variations**: a single shared inbound-auth abstraction replaces the duplicated api-key check in gRPC handlers. The `VcsProvider` port lets a future GitLab/Bitbucket adapter slot in without touching application code.
- **Information Expert / Creator**: subscription state transitions (`confirm()`, token equality checks) become methods on the `Subscription` entity rather than free-floating service code (anemic-vs-rich trade-off is justified in `design.md`).
- **Pure Fabrication**: URL building for confirmation and unsubscribe links becomes a domain service (`SubscriptionLinkBuilder`) injected as a port, not reached across modules.
- **Low Coupling / High Cohesion**: the cross-module imports between `scanner` and `notification` and between `notification` and `subscription` disappear once each side depends on shared domain types and its own ports.

### Behavior — explicitly unchanged

All public contracts hold: REST routes (`/api/*`), gRPC service methods, queue topology (`release.notifications` + DLX/DLQ), email content, scanner cadence, environment variables, and database schema. The Drizzle schema and migrations are untouched. CI test surfaces (unit + integration) continue to pass; tests move alongside the code they cover.

## Impact

- **Affected specs (NEW — no specs exist yet):**
  - `architecture` — layer rules, port/adapter naming, composition-root rules, dependency-direction enforcement
  - `subscription` — Subscribe / Confirm / Unsubscribe / List use-case contracts and `Subscription` entity invariants
  - `release-scanning` — Scan use-case contract and scheduling concerns
  - `release-notification` — Notify use-case contract and consumer concerns
  - `outbound-ports` — single registry of driven port contracts (VCS, mailer, queue publish/consume, cache, persistence, UoW, link builder)

- **Affected code (every file under `src/` moves or is touched):**
  - `src/modules/**` — split into `src/domain/**`, `src/application/**`, and `src/adapters/outbound/**`
  - `src/infrastructure/**` — moves to `src/adapters/outbound/**` (persistence, queue, cache, metrics) and `src/adapters/inbound/grpc/**`
  - `src/server.ts` + `src/modules/*/`*.routes.ts` — move to `src/adapters/inbound/http/**`
  - `src/index.ts` + `src/container.ts` — move to `src/composition/**`
  - Tests follow the files they exercise; unit-test fixtures use port doubles instead of mocking concretes
  - **NEW** `dependencycruiser.config.cjs` (or `.dependency-cruiser.cjs`) wired into `npm run lint`
  - **NEW** `npm run depcruise` script

- **Affected docs:**
  - `README.md` — Project Structure section
  - `docs/system-design.md` — Architecture section diagram swapped for the hexagonal view
  - `openspec/project.md` — Architecture Patterns section updated post-implementation

- **Risk surface:** ~30 source files touched, but no behavior changes. Phased migration (see `tasks.md`) keeps every phase shippable. Lint enforcement lands in the final phase so earlier phases are not blocked by transitive imports.

- **Out of scope (intentional):** swapping the actual VCS/email/queue/cache implementations (e.g. adding a GitLab adapter), introducing CQRS or event sourcing, replacing manual DI with a DI framework, splitting the monolith into services.

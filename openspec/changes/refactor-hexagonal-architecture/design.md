# Design: Refactor to Hexagonal Architecture

## Context

The service is a small-but-non-trivial Node.js monolith (Fastify + gRPC + cron scanner + AMQP consumer) for GitHub release notifications. The current `src/` layout has three top-level folders (`infrastructure/`, `modules/`, `shared/`) that suggest layering but do not enforce it. As the code has grown, several SOLID/GRASP frictions have shown up (enumerated in `proposal.md`).

This is a coursework refactor for the Software Engineering School 6.0 track (branch `feat/sold-and-grasp`). Reviewers will look specifically at whether the dependency rule, port/adapter terminology, and SOLID/GRASP applications are correct and consistent. Behavior must not change.

Constraints:

- Single-process Node 22 monolith; no plans to split.
- Manual DI in `container.ts` already exists and works well — keep it.
- `NotificationPublisher` is already a port (`src/modules/notification/notification-publisher.type.ts`); the refactor is consistent with that pattern, not introducing a new one.
- `UnitOfWork` already exists (`src/infrastructure/database/unit-of-work.ts`) and is hexagonal-shaped — promote it, don't replace it.
- TypeScript path alias `@/* → src/*` is configured; every import inside `src/` uses it.

Stakeholders: the user (refactoring for SES-6 homework), the grader (will inspect dependency direction and naming), future maintainers.

## Goals / Non-Goals

**Goals**
- Establish a clear hexagonal layout: `domain/` (entities + ports) → `application/` (use cases) → `adapters/{inbound,outbound}/`, with `composition/` as the wiring root.
- Make the dependency rule **mechanically enforceable** via a dependency-graph linter, not just a convention.
- Replace every direct concrete-class dependency in application code with a port. Each outbound adapter implements exactly one port.
- Apply SRP at the obvious smells: the multi-responsibility `GithubClient`, the cross-module URL reach-in, the inconsistent inbound-auth.
- Keep all observable behavior, all public contracts, all migrations, and all environment variables identical.
- Land in **phased, independently shippable** PRs so the branch can be reviewed without a single 30-file diff.

**Non-Goals**
- Adding a new VCS provider, mailer, or queue implementation. The port lets you do it later; this proposal does not.
- Moving to a DI framework (e.g. Inversify, Tsyringe). Manual DI is sufficient at this scale.
- Introducing CQRS, event sourcing, a domain-event bus, or DDD aggregates beyond a single entity.
- Splitting the service into microservices.
- Changing the database schema, queue topology, or transport surfaces.
- Adding caching/observability where it does not already exist.

## Target Layout

```
src/
├── domain/
│   ├── subscription/
│   │   ├── subscription.entity.ts          # Subscription with confirm()/matchesUnsubscribeToken()
│   │   ├── tracked-repository.entity.ts
│   │   ├── release.vo.ts
│   │   ├── subscription-link.port.ts       # SubscriptionLinkBuilder (inbound boundary type)
│   │   └── errors.ts                       # Domain errors (NotFound, Conflict, etc.)
│   ├── ports/
│   │   ├── inbound/                        # Use-case interfaces (driving side)
│   │   │   ├── subscribe.use-case.ts
│   │   │   ├── confirm-subscription.use-case.ts
│   │   │   ├── unsubscribe.use-case.ts
│   │   │   ├── list-subscriptions.use-case.ts
│   │   │   ├── scan-releases.use-case.ts
│   │   │   └── notify-subscribers.use-case.ts
│   │   └── outbound/                       # SPI interfaces (driven side)
│   │       ├── subscription.repository.ts
│   │       ├── tracked-repository.repository.ts
│   │       ├── unit-of-work.ts
│   │       ├── vcs-provider.ts
│   │       ├── mailer.ts
│   │       ├── notification-publisher.ts
│   │       ├── notification-consumer.ts
│   │       ├── cache.ts
│   │       └── token-generator.ts          # crypto.randomUUID isolation
│   └── shared/
│       └── result.ts                       # if/when we introduce Result types (probably not now)
├── application/
│   ├── subscription/
│   │   ├── subscribe.use-case.ts
│   │   ├── confirm-subscription.use-case.ts
│   │   ├── unsubscribe.use-case.ts
│   │   └── list-subscriptions.use-case.ts
│   ├── release-scanning/
│   │   └── scan-releases.use-case.ts
│   └── release-notification/
│       └── notify-subscribers.use-case.ts
├── adapters/
│   ├── inbound/
│   │   ├── http/
│   │   │   ├── http-server.ts              # was server.ts
│   │   │   ├── plugins/                    # api-key, error-handler, health, metrics
│   │   │   ├── subscription/
│   │   │   │   ├── subscription.routes.ts
│   │   │   │   └── subscription.schemas.ts
│   │   │   └── shared/auth.guard.ts        # the single inbound-auth abstraction
│   │   ├── grpc/
│   │   │   ├── grpc-server.ts
│   │   │   ├── grpc-error.mapper.ts
│   │   │   ├── subscription.grpc.ts
│   │   │   └── interceptors/auth.interceptor.ts  # delegates to shared/auth.guard.ts
│   │   ├── cron/
│   │   │   └── scanner-cron.adapter.ts     # owns node-cron; calls ScanReleases use case
│   │   └── queue/
│   │       └── notification-consumer.adapter.ts  # owns AMQP consume loop; calls NotifySubscribers
│   └── outbound/
│       ├── persistence/drizzle/
│       │   ├── db-client.ts                # was infrastructure/database/index.ts
│       │   ├── schema.ts
│       │   ├── helpers/
│       │   ├── subscription.drizzle.repository.ts
│       │   ├── tracked-repository.drizzle.repository.ts
│       │   └── drizzle.unit-of-work.ts
│       ├── vcs/github/
│       │   ├── github.vcs-client.ts        # SRP-split: HTTP + parsing only
│       │   ├── caching.vcs-provider.ts     # decorates any VcsProvider with cache
│       │   └── github.schemas.ts
│       ├── mailer/nodemailer/
│       │   ├── nodemailer.mailer.ts
│       │   └── templates/
│       ├── queue/rabbitmq/
│       │   ├── rabbitmq-channel.ts         # was queue-manager.ts
│       │   ├── rabbitmq.notification-publisher.ts
│       │   └── rabbitmq.notification-consumer.ts
│       ├── cache/redis/
│       │   ├── redis-client.ts
│       │   └── redis.cache.ts              # implements Cache port
│       ├── observability/
│       │   ├── prometheus/metrics.registry.ts
│       │   └── pino/logger.ts
│       └── crypto/
│           └── node-crypto.token-generator.ts
├── composition/
│   ├── container.ts                        # promoted composition root
│   └── bootstrap.ts                        # promoted entry; was index.ts
├── shared/
│   ├── config/                             # untouched
│   ├── constants/
│   └── lifecycle/                          # graceful-shutdown registry
└── index.ts                                # 1-line: `import './composition/bootstrap';`
```

### Layer dependency rule

```
adapters/inbound  ─┐
                   ├──▶ application ──▶ domain ◀── domain  (no outward edges)
adapters/outbound ─┘
composition  ──▶ everything else (it is the only place that knows concrete types)
shared/      ──▶ may be imported by anything (config, constants, lifecycle utilities)
```

Concretely:
- `domain/**` imports nothing outside `domain/` and `shared/`.
- `application/**` imports `domain/**` and `shared/**`. Never `adapters/**`, never `composition/**`.
- `adapters/inbound/**` imports `domain/ports/inbound/**` (to invoke use cases) and may import `shared/**`. Never `adapters/outbound/**`, never `application/**` (use case classes are reached only via inbound ports).
- `adapters/outbound/**` imports `domain/ports/outbound/**` (to implement) and `domain/entities/**` (to map). Never `application/**`, never `adapters/inbound/**`.
- `composition/**` is the only place that knows about concrete classes from both sides.

This rule is enforced by `dependency-cruiser` (see "Decisions" → "Lint enforcement").

## Decisions

### D1. Anemic vs rich domain entities — **lean rich, not full DDD**

The `Subscription` entity gets the small handful of behaviors it can meaningfully own:

- `Subscription.confirm()` returns a confirmed copy (immutable update) — currently a free-floating `subscriptionRepository.confirm(id)` call.
- `Subscription.matchesUnsubscribeToken(token)` and `matchesConfirmToken(token)` — the equality check that currently happens implicitly via the DB.
- Factory `Subscription.createPending({ email, repositoryId, tokens })` returns an unconfirmed instance with both tokens generated via the injected `TokenGenerator` port.

**Why not fully rich (aggregates, domain events)?** The system has one invariant (`(email, repositoryId)` uniqueness), and that invariant is enforced by the DB. Modelling a `SubscriptionAggregate` with events would be ceremony without payoff at this scale. The decision is to favor **expressive entities over service-driven anemia**, but not to introduce DDD machinery.

**Why not fully anemic (keep Drizzle row types)?** Because then `domain/` would either be empty or would re-import Drizzle's `$inferSelect` shape — both defeat the point of the refactor. The entity gives the domain layer a real reason to exist.

**Alternative considered**: keep records-only domain types and put `confirm()` on the use case. Rejected because (a) the grader is looking for Information Expert / Creator and (b) the entity centralizes invariants that currently leak across service + repository.

### D2. Outbound ports — one port per integration concern, narrow

| Port (file)                                  | Methods                                                                 | Adapter implementing it                                              |
|----------------------------------------------|-------------------------------------------------------------------------|----------------------------------------------------------------------|
| `SubscriptionRepository`                     | `create(pending)`, `findByConfirmToken`, `findByUnsubscribeToken`, `markConfirmed`, `deleteById`, `listConfirmedByEmail` | `SubscriptionDrizzleRepository`                                      |
| `TrackedRepositoryRepository`                | `findOrCreate(owner, repo)`, `updateLastSeenTag`, `listWithActiveSubscribers` | `TrackedRepositoryDrizzleRepository`                                 |
| `UnitOfWork`                                 | `run<T>(work: (ctx: TxContext) => Promise<T>): Promise<T>`              | `DrizzleUnitOfWork`                                                  |
| `VcsProvider`                                | `getRepository(owner, repo)`, `getLatestRelease(owner, repo)`           | `GithubVcsClient` (raw) + `CachingVcsProvider` (decorator)           |
| `Mailer`                                     | `sendConfirmationEmail(to, link)`, `sendReleaseNotification(to, repo, tag, url, unsubscribeLink)` | `NodemailerMailer`                                                   |
| `NotificationPublisher` *(already exists)*   | `publish(payload)`                                                      | `RabbitMqNotificationPublisher`                                      |
| `NotificationConsumer`                       | `consume(handler)`                                                      | `RabbitMqNotificationConsumer`                                       |
| `Cache`                                      | `get<T>(key, schema)`, `set(key, value, ttlSec)`                        | `RedisCache`                                                         |
| `TokenGenerator`                             | `next(): string`                                                        | `NodeCryptoTokenGenerator` (`randomUUID`)                            |
| `SubscriptionLinkBuilder`                    | `buildConfirmUrl(token)`, `buildUnsubscribeUrl(token)`                  | `AppUrlSubscriptionLinkBuilder` (uses `appConfig.appUrl`)            |

**ISP applied**: each port is the *minimum* required by its consumer. The current `SubscriptionRepository` has `existsByEmailAndRepo` — unused; it's dropped.

### D3. SRP-split of `GithubClient` — transport, caching, metrics

Currently `GithubClient` does five things (HTTP, JSON parsing, rate-limit detection, caching, metrics).

Split into:

- **`GithubVcsClient`** (`adapters/outbound/vcs/github/github.vcs-client.ts`) — implements `VcsProvider`. Owns HTTP, parsing, rate-limit detection. No caching, no metrics emission.
- **`CachingVcsProvider`** (`adapters/outbound/vcs/github/caching.vcs-provider.ts`) — implements `VcsProvider`, decorates another `VcsProvider`. Reads/writes the `Cache` port. Zero knowledge of HTTP.
- **Metrics** — handled by direct `metrics.registry` imports inside the outbound adapters (the *adapter* is allowed to know about Prometheus; the *application* is not). See D4.

Wiring (in `composition/container.ts`):
```ts
const vcs: VcsProvider = new CachingVcsProvider(
  new GithubVcsClient(httpFetch, githubConfig),
  cache,
  githubConfig.cacheTtlSeconds,
);
```

This composes the decorator pattern cleanly and the `Subscribe` use case sees a single `VcsProvider`.

### D4. Metrics — direct prom-client imports stay inside outbound adapters

Two options were considered:

- **Option A (chosen)**: each outbound adapter directly imports its metric counters from `adapters/outbound/observability/prometheus/metrics.registry`. The application layer has no notion of metrics.
- **Option B**: introduce a `Metrics` outbound port (`incCounter`, `observe`) that wraps prom-client; adapters and use cases call the port.

Option B is purer (use cases could emit business metrics like "subscription confirmed in <X ms"). It is rejected for now because: (1) no business-level metric is currently in scope; (2) prom-client is already the de-facto standard and switching exporters is unlikely; (3) the port adds boilerplate (`incCounter('foo', { label: 'bar' })`) that's strictly worse than a typed `fooCounter.inc({ label: 'bar' })`. If we later want metrics in use cases, we revisit.

**Consequence**: `scanner.service`'s direct import of `scannerNewReleasesTotal` is OK once it lives in `adapters/outbound/observability/`, *because the scanner is no longer the use case*. The new `ScanReleases` application use case is metric-free; the cron adapter and outbound adapters emit metrics.

### D5. Inbound auth — single `AuthGuard` abstraction

The current state:
- REST: `apiKeyPlugin` (`src/shared/plugins/api-key.plugin.ts`) — Fastify plugin gating protected routes.
- gRPC: `verifyApiKey(metadata)` inline-called in every handler in `subscription.grpc.ts`.

After refactor:
- A protocol-neutral `AuthGuard` interface in `adapters/inbound/shared/auth.guard.ts`:
  ```ts
  export interface AuthGuard {
    assert(credentials: InboundCredentials): void; // throws UnauthorizedError
  }
  ```
- A single `ApiKeyAuthGuard` implementation (the only one for now) reads `appConfig.apiKey` and compares.
- Fastify plugin and gRPC interceptor both delegate to this guard. The duplicated check disappears.

This is GRASP's **Protected Variations** — the variation point (auth scheme) lives behind one interface; both inbound adapters depend on the abstraction.

### D6. URL building — `SubscriptionLinkBuilder` port

Currently `notification.service` imports `buildUnsubscribeUrl` directly from `modules/subscription/subscription.urls.ts`. That's cross-module reach-in.

After refactor:
- `SubscriptionLinkBuilder` is a domain-owned port (it produces URLs that belong to the subscription concept, not to notification's outbound concerns).
- `Subscribe` use case calls `links.buildConfirmUrl(token)` and passes it to the mailer.
- `NotifySubscribers` use case calls `links.buildUnsubscribeUrl(token)` per subscriber.
- The concrete adapter (`AppUrlSubscriptionLinkBuilder`) lives under `adapters/outbound/` and reads `appConfig.appUrl`.

**Pure Fabrication**: the link builder is not an entity; it's a stateless object that exists to keep URL knowledge out of services. GRASP-style fabrication, justified.

### D7. Lint enforcement — `dependency-cruiser`

The dependency rule is enforced via `dependency-cruiser` (chosen over `eslint-plugin-boundaries` because it produces a graph artifact and integrates with `npm run lint` without needing per-file ESLint overrides).

Config sketch (`dependencycruiser.config.cjs`):
```js
module.exports = {
  forbidden: [
    {
      name: 'domain-must-be-pure',
      severity: 'error',
      from: { path: '^src/domain' },
      to:   { path: '^src/(application|adapters|composition)' },
    },
    {
      name: 'application-no-adapters',
      severity: 'error',
      from: { path: '^src/application' },
      to:   { path: '^src/adapters' },
    },
    {
      name: 'application-no-composition',
      severity: 'error',
      from: { path: '^src/application' },
      to:   { path: '^src/composition' },
    },
    {
      name: 'inbound-no-outbound',
      severity: 'error',
      from: { path: '^src/adapters/inbound' },
      to:   { path: '^src/adapters/outbound' },
    },
    {
      name: 'outbound-no-inbound',
      severity: 'error',
      from: { path: '^src/adapters/outbound' },
      to:   { path: '^src/adapters/inbound' },
    },
    {
      name: 'inbound-no-application-internals',
      severity: 'error',
      from: { path: '^src/adapters/inbound' },
      to:   { path: '^src/application' },
      comment: 'inbound adapters depend on inbound ports, not on use-case implementations',
    },
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' } },
};
```

Wired into `npm run lint` (`eslint src/ && depcruise src`) so CI fails on a regression.

### D8. Composition stays manual

`container.ts` keeps its current shape — a single factory wiring everything by hand — and grows to wire the new ports/adapters. No DI framework. Rationale: `<60` providers, no scopes beyond singleton, explicit wiring is easier to reason about and easier to mock per-test. This is the **composition root** pattern.

### D9. Testing strategy

- **Domain unit tests**: pure, in-memory, no test doubles needed. `Subscription.confirm()` etc.
- **Application unit tests**: use cases tested against in-memory port fakes (small hand-written stubs in `application/**/*.spec.ts`). No `vitest-mock-extended` on services anymore — that was needed only because services were typed against concrete classes.
- **Inbound adapter tests**: Fastify/grpc tests inject a stub use case, assert on HTTP/gRPC behaviour. Same level as today.
- **Outbound adapter tests**: integration tests (real PG, real Redis, real RabbitMQ) — these are exactly today's integration tests, moved alongside the adapters.

Net effect: unit tests get *easier* because faking a 2-method port is trivial; integration tests are unchanged.

## Risks / Trade-offs

| Risk                                                                                  | Mitigation                                                                                                                                                |
|---------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Big-bang refactor breaks the branch and stalls the homework                           | Phased tasks (see `tasks.md`). Each phase compiles + passes tests. Old paths kept until phase 7.                                                          |
| `dependency-cruiser` produces false positives that block CI                           | Land the lint rule **last** (phase 6); each preceding phase is shippable without it. Use `severity: error` only after the migration is otherwise complete. |
| Reviewers expect full DDD (aggregates, events)                                        | `design.md` explicitly justifies "lean rich" over DDD. The decision is defended, not implicit.                                                            |
| Outbound port surface grows beyond what use cases actually need (ISP violation)       | Each port is justified in D2 by listing exactly the methods it exposes. Unused methods (e.g. `existsByEmailAndRepo`) are dropped.                          |
| Renames break the integration test files in `tests/integration/`                       | Integration tests target the public REST/gRPC surface, which doesn't change. Internal imports inside test files migrate with their adapters.              |
| Path-alias resolution under `dependency-cruiser`                                       | Config explicitly points at `tsconfig.json`; verified locally before landing the rule.                                                                    |
| Drizzle's `db.transaction` callback context type couples `UnitOfWork` to Drizzle      | Port exposes a `TxContext` shape (`{ subscriptions, repositories }`) — Drizzle-specific types stay inside `DrizzleUnitOfWork`.                            |
| Coursework grading might want a specific terminology (Use Case vs Application Service) | Use the GRASP/Cockburn vocabulary consistently: "use case" for application class, "port" for interface, "adapter" for implementation.                     |

**Accepted trade-off**: the file count roughly doubles for the same behavior. This is the cost of an explicit architecture and is the point of the refactor.

## Migration Plan

See `tasks.md` for the concrete checklist. Summary:

1. **Phase 1 — Foundations.** Add `domain/` (entities + ports) and `composition/` skeleton. No application or adapter code moves yet. Compiles; old code still uses old paths.
2. **Phase 2 — Subscription bounded context.** Move subscription use cases to `application/subscription/`. Move drizzle subscription repository to `adapters/outbound/persistence/drizzle/`. REST/gRPC entry points still live under old paths but now call the new use case class. Tests follow.
3. **Phase 3 — Scanner bounded context.** Same shape for `release-scanning`. The cron loop becomes an inbound adapter calling `ScanReleases` use case.
4. **Phase 4 — Notification bounded context.** `NotifySubscribers` use case. The AMQP consume loop becomes an inbound adapter calling it. The existing `NotificationPublisher` port stays (renamed to `domain/ports/outbound/notification-publisher.ts`); the new `NotificationConsumer` port is added.
5. **Phase 5 — Inbound adapter consolidation.** Move REST/gRPC/cron/queue inbound code into `adapters/inbound/{http,grpc,cron,queue}/`. Introduce `AuthGuard` and use it from both Fastify plugin and gRPC interceptor. Delete the duplicated gRPC api-key check.
6. **Phase 6 — Lint enforcement.** Add `dependency-cruiser` config + npm script + CI step. Resolve any remaining cross-layer imports surfaced by the rule.
7. **Phase 7 — Remove legacy.** Delete the now-empty `src/infrastructure/` and `src/modules/` folders. Move `index.ts` content to `composition/bootstrap.ts`. Update `README.md`, `docs/system-design.md`, and `openspec/project.md` to match.

**Rollback**: each phase is a single commit. If something goes sideways mid-phase, `git reset --hard HEAD~1` reverts cleanly because no schema or external contract changes.

## Open Questions

- **Q1.** Do we want the `SubscriptionLinkBuilder` to live under `domain/subscription/` (it represents a domain concept) or under `application/` (it has no business invariants)? **Tentative answer**: `domain/subscription/` — the *port* lives in the domain; the concrete URL adapter lives in `adapters/outbound/`. Same shape as every other outbound port.
- **Q2.** Should `gRPC` interceptors live under `adapters/inbound/grpc/interceptors/` or share with HTTP? **Tentative answer**: per-transport interceptors are simpler than a generic abstraction; both delegate to the protocol-neutral `AuthGuard`.
- **Q3.** Do we keep the `*.schemas.ts` (Zod) files next to inbound adapters or in `domain/`? **Tentative answer**: next to inbound adapters — Zod schemas validate *transport-layer* input. The domain takes typed values, not raw input.
- **Q4.** Should we introduce `Result<T, E>` types for use-case returns instead of throwing? **Tentative answer**: no for this refactor — current `throw` semantics map cleanly to HTTP/gRPC error responses via the existing error-handler plugin. Result types would be a separate, opinionated change.

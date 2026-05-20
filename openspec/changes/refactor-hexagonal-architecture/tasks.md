# Implementation Tasks

> Phased; each phase compiles, lints, and passes `npm run test:run` + `npm run test:integration`. Each phase is one PR or commit.

## 1. Phase 1 — Foundations (domain + ports + composition skeleton)

- [ ] 1.1 Create `src/domain/subscription/` with `subscription.entity.ts`, `tracked-repository.entity.ts`, `release.vo.ts`, `errors.ts`
- [ ] 1.2 Implement `Subscription` entity: `createPending`, `confirm`, `matchesConfirmToken`, `matchesUnsubscribeToken`. Inject `TokenGenerator` via factory parameter.
- [ ] 1.3 Implement `TrackedRepository` entity with `hasNewRelease(tag)` and `withLastSeenTag(tag)`
- [ ] 1.4 Move domain errors out of `src/shared/errors/app.errors.ts` into `src/domain/subscription/errors.ts` (re-exported from old path until phase 7)
- [ ] 1.5 Create `src/domain/ports/inbound/` with one file per use case (interface only)
- [ ] 1.6 Create `src/domain/ports/outbound/` with all 10 outbound ports (interface only)
- [ ] 1.7 Move existing `NotificationPublisher` port from `modules/notification/notification-publisher.type.ts` to `domain/ports/outbound/notification-publisher.ts`; update imports
- [ ] 1.8 Create `src/composition/` folder; leave `container.ts` and `index.ts` in place for now
- [ ] 1.9 Add `npm run typecheck` to confirm everything still builds

## 2. Phase 2 — Subscription bounded context

- [ ] 2.1 Create `src/application/subscription/{subscribe,confirm-subscription,unsubscribe,list-subscriptions}.use-case.ts`
- [ ] 2.2 Port `SubscriptionService.subscribe` → `SubscribeUseCase` depending on `VcsProvider`, `UnitOfWork`, `Mailer`, `SubscriptionLinkBuilder`, `TokenGenerator`
- [ ] 2.3 Port `SubscriptionService.confirm` → `ConfirmSubscriptionUseCase` depending on `SubscriptionRepository`
- [ ] 2.4 Port `SubscriptionService.unsubscribe` → `UnsubscribeUseCase`
- [ ] 2.5 Port `SubscriptionService.getSubscriptionsByEmail` → `ListSubscriptionsUseCase`
- [ ] 2.6 Create `src/adapters/outbound/persistence/drizzle/subscription.drizzle.repository.ts` implementing `SubscriptionRepository` port; map Drizzle rows → `Subscription` entity at the boundary
- [ ] 2.7 Create `src/adapters/outbound/persistence/drizzle/drizzle.unit-of-work.ts` implementing `UnitOfWork` port (wraps `db.transaction`)
- [ ] 2.8 Create `src/adapters/outbound/crypto/node-crypto.token-generator.ts` implementing `TokenGenerator`
- [ ] 2.9 Create `src/adapters/outbound/mailer/nodemailer/nodemailer.mailer.ts` implementing `Mailer` port; move templates
- [ ] 2.10 Create `src/adapters/outbound/cache/redis/redis.cache.ts` implementing `Cache` port (move from `infrastructure/cache/`)
- [ ] 2.11 Create `src/adapters/outbound/vcs/github/github.vcs-client.ts` — HTTP + parsing only, implements `VcsProvider`
- [ ] 2.12 Create `src/adapters/outbound/vcs/github/caching.vcs-provider.ts` — decorator, implements `VcsProvider`, uses `Cache`
- [ ] 2.13 Create `src/adapters/outbound/observability/prometheus/metrics.registry.ts` (move from `infrastructure/metrics/`)
- [ ] 2.14 Create `src/adapters/outbound/subscription-links/app-url.link-builder.ts` implementing `SubscriptionLinkBuilder` (was `subscription.urls.ts`)
- [ ] 2.15 Update `container.ts` to wire `SubscribeUseCase` and friends with the new adapters
- [ ] 2.16 Point existing `subscription.routes.ts` + `subscription.grpc.ts` at the new use case classes (still under old `modules/` path)
- [ ] 2.17 Migrate `subscription.service.spec.ts` → `subscribe.use-case.spec.ts` etc. using in-memory port fakes; delete `vitest-mock-extended` usage
- [ ] 2.18 `npm run typecheck && npm run test:run && npm run test:integration` green

## 3. Phase 3 — Release scanning bounded context

- [ ] 3.1 Create `src/application/release-scanning/scan-releases.use-case.ts` depending on `TrackedRepositoryRepository`, `VcsProvider`, `NotificationPublisher`
- [ ] 3.2 Move logic from `ScannerService.scan` / `scanRepository` into the use case; metric emission stays in the cron adapter (D4)
- [ ] 3.3 Create `src/adapters/outbound/persistence/drizzle/tracked-repository.drizzle.repository.ts` implementing `TrackedRepositoryRepository` port
- [ ] 3.4 Create `src/adapters/inbound/cron/scanner-cron.adapter.ts` — owns `node-cron`, calls `ScanReleases` use case, increments `scannerRunsTotal`
- [ ] 3.5 Update `container.ts` and bootstrap to start the cron adapter
- [ ] 3.6 Move `scanner.service.spec.ts` → `scan-releases.use-case.spec.ts` with port fakes
- [ ] 3.7 Delete `src/modules/scanner/`
- [ ] 3.8 `npm run typecheck && npm run test:run && npm run test:integration` green

## 4. Phase 4 — Release notification bounded context

- [ ] 4.1 Create `src/application/release-notification/notify-subscribers.use-case.ts` depending on `Mailer`, `SubscriptionLinkBuilder`
- [ ] 4.2 Move `NotificationService.start` body into the use case; remove the metric increment from inside (moves to consumer adapter)
- [ ] 4.3 Add `NotificationConsumer` outbound port (`consume(handler)`); split `notification.queue.ts` into:
  - `adapters/outbound/queue/rabbitmq/rabbitmq.notification-publisher.ts` (implements `NotificationPublisher`)
  - `adapters/outbound/queue/rabbitmq/rabbitmq.notification-consumer.ts` (implements `NotificationConsumer`, includes retry/DLQ logic)
- [ ] 4.4 Move `queue-manager.ts` to `adapters/outbound/queue/rabbitmq/rabbitmq-channel.ts`
- [ ] 4.5 Create `src/adapters/inbound/queue/notification-consumer.adapter.ts` that subscribes the consumer to `NotifySubscribers` use case, emits success/failure metrics
- [ ] 4.6 Update `container.ts` to wire publisher (used by scanner), consumer (driving the notify use case), and use case
- [ ] 4.7 Move + adapt `notification.service.spec.ts` → `notify-subscribers.use-case.spec.ts`
- [ ] 4.8 Move `notification.queue.spec.ts` to test the publisher + consumer adapters separately
- [ ] 4.9 Delete `src/modules/notification/` and `src/infrastructure/queue/`
- [ ] 4.10 `npm run typecheck && npm run test:run && npm run test:integration` green

## 5. Phase 5 — Inbound adapter consolidation + AuthGuard

- [ ] 5.1 Create `src/adapters/inbound/http/http-server.ts` (move `server.ts` body)
- [ ] 5.2 Move `subscription.routes.ts` + `subscription.schemas.ts` to `src/adapters/inbound/http/subscription/`
- [ ] 5.3 Move Fastify plugins (`api-key`, `error-handler`, `health`, `metrics`) to `src/adapters/inbound/http/plugins/`
- [ ] 5.4 Create `src/adapters/inbound/shared/auth.guard.ts` (`AuthGuard` interface + `ApiKeyAuthGuard` implementation)
- [ ] 5.5 Rewrite `api-key.plugin.ts` to delegate to `AuthGuard`
- [ ] 5.6 Move `grpc-server.ts` + `grpc-error.mapper.ts` to `src/adapters/inbound/grpc/`
- [ ] 5.7 Move `subscription.grpc.ts` to `src/adapters/inbound/grpc/subscription.grpc.ts`
- [ ] 5.8 Replace inline `verifyApiKey` in gRPC handlers with a single interceptor at `src/adapters/inbound/grpc/interceptors/auth.interceptor.ts` that calls `AuthGuard.assert`
- [ ] 5.9 Update `GrpcServer` to install the auth interceptor on all unary handlers
- [ ] 5.10 Update tests for plugins/interceptors to target `AuthGuard` indirectly
- [ ] 5.11 Delete `src/server.ts` + `src/shared/plugins/` + `src/infrastructure/grpc/`
- [ ] 5.12 `npm run typecheck && npm run test:run && npm run test:integration` green

## 6. Phase 6 — Dependency-direction lint

- [ ] 6.1 `npm i -D dependency-cruiser`
- [ ] 6.2 Add `dependencycruiser.config.cjs` with the rules listed in `design.md` §D7
- [ ] 6.3 Add `npm run depcruise` script: `depcruise src --config dependencycruiser.config.cjs`
- [ ] 6.4 Update `npm run lint` to run both `eslint src/` and `depcruise`
- [ ] 6.5 Run locally; fix any cross-layer imports surfaced (expected to be zero if phases 1–5 went cleanly)
- [ ] 6.6 Add a `lint` step to `.github/workflows/ci.yml` if not already covered by the existing `npm run lint`
- [ ] 6.7 Commit a generated graph PNG (`docs/dependency-graph.svg`) as a reference artifact

## 7. Phase 7 — Cleanup + docs

- [ ] 7.1 Move `src/index.ts` content into `src/composition/bootstrap.ts`; leave `src/index.ts` as `import './composition/bootstrap';`
- [ ] 7.2 Move `src/container.ts` to `src/composition/container.ts`; update imports
- [ ] 7.3 Confirm `src/modules/` and `src/infrastructure/` are empty; delete them
- [ ] 7.4 Move `src/shared/errors/app.errors.ts` → `src/domain/shared/errors.ts` (or split: domain errors vs transport errors); update imports; delete old file
- [ ] 7.5 Update `README.md` "Project Structure" section to reflect the new layout
- [ ] 7.6 Replace the architecture diagram in `docs/system-design.md` §3 with the hexagonal view
- [ ] 7.7 Update `openspec/project.md` "Architecture Patterns" section
- [ ] 7.8 `npm run typecheck && npm run lint && npm run test:run && npm run test:integration` green
- [ ] 7.9 Manual smoke: `npm run dev`, hit `POST /api/subscribe`, confirm an email goes out, trigger a scan, confirm a notification arrives

## 8. OpenSpec close-out

- [ ] 8.1 `openspec validate refactor-hexagonal-architecture --strict --no-interactive` passes
- [ ] 8.2 Open PR linking back to this change directory
- [ ] 8.3 After deploy, archive via `openspec archive refactor-hexagonal-architecture --yes` (this creates the initial `openspec/specs/{architecture,subscription,release-scanning,release-notification,outbound-ports}/spec.md` files)

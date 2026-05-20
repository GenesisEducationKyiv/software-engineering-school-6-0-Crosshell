# Spec Delta: outbound-ports

## ADDED Requirements

### Requirement: VCS Provider Port

A `VcsProvider` outbound port SHALL live at `src/domain/ports/outbound/vcs-provider.ts` and expose exactly two methods: `getRepository(owner, repo): Promise<VcsRepository>` and `getLatestRelease(owner, repo): Promise<VcsRelease | null>`. Return types MUST be provider-neutral (no GitHub-specific shapes leak through). The port MUST throw `NotFoundError` when a repository does not exist and `RateLimitError` when the provider signals rate-limit exhaustion.

#### Scenario: Provider-neutral return types
- **WHEN** a use case calls `vcs.getRepository(owner, repo)`
- **THEN** the returned value matches the `VcsRepository` shape declared in `src/domain/`
- **AND** the use case does not import any GitHub-specific type

#### Scenario: GitHub adapter implements the port without leaking transport details
- **WHEN** `GithubVcsClient` is read
- **THEN** the class implements `VcsProvider`
- **AND** the file owns `fetch`, request headers, and rate-limit detection
- **AND** the file contains no caching logic

#### Scenario: Caching is composed via a decorator
- **WHEN** `CachingVcsProvider` is read
- **THEN** the class implements `VcsProvider` and accepts another `VcsProvider` plus the `Cache` port in its constructor
- **AND** it returns cached values on hit, delegates on miss, and stores the response with the configured TTL

### Requirement: Mailer Port

A `Mailer` outbound port SHALL live at `src/domain/ports/outbound/mailer.ts` with methods `sendConfirmationEmail(to, confirmUrl)` and `sendReleaseNotification(to, repo, tag, releaseUrl, unsubscribeUrl)`. Application code MUST depend on `Mailer` rather than any concrete mailer library.

#### Scenario: Nodemailer adapter is hidden behind the port
- **WHEN** a grep searches for `import .* from ['\"]nodemailer['\"]` under `src/`
- **THEN** the only matches reside under `src/adapters/outbound/mailer/nodemailer/**`

#### Scenario: Use cases call the port, not the adapter
- **WHEN** any application use case sends email
- **THEN** the call goes through the `Mailer` interface
- **AND** the constructor parameter is typed as `Mailer`, never as `NodemailerMailer`

### Requirement: Notification Publisher and Consumer Ports

`NotificationPublisher` and `NotificationConsumer` outbound ports SHALL live under `src/domain/ports/outbound/`. The publisher exposes `publish(payload)`. The consumer exposes `consume(handler)` and MUST encapsulate retry-with-`x-retry-count` and DLQ semantics inside its implementation, not inside the use case or the inbound adapter.

#### Scenario: Application has no AMQP knowledge
- **WHEN** a grep searches for `amqplib`, `assertQueue`, or `x-retry-count` under `src/application/**` or `src/domain/**`
- **THEN** there are zero matches

#### Scenario: One adapter implements each port
- **WHEN** the rabbitmq adapter directory is read
- **THEN** `RabbitMqNotificationPublisher` implements `NotificationPublisher`
- **AND** `RabbitMqNotificationConsumer` implements `NotificationConsumer`
- **AND** both share a single `RabbitMqChannel` collaborator (formerly `QueueManager`)

### Requirement: Persistence Repository Ports and Unit of Work

`SubscriptionRepository`, `TrackedRepositoryRepository`, and `UnitOfWork` outbound ports SHALL live under `src/domain/ports/outbound/`. Repository methods MUST return domain entities (`Subscription`, `TrackedRepository`) or domain DTOs — Drizzle row types MUST NOT cross the port boundary. `UnitOfWork.run` MUST accept a callback that receives a transaction context exposing the same repository ports.

#### Scenario: Repositories return entities, not Drizzle rows
- **WHEN** `SubscriptionRepository.findByConfirmToken(token)` resolves with a value
- **THEN** the value is a `Subscription` entity from `src/domain/subscription/`
- **AND** the caller can call `.matchesConfirmToken(token)` on it

#### Scenario: Drizzle is hidden behind the repository
- **WHEN** a grep searches for `drizzle-orm` under `src/`
- **THEN** matches reside only under `src/adapters/outbound/persistence/drizzle/**`

#### Scenario: Unit of work spans both repositories atomically
- **WHEN** `UnitOfWork.run(work)` is invoked
- **THEN** the callback receives a context with `subscriptions` and `repositories` ports backed by the same DB transaction
- **AND** if the callback throws, both repositories' writes are rolled back together

### Requirement: Cache Port

A `Cache` outbound port SHALL live at `src/domain/ports/outbound/cache.ts` with methods `get<T>(key, schema): Promise<T | null>` and `set(key, value, ttlSeconds): Promise<void>`. Schema validation is the port's responsibility (the adapter parses on read). The port MUST NOT expose Redis-specific methods.

#### Scenario: Redis is hidden behind the port
- **WHEN** a grep searches for `ioredis` under `src/`
- **THEN** matches reside only under `src/adapters/outbound/cache/redis/**`

#### Scenario: Caching adapters depend on the port, not the client
- **WHEN** `CachingVcsProvider` is read
- **THEN** its constructor parameter is typed as `Cache`, never as `Redis` or `RedisClient`

### Requirement: Token Generator Port

A `TokenGenerator` outbound port SHALL live at `src/domain/ports/outbound/token-generator.ts` with a single method `next(): string`. The domain `Subscription.createPending` factory MUST receive a `TokenGenerator` so it can be deterministic in tests.

#### Scenario: Domain factory accepts an injected generator
- **WHEN** a unit test calls `Subscription.createPending({ email, repositoryId, tokens })` with a stub generator returning `'tok-a'` then `'tok-b'`
- **THEN** the resulting subscription has `confirmToken='tok-a'` and `unsubscribeToken='tok-b'`
- **AND** no test needs to mock `crypto.randomUUID`

#### Scenario: Production wiring uses node:crypto
- **WHEN** `composition/container.ts` constructs the token generator
- **THEN** it uses `NodeCryptoTokenGenerator` which delegates to `crypto.randomUUID`

### Requirement: Subscription Link Builder Port

A `SubscriptionLinkBuilder` outbound port SHALL live under `src/domain/` (it is a subscription-shaped concept) and expose `buildConfirmUrl(token)` and `buildUnsubscribeUrl(token)`. The `Subscribe` and `NotifySubscribers` use cases MUST consume URLs through this port — neither use case may import `appConfig.appUrl` directly, and `NotifySubscribers` MUST NOT reach into subscription-module URL helpers.

#### Scenario: Notification stops reaching into subscription internals
- **WHEN** a grep searches for `buildUnsubscribeUrl` or `subscription.urls` under `src/application/release-notification/**`
- **THEN** there are zero matches
- **AND** the use case obtains URLs through a `SubscriptionLinkBuilder` constructor dependency

#### Scenario: App URL is read only by the link builder adapter
- **WHEN** a grep searches for `appConfig.appUrl` under `src/`
- **THEN** matches reside only inside the link-builder adapter under `src/adapters/outbound/`

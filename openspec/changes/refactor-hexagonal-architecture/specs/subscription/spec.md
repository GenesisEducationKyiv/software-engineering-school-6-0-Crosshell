# Spec Delta: subscription

## ADDED Requirements

### Requirement: Subscription Entity

A `Subscription` domain entity SHALL live in `src/domain/subscription/subscription.entity.ts` and own its state transitions. It MUST provide a factory `createPending`, an immutable transition `confirm`, and token-equality methods `matchesConfirmToken` / `matchesUnsubscribeToken`. The entity MUST NOT depend on Drizzle, Fastify, gRPC, or any other infrastructure library.

#### Scenario: Pending subscription is created with both tokens
- **WHEN** `Subscription.createPending({ email, repositoryId, tokens })` is called with a `TokenGenerator` that returns `'tok-a'` then `'tok-b'`
- **THEN** the returned subscription has `email`, `repositoryId`, `confirmToken='tok-a'`, `unsubscribeToken='tok-b'`, and `confirmed=false`

#### Scenario: Confirming a subscription is immutable
- **WHEN** `confirm()` is called on a pending subscription
- **THEN** a new `Subscription` instance is returned with `confirmed=true`
- **AND** the original instance still reports `confirmed=false`

#### Scenario: Token comparison is encapsulated in the entity
- **WHEN** `matchesConfirmToken('right')` is called on a subscription whose confirm token is `'right'`
- **THEN** it returns `true`
- **AND** calling it with `'wrong'` returns `false`

### Requirement: Subscribe Use Case

A `SubscribeUseCase` application class SHALL implement the inbound `Subscribe` port. It MUST: (a) resolve the VCS repository via the `VcsProvider` port, (b) execute a single `UnitOfWork.run` transaction that finds-or-creates the tracked repository and persists a pending subscription, (c) map a unique-constraint violation on `(email, repositoryId)` to a `ConflictError`, (d) build the confirmation URL via `SubscriptionLinkBuilder`, and (e) dispatch the confirmation email via the `Mailer` port. The use case MUST NOT touch any concrete library directly.

#### Scenario: Successful subscribe sends a confirmation email
- **WHEN** the use case is invoked with a valid `{ email, repo: 'owner/repo' }` and the VCS lookup succeeds
- **THEN** the `UnitOfWork.run` callback runs the find-or-create + insert pair in one transaction
- **AND** `Mailer.sendConfirmationEmail` is called with the email address and a URL produced by `SubscriptionLinkBuilder.buildConfirmUrl`

#### Scenario: Duplicate subscription surfaces as conflict
- **WHEN** the underlying repository throws a unique-constraint violation during `subscriptions.create`
- **THEN** the use case throws `ConflictError` with message `Email is already subscribed to this repository`
- **AND** `Mailer.sendConfirmationEmail` is not called

#### Scenario: Unknown repository surfaces from the VCS port
- **WHEN** the VCS provider throws `NotFoundError` for the requested owner/repo
- **THEN** the use case re-throws the error
- **AND** no transaction is opened

### Requirement: Confirm Subscription Use Case

A `ConfirmSubscriptionUseCase` SHALL implement the inbound `ConfirmSubscription` port. It MUST look up a subscription by confirm token, throw `NotFoundError` when none is found, and mark the subscription confirmed via the repository port.

#### Scenario: Valid token confirms the subscription
- **WHEN** the use case is invoked with a token matching a pending subscription
- **THEN** `SubscriptionRepository.markConfirmed` is called with the subscription's id

#### Scenario: Unknown token throws NotFoundError
- **WHEN** the use case is invoked with a token that no subscription matches
- **THEN** `NotFoundError` is thrown with message `Confirmation token not found`
- **AND** `markConfirmed` is not called

### Requirement: Unsubscribe Use Case

An `UnsubscribeUseCase` SHALL implement the inbound `Unsubscribe` port. It MUST look up a subscription by unsubscribe token, throw `NotFoundError` when none is found, and delete the subscription via the repository port.

#### Scenario: Valid unsubscribe token deletes the subscription
- **WHEN** the use case is invoked with a token matching an existing subscription
- **THEN** `SubscriptionRepository.deleteById` is called with the subscription's id

#### Scenario: Unknown unsubscribe token throws NotFoundError
- **WHEN** the use case is invoked with a token that no subscription matches
- **THEN** `NotFoundError` is thrown with message `Unsubscribe token not found`
- **AND** `deleteById` is not called

### Requirement: List Subscriptions Use Case

A `ListSubscriptionsUseCase` SHALL implement the inbound `ListSubscriptions` port. It MUST return only confirmed subscriptions for the requested email, in the `SubscriptionWithRepo` shape exposed to clients.

#### Scenario: List returns confirmed subscriptions only
- **WHEN** the use case is invoked with an email that has one confirmed and one pending subscription
- **THEN** the result contains exactly the confirmed entry

#### Scenario: List returns an empty array for unknown email
- **WHEN** the use case is invoked with an email that has no subscriptions
- **THEN** the result is `[]`

### Requirement: Public Subscription API Behavior Preserved

The REST and gRPC subscription endpoints SHALL behave identically before and after the refactor: same routes, same request/response shapes, same status codes, same gRPC method names. Adapters MAY change internally; the public contract does not.

#### Scenario: POST /api/subscribe contract unchanged
- **WHEN** a client sends `POST /api/subscribe` with body `{ email, repo }`
- **THEN** the response status is `200` on success, `400` on validation failure, `404` when the repo does not exist on the VCS, `409` on duplicate, `429` on VCS rate-limit, and `401` when the api key is missing or wrong
- **AND** each status maps to the same error class as before the refactor

#### Scenario: gRPC SubscriptionService method set unchanged
- **WHEN** a gRPC client invokes any of `Subscribe`, `ConfirmSubscription`, `Unsubscribe`, `GetSubscriptions`
- **THEN** the method is served by the gRPC adapter
- **AND** the response shape matches the `proto/subscription.proto` definitions exactly

# Spec Delta: release-notification

## ADDED Requirements

### Requirement: Notify Subscribers Use Case

A `NotifySubscribersUseCase` application class SHALL implement the inbound `NotifySubscribers` port. Given a release notification payload (repository, tag, releaseUrl, subscribers), it MUST send one email per subscriber via the `Mailer` port using `Mailer.sendReleaseNotification`, with the unsubscribe URL produced by the `SubscriptionLinkBuilder` port. Per-subscriber failures MUST be isolated so one failed send does not abort fan-out and MUST NOT cause the use case to throw.

#### Scenario: Each subscriber receives one notification email
- **WHEN** the use case runs with a payload containing 3 subscribers
- **THEN** `Mailer.sendReleaseNotification` is called exactly 3 times — once per subscriber — with `(email, repo, tag, releaseUrl, unsubscribeUrl)`
- **AND** the unsubscribe URL is `SubscriptionLinkBuilder.buildUnsubscribeUrl(subscriber.unsubscribeToken)`

#### Scenario: One failed send does not abort the others
- **WHEN** `Mailer.sendReleaseNotification` rejects for the second subscriber
- **THEN** the calls for the first and third subscribers still complete
- **AND** the use case does not throw

#### Scenario: Per-subscriber failures are observable
- **WHEN** a per-subscriber send fails
- **THEN** the failure is logged at error level with `{ email, repo }`
- **AND** the consumer adapter increments `notificationsSentTotal{status='failure'}` for that send

### Requirement: Queue Consumer Inbound Adapter

The queue consumer SHALL live at `src/adapters/inbound/queue/notification-consumer.adapter.ts` and MUST: (a) subscribe to the queue via the `NotificationConsumer` outbound port, (b) parse and validate every message with Zod before invoking the use case, (c) emit `notificationsSentTotal` per outcome, and (d) handle ack / republish-with-retry / DLQ semantics through the outbound port — not inline. The `NotifySubscribers` use case MUST NOT import any AMQP library.

#### Scenario: Consumer adapter is the only AMQP entry point for notifications
- **WHEN** a grep searches for `import .* from ['\"]amqplib['\"]` under `src/`
- **THEN** matches reside only under `src/adapters/outbound/queue/rabbitmq/**`
- **AND** no match resides under `src/application/**`

#### Scenario: Retry and DLQ policy preserved
- **WHEN** the message handler throws (e.g. parse error)
- **THEN** the `NotificationConsumer` adapter republishes with `x-retry-count` incremented, up to 3 times
- **AND** after the third failure the adapter nacks without requeue so RabbitMQ routes the message to `release.notifications.dead`

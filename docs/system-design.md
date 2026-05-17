# System Design: GitHub Release Notifier

## 1. Overview

The service tracks GitHub repositories and sends email notifications to subscribers when new releases appear. A user subscribes to a repository, confirms their email, and from that point receives a message every time a new release is published.

---

## 2. Requirements

### Functional

| #  | Requirement                                                                                   |
|----|-----------------------------------------------------------------------------------------------|
| F1 | A user can subscribe to a repository by providing an email and `owner/repo`                   |
| F2 | A subscription becomes active only after email confirmation (double opt-in)                   |
| F3 | A user can unsubscribe via a unique token included in every notification email                |
| F4 | A user can retrieve a list of their subscriptions by email                                    |
| F5 | The service automatically detects new GitHub releases every 10 minutes                        |
| F6 | When a new release is detected, all confirmed subscribers of that repository receive an email |
| F7 | All features are accessible via both REST API and gRPC                                        |

### Non-Functional

| #  | Requirement                                                                                                             |
|----|-------------------------------------------------------------------------------------------------------------------------|
| N1 | **Reliable delivery:** release notification messages are never silently lost; message-level processing failures (parse/validation errors, unexpected throws) trigger up to 3 retries, then DLQ. Individual per-subscriber SMTP failures are logged and metricked but do not trigger message retry. |
| N2 | **Fault tolerance:** temporary unavailability of RabbitMQ or SMTP must not interrupt the scanner                        |
| N3 | **Observability:** Prometheus metrics for HTTP, GitHub API, scanner, and notifications; structured Pino logs            |
| N4 | **Graceful shutdown:** on SIGTERM the service finishes active requests and closes all connections (DB, RabbitMQ, Redis) |
| N5 | **Security:** optional API key (`X-API-Key` header) to protect `/api/*` endpoints; `/health` and `/metrics` remain public regardless |
| N6 | **Consistency:** subscription is an atomic operation (find-or-create repo + create subscription in one transaction)     |

### Constraints

- **GitHub API rate limit:** 60 req/h unauthenticated, 5000 req/h with a token. With a 10-minute cron and N tracked repositories: `N × 6` requests/hour. A token is mandatory for more than ~10 repositories.
- **SMTP:** an external provider; latency and availability are outside the service's control – hence the queue.
- **Single process:** the current architecture is a monolithic Node.js process. Horizontal scaling will require an external scheduler for the cron job (to prevent parallel scan runs).

---

## 3. Load Estimation

```
New subscriptions:   ~100–500 /day   →  < 1 req/s      (not a bottleneck)
Confirmations:       ~100–500 /day   →  < 1 req/s
Scanning:            every 10 min    →  N GitHub API requests per run
Email notifications: (N repos) × (K subscribers/repo) per 10 min window
```

**Scenario: 1,000 repositories, 50 subscribers each**

- GitHub API: 1,000 req / 10 min = 100 req/min = 1.7 req/s – well within the authenticated limit (5,000/h)
- Email at 10% repos releasing per cycle: 100 repos × 50 = 5,000 emails/scan – a queue is essential; synchronous SMTP cannot handle this
- Redis cache for `getRepository` reduces pressure when multiple users subscribe to the same repo

**Data at rest (PostgreSQL):**

```
repositories:  1,000 rows × ~200 bytes ≈ 200 KB
subscriptions: 50,000 rows × ~300 bytes ≈ 15 MB
```

Negligible. The bottleneck is the external GitHub API and SMTP, not the database.

---

## 4. Architecture

```
                              ┌─────────────────────────────────────────────────────┐
                              │                  Node.js Process                    │
                              │                                                     │
  Client (REST)  ──HTTP:3000──►  ┌─────────────────────────────────────────────┐   │
                              │  │            Fastify REST Server              │   │
  Client (gRPC)  ──gRPC:50051─►  │  POST /api/subscribe                       │   │
                              │  │  GET  /api/confirm/:token                  │   │
                              │  │  GET  /api/unsubscribe/:token              │   │
                              │  │  GET  /api/subscriptions                   │   │
                              │  │  GET  /health   GET /metrics               │   │
                              │  └──────────────┬──────────────────────────────┘   │
                              │                 │                                   │
                              │  ┌──────────────▼──────────────────────────────┐   │
                              │  │            SubscriptionService              │   │
                              │  │  subscribe() confirm() unsubscribe()        │   │
                              │  │  getSubscriptionsByEmail()                  │   │
                              │  └──────────────┬──────────────────────────────┘   │
                              │                 │                                   │
                              │      ┌──────────┴──────────┐                       │
                              │      │                     │                       │
                              │  ┌───▼────┐          ┌─────▼────┐                 │
                              │  │UnitOf  │          │  GitHub  │                 │
                              │  │Work    │          │  Client  │                 │
                              │  │(tx)    │          │+CacheLayer│                │
                              │  └───┬────┘          └──────────┘                 │
                              │      │                                             │
                              │   ┌──▼──┐                                         │
                              │   │ DB  │  ◄─── PostgreSQL (port 5432)            │
                              │   └─────┘                                         │
                              │                                                    │
                              │  ┌──────────────────────────────────────────────┐ │
                              │  │               Scanner (cron */10 * * * *)    │ │
                              │  │                                              │ │
                              │  │  getRepositoriesWithActiveSubscriptions()    │ │
                              │  │   └─► GitHub API (getLatestRelease)          │ │
                              │  │        └─► if new tag: publish to queue      │ │
                              │  │             └─► updateLastSeenTag in DB      │ │
                              │  └───────────────────────┬──────────────────────┘ │
                              │                          │ publish                 │
                              │                          ▼                         │
                              │              ┌───────────────────────┐             │
                              │              │  release.notifications │             │
                              │              │      (RabbitMQ)        │             │
                              │              └───────────┬───────────┘             │
                              │                          │ consume                 │
                              │  ┌───────────────────────▼──────────────────────┐ │
                              │  │           NotificationService                │ │
                              │  │   sendReleaseNotification(email, ...)         │ │
                              │  │   ack / retry (x-retry-count) / DLQ          │ │
                              │  └───────────────────────┬──────────────────────┘ │
                              │                          │                         │
                              └──────────────────────────┼─────────────────────────┘
                                                         │ SMTP
                                                         ▼
                                                  [Email Provider]


Infrastructure:
  PostgreSQL  ──── persistent data (subscriptions, repositories)
  Redis       ──── GitHub API response cache (TTL-based)
  RabbitMQ    ──── async event bus (scanner → notifier)
```

---

## 5. Component Design

### 5.1 Fastify REST Server

**Responsibility:** HTTP transport, request validation, authentication.

- `api-key.plugin` – validates the `X-API-Key` header when `API_KEY` is set in the environment. `/api/*` endpoints are protected only when `API_KEY` is set; `/health` and `/metrics` remain public regardless.
- `error-handler.plugin` – maps the `AppError` hierarchy to HTTP status codes: `NotFoundError → 404`, `ConflictError → 409`, `UnauthorizedError → 401`, `RateLimitError → 429`.
- `health.plugin` – `GET /health` returns `200 OK`; used by Docker healthcheck and load balancers.
- `metrics.plugin` – `GET /metrics` exposes the Prometheus scrape endpoint.
- Schema validation – Zod via `fastify-type-provider-zod`; validation errors automatically produce `400 Bad Request`.

### 5.2 gRPC Server

**Responsibility:** binary transport for machine-to-machine integrations.

- Defined in `proto/subscription.proto` – 4 RPC methods: `Subscribe`, `ConfirmSubscription`, `Unsubscribe`, `GetSubscriptions`.
- `subscription.grpc.ts` – a thin adapter that converts protobuf messages into `SubscribeInput` / tokens and delegates to the same `SubscriptionService` used by REST.
- `grpc-error.mapper.ts` – maps `AppError` to gRPC status codes: `NOT_FOUND`, `ALREADY_EXISTS`, `UNAUTHENTICATED`, `RESOURCE_EXHAUSTED`.
- Listens on port `50051` independently of the REST server.

### 5.3 SubscriptionService

**Responsibility:** business logic for subscribe / confirm / unsubscribe.

```
subscribe(input):
  1. GithubClient.getRepository(owner, repo)  ← validate the repo exists on GitHub
  2. UnitOfWork.run():
     a. repositories.findOrCreate(owner, repo)
     b. subscriptions.createSubscription({ email, repositoryId })
        └─ UniqueConstraintError → ConflictError(409)
  3. MailerService.sendConfirmationEmail(email, confirmUrl)

confirm(token):
  1. subscriptions.findByConfirmToken(token)  ← NotFoundError if missing
  2. subscriptions.confirm(id)                ← SET confirmed = true

unsubscribe(token):
  1. subscriptions.findByUnsubscribeToken(token)
  2. subscriptions.deleteById(id)
```

**UnitOfWork** wraps steps 2a + 2b in `db.transaction()`. Both repositories inside receive the `tx` client, so a failure at step 2b automatically rolls back step 2a.

### 5.4 Scanner

**Responsibility:** detecting new releases on GitHub.

```
scan():
  repos = repositoryRepository.getRepositoriesWithActiveSubscriptions()
  Promise.allSettled(repos.map(scanRepository))   ← parallel, failure-isolated

scanRepository(repo, subscribers):
  release = GithubClient.getLatestRelease(owner, repo)
  if release.tagName == repo.lastSeenTag → skip
  notificationPublisher.publish({ owner, repo, newTag, releaseUrl, subscribers })
  repositoryRepository.updateLastSeenTag(repo.id, release.tagName)
```

`Promise.allSettled` ensures that a failure for one repository (rate limit, network error) does not cancel the scan of others.

### 5.5 NotificationQueue / NotificationService

**Responsibility:** reliable async email delivery.

```
consume loop:
  msg = channel.consume('release.notifications')
  payload = JSON.parse + Zod validate

  if ok:
    sendReleaseNotification(email) for each subscriber (Promise.allSettled)
    // Promise.allSettled never throws — per-subscriber SMTP failures are
    // logged and metricked; they do NOT trigger retry or DLQ
    channel.ack(msg)

  if error (parse / validation failure or unexpected throw):
    // retry/DLQ applies only to message-level handler failures, not per-email SMTP errors
    retryCount = msg.headers['x-retry-count'] ?? 0
    if retryCount < 3:
      channel.sendToQueue(queue, msg.content, { headers: { x-retry-count: retryCount+1 } })
      channel.ack(msg)
    else:
      channel.nack(msg, false, false)  → DLX → DLQ
```

### 5.6 GithubClient + CacheService

**Responsibility:** GitHub API isolation and caching.

- `getRepository` is cached in Redis with a TTL (env `GITHUB_CACHE_TTL_SECONDS`). `getLatestRelease` is intentionally not cached – fresh data is required for release detection.
- On 429 or 403 with `x-ratelimit-remaining: 0` – `RateLimitError` is thrown. The scanner logs it as `warn`, not `error`, to avoid alert noise.
- `CacheService.get` validates cached values through a Zod schema – on invalid data it gracefully returns `null` (cache miss) after logging a warning, preventing failures from stale or corrupted cache entries.

---

## 6. Data Model

```
repositories
┌─────────────┬────────────────┬──────────────────────────────────────────┐
│ id          │ uuid PK        │ gen_random_uuid()                        │
│ owner       │ varchar(256)   │ GitHub username / org                    │
│ repo        │ varchar(256)   │ Repository name                          │
│ last_seen_tag│ varchar(256)  │ Last known tag; NULL = never scanned     │
│ created_at  │ timestamptz    │                                          │
│ updated_at  │ timestamptz    │                                          │
├─────────────┴────────────────┴──────────────────────────────────────────┤
│ UNIQUE (owner, repo)                                                    │
└─────────────────────────────────────────────────────────────────────────┘

subscriptions
┌──────────────────┬────────────────┬──────────────────────────────────────┐
│ id               │ uuid PK        │                                      │
│ email            │ varchar(256)   │                                      │
│ repository_id    │ uuid FK        │ → repositories.id ON DELETE CASCADE  │
│ confirmed        │ boolean        │ DEFAULT false                        │
│ confirm_token    │ varchar(64)    │ UNIQUE; for email confirmation        │
│ unsubscribe_token│ varchar(64)    │ UNIQUE; for unsubscribing from email  │
│ created_at       │ timestamptz    │                                      │
│ updated_at       │ timestamptz    │                                      │
├──────────────────┴────────────────┴──────────────────────────────────────┤
│ UNIQUE (email, repository_id)                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Relationship:** `repositories` 1 → N `subscriptions`. Cascade delete: removing a repository automatically removes all its subscriptions (repositories are not currently deleted via API, but the protection is in place).

---

## 7. API Reference

### REST (port 3000)

| Method | Path                        | Auth     | Description                        |
|--------|-----------------------------|----------|------------------------------------|
| `POST` | `/api/subscribe`            | Optional | Subscribe. Body: `{ email, repo }` |
| `GET`  | `/api/confirm/:token`       | Optional | Confirm subscription               |
| `GET`  | `/api/unsubscribe/:token`   | Optional | Unsubscribe                        |
| `GET`  | `/api/subscriptions?email=` | Optional | List subscriptions by email        |
| `GET`  | `/health`                   | No       | Health check                       |
| `GET`  | `/metrics`                  | No       | Prometheus metrics                 |

**Authentication:** `X-API-Key: <key>` header, applied to `/api/*` routes only when `API_KEY` is set in the environment. The key is optional to accommodate development environments and self-hosted deployments where access control is already enforced at the infrastructure level (e.g. reverse proxy, VPN). `/health` and `/metrics` are always public.

**Response codes:**
- `200` – success
- `400` – validation error (invalid email, wrong repo format)
- `401` – missing or incorrect API key
- `404` – token not found / repository does not exist on GitHub
- `409` – subscription already exists
- `429` – GitHub rate limit hit

### gRPC (port 50051)

```protobuf
service SubscriptionService {
  rpc Subscribe           (SubscribeRequest)         returns (SubscribeResponse);
  rpc ConfirmSubscription (TokenRequest)             returns (ConfirmResponse);
  rpc Unsubscribe         (TokenRequest)             returns (UnsubscribeResponse);
  rpc GetSubscriptions    (GetSubscriptionsRequest)  returns (GetSubscriptionsResponse);
}
```

Same business logic as REST – both transports delegate to `SubscriptionService`.

---

## 8. Data Flows

### Subscription

```
Client
  │  POST /api/subscribe { email, repo }
  ▼
Fastify → SubscriptionService.subscribe()
  │
  ├─1─ GithubClient.getRepository("owner", "repo")
  │       ├─ Redis HIT  → return cached data
  │       └─ Redis MISS → GitHub API → cache → return
  │
  ├─2─ UnitOfWork.run(tx):
  │       ├─ repositories.findOrCreate(owner, repo)   [INSERT ... ON CONFLICT DO NOTHING]
  │       └─ subscriptions.createSubscription(...)    [INSERT; unique violation → 409]
  │
  └─3─ MailerService.sendConfirmationEmail(email, confirmUrl)

Response: 200 OK
```

### New Release Detection and Notification

```
node-cron (every 10 min)
  │
  ▼
ScannerService.scan()
  │
  ├─ DB: getRepositoriesWithActiveSubscriptions()
  │
  └─ for each repo (in parallel):
       │
       ├─ GithubClient.getLatestRelease(owner, repo)  → GitHub API
       │
       ├─ if tagName == lastSeenTag → skip
       │
       ├─ NotificationQueue.publish({ owner, repo, newTag, releaseUrl, subscribers })
       │       └─ RabbitMQ: sendToQueue('release.notifications', msg, { persistent: true })
       │
       └─ DB: updateLastSeenTag(repo.id, newTag)

                    ↓ async (separate consumer)

NotificationService (listening on 'release.notifications')
  │
  ├─ parse + validate payload (Zod)
  │
  ├─ for each subscriber (Promise.allSettled):
  │       MailerService.sendReleaseNotification(email, repo, tag, url, unsubscribeUrl)
  │
  ├─ ack message (regardless of per-subscriber SMTP outcome)
  └─ per-subscriber SMTP failures: logged + metrics only (no per-email retry)
     handler/parse errors → retry (up to 3×) → DLQ
```

---

## 9. Infrastructure and Deployment

### Local Development

`docker-compose.yml` including the `notifier-api` container. For local development, bring up only the infrastructure services and run the app directly:

```bash
docker compose up -d notifier-postgres notifier-redis notifier-rabbitmq
npm run dev   # tsx watch – hot reload
```

Exposed ports (host → container):
- PostgreSQL: `${POSTGRES_PORT:-5432}:5432`
- Redis: `6379:6379`
- RabbitMQ: `5672:5672` (AMQP), `15672:15672` (management UI)

### Production

```bash
docker compose -f docker-compose.prod.yml up 
```

The service runs as a single Docker container; infrastructure services run as separate containers in the same network.

**Environment variables (required):**

| Variable       | Description                                                      |
|----------------|------------------------------------------------------------------|
| `DATABASE_URL` | PostgreSQL connection string                                     |
| `REDIS_URL`    | Redis connection string                                          |
| `RABBITMQ_URL` | RabbitMQ AMQP URL                                                |
| `SMTP_HOST`    | SMTP server host                                                 |
| `SMTP_USER`    | SMTP login                                                       |
| `SMTP_PASS`    | SMTP password                                                    |
| `APP_URL`      | Public service URL (used in confirm/unsubscribe links in emails) |
| `GITHUB_TOKEN`            | *(optional)* GitHub PAT for 5,000 req/h instead of 60            |
| `GITHUB_CACHE_TTL_SECONDS`| *(optional)* Redis TTL for `getRepository` responses (default: 3600) |
| `API_KEY`                 | *(optional)* Key to protect `/api/*` endpoints                   |

### Integration Tests

```bash
npm run test:integration  # docker-compose.integration.yml: PG:5433, Redis:6380, RabbitMQ:5673
```

Separate ports prevent conflicts with the local dev environment during test runs.

---

## 10. Observability

### Metrics (Prometheus)

| Metric                          | Type      | Labels                           |
|---------------------------------|-----------|----------------------------------|
| `http_requests_total`           | Counter   | `method`, `route`, `status_code` |
| `http_request_duration_seconds` | Histogram | `method`, `route`                |
| `github_api_requests_total`     | Counter   | `operation`, `cache` (hit/miss)  |
| `scanner_runs_total`            | Counter   | –                                |
| `scanner_new_releases_total`    | Counter   | –                                |
| `notifications_sent_total`      | Counter   | `status` (success/failure)       |

Also included – default Node.js metrics: event loop lag, heap usage, GC, active handles.

### Logging

Pino (structured JSON) with `info` / `warn` / `error` levels:
- `[Queue]` – RabbitMQ connection lifecycle, reconnect attempts
- `[Scanner]` – scan start/finish, new releases detected, rate limit warnings
- `[Notifier]` – email delivery failures with details
- `[Cache]` – stale/invalid cache hits, Redis errors

### Graceful Shutdown

On `SIGTERM`:
1. Fastify – `server.close()` (stops accepting new requests, finishes active ones)
2. gRPC – `server.tryShutdown()`
3. RabbitMQ – `channel.close()` → `connection.close()`
4. PostgreSQL pool – `pool.end()`
5. Redis – `client.quit()`

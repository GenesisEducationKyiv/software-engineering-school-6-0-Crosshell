# GitHub Release Notifier

> Backend service that monitors GitHub repositories for new releases and delivers email notifications to confirmed subscribers.

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3-FF6600?logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![CI](https://github.com/Crosshell/github-release-notifier/actions/workflows/ci.yml/badge.svg)](https://github.com/Crosshell/github-release-notifier/actions/workflows/ci.yml)

---

## Live Demo - Deployed on Google Cloud Platform

The service is fully deployed and publicly accessible on **Google Cloud Platform (GCP)**.

| Interface          | Address                          |
|--------------------|----------------------------------|
| Web UI & REST API  | http://34.39.126.25:3000/        |
| gRPC API           | `34.39.126.25:50051`             |
| Health check       | http://34.39.126.25:3000/health  |
| Prometheus metrics | http://34.39.126.25:3000/metrics |

> **Authentication:** All API endpoints are protected by an API Key. Include the header `x-api-key: noti123321noti` in every request. Requests without a valid key will be rejected with `401 Unauthorized`.

---

## Features

### Core Requirements

- [x] **Subscribe** - register an email address to receive release notifications for a given GitHub repository
- [x] **Email confirmation** - subscriptions are activated only after clicking a confirmation link sent via email
- [x] **Unsubscribe** - one-click unsubscribe flow using a unique token
- [x] **Release scanner** - background cron job polls the GitHub API every 10 minutes and detects new releases
- [x] **Async email delivery** - new releases are published to RabbitMQ; a dedicated consumer reads the queue and sends notification emails
- [x] **List subscriptions** - query all active subscriptions for a given email address

### Bonus Requirements (All Implemented)

- [x] **Static HTML frontend** - interactive UI served at the root, with dedicated pages for subscribing (`/`), confirming (`/confirm.html`), and unsubscribing (`/unsubscribe.html`)
- [x] **gRPC interface** - full gRPC server mirroring every REST endpoint, with API key authentication via request metadata
- [x] **Redis caching** - GitHub API responses cached in Redis with a configurable TTL (default: 600 seconds / 10 minutes) to avoid rate-limit exhaustion
- [x] **API Key authentication** - all REST and gRPC endpoints are guarded by a static `x-api-key` header; configurable via the `API_KEY` environment variable
- [x] **Prometheus metrics** - `http_requests_total` (labelled by method, route, status code) and `http_request_duration_seconds` exposed at `GET /metrics`
- [x] **GitHub Actions CI** - two pipelines run on every push and pull request to `main`: `ci.yml` (type-checking, linting, build) and `test.yml` (unit tests + integration tests against real PostgreSQL, Redis, and RabbitMQ service containers)

---

## Architecture

> For layers and module boundaries (dependency rules, how they're enforced), see [docs/architecture.md](docs/architecture.md). For the full system design (requirements, API, deployment, observability), see [docs/system-design.md](docs/system-design.md).

The service is a **monolithic Node.js application** composed of four concurrent subsystems started from a single entry point.

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Release Notifier                │
│                                                             │
│  ┌──────────────────┐        ┌──────────────────────────┐   │
│  │  Fastify REST    │        │       gRPC Server        │   │
│  │  (port 3000)     │        │      (port 50051)        │   │
│  │                  │        │                          │   │
│  │  Static UI       │        │  subscription.proto      │   │
│  │  /api/* routes   │        │  @grpc/grpc-js           │   │
│  │  /health         │        │                          │   │
│  │  /metrics        │        └──────────┬───────────────┘   │
│  └────────┬─────────┘                   │                   │
│           │                             │                   │
│           └──────────────┬──────────────┘                   │
│                          ▼                                   │
│              ┌───────────────────────┐                      │
│              │   SubscriptionService │                      │
│              │   + SubscriptionRepo  │                      │
│              └───────────┬───────────┘                      │
│                          │                                   │
│           ┌──────────────┼──────────────┐                   │
│           ▼              ▼              ▼                   │
│      PostgreSQL      RabbitMQ        Mailer                 │
│      (Drizzle ORM)   Publisher      (Nodemailer)            │
│                                                             │
│  ┌──────────────────┐   ┌──────────────────────────────┐   │
│  │  Scanner (cron)  │   │   Notification Consumer      │   │
│  │                  │   │                              │   │
│  │  node-cron       │──▶│  Reads release.notifications │   │
│  │  GitHub API      │   │  queue → sends emails        │   │
│  │  Redis cache     │   │  DLQ after 3 failed retries  │   │
│  └──────────────────┘   └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Request Lifecycle

1. A user submits their email and a repository slug (`owner/repo`) via the Web UI or API.
2. The service stores a pending subscription and sends a confirmation email containing a unique token link.
3. The user clicks the link; the subscription is marked as confirmed.
4. The **Scanner** runs on a cron schedule (`*/10 * * * *` by default). For each tracked repository it fetches the latest release from the GitHub API - results are cached in Redis to stay within rate limits. When a new release tag is detected, a JSON message is published to the `release.notifications` RabbitMQ queue.
5. The **Notification Consumer** reads from the queue and emails every confirmed subscriber. Failed messages are retried up to 3 times before being routed to a dead-letter queue (`release.notifications.dead`).

### Tech Stack

| Layer            | Technology                                                                         |
|------------------|------------------------------------------------------------------------------------|
| Runtime          | Node.js 22                                                                         |
| Language         | TypeScript 5                                                                       |
| HTTP framework   | Fastify 5 with Zod type provider                                                   |
| RPC              | gRPC (`@grpc/grpc-js`), contracts managed by [buf](https://buf.build) + `ts-proto` |
| ORM              | Drizzle ORM                                                                        |
| Database         | PostgreSQL 16                                                                      |
| Cache            | Redis 7 (ioredis)                                                                  |
| Message queue    | RabbitMQ 3 (amqplib)                                                               |
| Email            | Nodemailer (SMTP)                                                                  |
| Scheduler        | node-cron                                                                          |
| Validation       | Zod                                                                                |
| Logging          | Pino                                                                               |
| Metrics          | prom-client (Prometheus)                                                           |
| Testing          | Vitest + MSW + vitest-mock-extended                                                |
| Containerisation | Docker + Docker Compose                                                            |

---

## API Reference

### Authentication

All protected endpoints require the `x-api-key` header:

```
x-api-key: <your-api-key>
```

If the `API_KEY` environment variable is not set, authentication is disabled and all endpoints are publicly accessible.

### REST Endpoints (`/api/*`)

All subscription routes are mounted under the `/api` prefix.

| Method | Path                        | Description                                                                                                                                           |
|--------|-----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| `POST` | `/api/subscribe`            | Subscribe an email to a repository's releases                                                                                                         |
| `GET`  | `/api/confirm/:token`       | Confirm a subscription using the token from the email                                                                                                 |
| `GET`  | `/api/unsubscribe/:token`   | Cancel a subscription using its unsubscribe token                                                                                                     |
| `GET`  | `/api/subscriptions?email=` | List all subscriptions for a given email address                                                                                                      |
| `GET`  | `/health`                   | Liveness check - returns `{ "status": "ok" }`                                                                                                         |
| `GET`  | `/metrics`                  | Prometheus metrics (plain text)                                                                                                                       |

**POST /api/subscribe - Request body**

```json
{
  "email": "user@example.com",
  "repo": "owner/repository"
}
```

### gRPC Interface

The gRPC server runs on port `50051` and exposes the **external-facing** `SubscriptionService`, mirroring every REST route above for outside clients. The API key must be supplied in request metadata under `x-api-key`.

| RPC method            | Equivalent REST route         |
|-----------------------|-------------------------------|
| `Subscribe`           | `POST /api/subscribe`         |
| `ConfirmSubscription` | `GET /api/confirm/:token`     |
| `Unsubscribe`         | `GET /api/unsubscribe/:token` |
| `GetSubscriptions`    | `GET /api/subscriptions`      |

Both this contract and the internal one below are defined under [`proto/`](proto/), managed by [buf](https://buf.build) and compiled with `ts-proto` into `src/generated/` - no runtime `.proto` parsing.

---

## Saga Confirmation Email: RabbitMQ vs gRPC

The confirmation-email step of the `SUBSCRIBE` saga is a synchronous, internal call between two existing services - the API service's `SubscribeSagaOrchestrator` publishes a command and blocks awaiting a typed reply before completing or compensating the saga. That existing call, not a newly invented one, is the gRPC candidate for this increment: it now has a second, interchangeable transport alongside the original RabbitMQ one.

```
[API service: SubscribeSagaOrchestrator] --RabbitMQ (default) or gRPC--> [SagaMailService (notifier worker)]
```

**Contract:** [`proto/saga/v1/saga.proto`](proto/saga/v1/saga.proto) - a single `SendConfirmationEmail` RPC, managed by the same buf + `ts-proto` pipeline as `SubscriptionService` (see [`buf.yaml`](buf.yaml) / [`buf.gen.yaml`](buf.gen.yaml)).

**Transport selection:** the notifier worker always runs both server-side implementations ([`saga-command.handler.ts`](src/notifier/saga-command.handler.ts) for the queue, [`saga-mail.grpc.ts`](src/notifier/saga-mail.grpc.ts) for gRPC); the API service's `SAGA_MAIL_TRANSPORT` env var (`queue` default, or `grpc`) picks which one the orchestrator calls - see [Environment Variables](#environment-variables).

**Error handling:** a gRPC failure maps to `INTERNAL` via the same error mapper `SubscriptionService` uses. Either transport failing triggers identical saga compensation, so the caller sees the same outcome regardless of which one is configured - covered in `subscribe-saga.orchestrator.spec.ts`.

### Throughput comparison

`ghz` doesn't have a RabbitMQ equivalent, so the queue side is measured with a small purpose-built harness ([`scripts/bench-queue-transport.ts`](scripts/bench-queue-transport.ts), `npm run bench:queue`) that drives the same `SagaCommandsQueue` class the orchestrator uses - publish a command, await the matching reply by `correlationId`. Both benchmarks talk to a notifier worker pointed at a local MailHog instance (so SMTP round-trip time doesn't dominate the numbers), same concurrency and duration:

```bash
npm run bench:queue -- 50 10000                                       # 50 concurrent, 10s

ghz --insecure --proto proto/saga/v1/saga.proto \
  --call saga.v1.SagaMailService.SendConfirmationEmail \
  -d '{"correlationId":"bench","email":"bench@example.com","confirmUrl":"http://localhost/confirm","unsubscribeUrl":"http://localhost/unsubscribe"}' \
  -c 50 -z 10s localhost:50052
```

|              | RabbitMQ | gRPC    | Δ        |
|--------------|----------|---------|----------|
| Requests/sec | ~575     | ~1,058  | **+84%** |
| Avg latency  | 86.6 ms  | 47.1 ms | **-46%** |
| p99 latency  | 139.1 ms | 69.0 ms | **-50%** |

The gap comes from the shape of each transport, not serialization: the queue path is a publish and a separate consume on each leg (command in, reply out - four broker round-trips per request), while gRPC is one connection carrying a direct request/response. Both eventually call the exact same `IMailerService.sendConfirmationEmail`, so this isolates transport overhead specifically.

---

## Local Development

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [Docker](https://www.docker.com/) and Docker Compose

### 1. Clone the repository

```bash
git clone https://github.com/Crosshell/github-release-notifier.git
cd github-release-notifier
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values (see [Environment Variables](#environment-variables) below).

### 3. Start infrastructure services

```bash
docker compose up -d
```

This starts PostgreSQL, RabbitMQ, and Redis in the background. The application container waits for all three health checks to pass before starting.

### 4. Apply database migrations

```bash
npm run db:migrate
```

### 5. Start the development server

```bash
npm install
npm run dev
```

The REST API will be available at `http://localhost:3000` and the gRPC server at `localhost:50051`.

> For hot-reload during development, `npm run dev` uses `tsx watch` and restarts on every file change.

### Useful commands

```bash
npm run build          # Compile TypeScript to dist/ via tsup
npm start              # Run the production build
npm run typecheck      # Run tsc --noEmit (zero-emit type check)
npm run lint           # Run ESLint across src/
npm run lint:fix       # Auto-fix ESLint violations
npm run db:studio      # Open Drizzle Studio (visual DB browser)
```

---

## Environment Variables

### Required

| Variable       | Description                                                                                                            |
|----------------|------------------------------------------------------------------------------------------------------------------------|
| `DATABASE_URL` | PostgreSQL connection string - e.g. `postgresql://user:pass@localhost:5432/notifier`                                   |
| `RABBITMQ_URL` | RabbitMQ AMQP connection string - e.g. `amqp://localhost:5672`                                                         |
| `REDIS_URL`    | Redis connection string - e.g. `redis://localhost:6379`                                                                |
| `SMTP_HOST`    | SMTP server hostname                                                                                                   |
| `SMTP_USER`    | SMTP authentication username                                                                                           |
| `SMTP_PASS`    | SMTP authentication password                                                                                           |
| `APP_URL`      | Public base URL of the service - used to build confirmation/unsubscribe links in emails (e.g. `http://localhost:3000`) |

### Optional

| Variable                   | Default                                            | Description                                                                                                                                                              |
|----------------------------|----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `NODE_ENV`                 | `production`                                       | Runtime environment - `development`, `production`, or `test`                                                                                                             |
| `APP_PORT` / `PORT`        | `3000`                                             | Port for the Fastify HTTP server                                                                                                                                         |
| `GRPC_PORT`                | `50051`                                            | Port for the gRPC server                                                                                                                                                 |
| `API_KEY`                  | _(none)_                                           | Static API key required in the `x-api-key` header. When unset, all endpoints are publicly accessible                                                                     |
| `GITHUB_TOKEN`             | _(none)_                                           | GitHub personal access token. Without it the GitHub API rate limit is 60 req/hour; with it the limit rises to 5,000 req/hour                                             |
| `GITHUB_BASE_URL`          | `https://api.github.com`                           | Base URL for GitHub API requests (useful for testing against mocks)                                                                                                      |
| `GITHUB_CACHE_TTL_SECONDS` | `600`                                              | How long (in seconds) GitHub API responses are cached in Redis                                                                                                           |
| `SCANNER_CRON`             | `*/10 * * * *`                                     | Cron expression controlling how often the release scanner runs                                                                                                           |
| `SMTP_PORT`                | `587`                                              | SMTP server port                                                                                                                                                         |
| `SMTP_FROM`                | `"GitHub Release Notifier" <noreply@releases.app>` | The `From` address on outgoing emails                                                                                                                                    |
| `POSTGRES_DB`              | _(none)_                                           | Used by the bundled `docker-compose.yml` to create the database                                                                                                          |
| `POSTGRES_USER`            | _(none)_                                           | Used by the bundled `docker-compose.yml`                                                                                                                                 |
| `POSTGRES_PASSWORD`        | _(none)_                                           | Used by the bundled `docker-compose.yml`                                                                                                                                 |
| `NOTIFIER_WORKER_PORT`     | `3002`                                             | Notifier worker's `/health` and `/metrics` port                                                                                                                          |
| `SAGA_GRPC_PORT`           | `50052`                                            | Notifier worker's internal gRPC port for the confirmation-email service (not published to the host, see [confirmation-email](#saga-confirmation-email-rabbitmq-vs-grpc)) |
| `SAGA_MAIL_TRANSPORT`      | `queue`                                            | `queue` or `grpc` - which transport the orchestrator uses to send the confirmation email                                                                                 |
| `SAGA_GRPC_URL`            | `localhost:50052`                                  | Where the API service reaches that gRPC port, used when `SAGA_MAIL_TRANSPORT=grpc`                                                                                       |
| `SAGA_GRPC_DEADLINE_MS`    | `10000`                                            | Deadline for the gRPC call before it's treated as a failure                                                                                                              |

---

## Database Schema

The service uses two tables managed by Drizzle ORM:

- **`repositories`** - stores each unique `owner/repo` pair and the `last_seen_tag` to detect new releases without re-processing old ones.
- **`subscriptions`** - stores each email subscription linked to a repository, along with `confirmed` state, a `confirm_token`, and an `unsubscribe_token`. Unique constraint on `(email, repository_id)` prevents duplicate subscriptions.

---

## Testing

See [testing.md](testing.md) for instructions on running unit, integration, and E2E tests.

---

## Project Structure

```
.
├── proto/                        # Protobuf definitions
│   ├── subscription/v1/          # external SubscriptionService contract
│   └── saga/v1/                  # internal SagaMailService contract
├── buf.yaml                      # buf module + lint config (whole proto/ tree)
├── buf.gen.yaml                  # buf codegen config (ts-proto -> src/generated)
├── public/                       # Static HTML frontend (served at /)
│   ├── index.html                # Subscribe form
│   ├── confirm.html              # Confirmation landing page
│   └── unsubscribe.html          # Unsubscribe landing page
├── src/
│   ├── container.ts              # Manual dependency wiring (no DI framework)
│   ├── index.ts                  # API service entry point
│   ├── server.ts                 # Fastify instance setup
│   ├── notifier/                 # Notifier worker entry point (separate deployable)
│   ├── generated/                # buf/ts-proto generated code (do not edit)
│   │   ├── saga/v1/
│   │   └── subscription/v1/
│   ├── infrastructure/
│   │   ├── cache/                # Redis client + CacheService
│   │   ├── database/             # Drizzle client, schema, UnitOfWork
│   │   ├── grpc/                 # gRPC server bootstrap + error mapper
│   │   ├── metrics/              # prom-client registry
│   │   └── queue/                # RabbitMQ channel manager
│   ├── modules/
│   │   ├── github/               # GitHub API client
│   │   ├── mailer/               # Nodemailer service + email templates
│   │   ├── notification/         # RabbitMQ consumer + publisher
│   │   ├── repository/           # Tracked repository repository
│   │   ├── saga/                 # Subscribe saga orchestrator (RabbitMQ or gRPC transport)
│   │   ├── scanner/              # Cron-driven release scanner
│   │   └── subscription/         # Subscribe / confirm / unsubscribe logic
│   └── shared/
│       ├── config/               # Zod-validated env var configs
│       ├── errors/               # Typed application errors
│       ├── lifecycle/            # Graceful shutdown registry
│       ├── logger/               # Pino logger instance
│       └── plugins/              # Fastify plugins (auth, errors, health, metrics)
├── drizzle/                      # Auto-generated Drizzle migrations
├── docker-compose.yml            # Full stack (app + infra)
├── docker-compose.integration.yml # Integration test infra only
└── .github/workflows/
    ├── ci.yml                    # Typecheck, lint, build
    └── test.yml                  # Unit + integration tests
```

---
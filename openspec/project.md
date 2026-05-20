# Project Context

## Purpose

**GitHub Release Notifier** — a backend service that lets users subscribe (by email) to GitHub repositories and receive a notification email whenever a new release is published.

Core flows:
- **Subscribe** with email + `owner/repo`; activation requires double opt-in via a confirmation link.
- **Unsubscribe** through a one-click tokenised link delivered in every notification email.
- **Scan** every 10 minutes via a cron-driven job that polls the GitHub API, caches responses in Redis, and publishes "new release detected" events to RabbitMQ.
- **Notify** asynchronously: a queue consumer fans out emails to all confirmed subscribers.

All operations are exposed over both REST (Fastify) and gRPC, plus a tiny static HTML frontend served from `public/`.

This is a coursework project for the Genesis "Software Engineering School 6.0" track; assignments are organised by `hw<N>` scopes in commits (`feat(hw1)`, `docs(hw2)`, etc.).

## Tech Stack

| Layer            | Technology                                            |
|------------------|-------------------------------------------------------|
| Runtime          | Node.js 22                                            |
| Language         | TypeScript 5 (strict, type-checked ESLint)            |
| HTTP framework   | Fastify 5 + `fastify-type-provider-zod`               |
| RPC              | gRPC (`@grpc/grpc-js`, `@grpc/proto-loader`)          |
| ORM / migrations | Drizzle ORM + drizzle-kit                             |
| Database         | PostgreSQL 16                                         |
| Cache            | Redis 7 (`ioredis`)                                   |
| Message queue    | RabbitMQ 3 (`amqplib`) with durable queue + DLX/DLQ   |
| Email            | Nodemailer (SMTP)                                     |
| Scheduler        | `node-cron`                                           |
| Validation       | Zod 4                                                 |
| Logging          | Pino (+ pino-pretty in dev)                           |
| Metrics          | `prom-client` (Prometheus)                            |
| Testing          | Vitest 4, MSW (HTTP mocks), `vitest-mock-extended`    |
| Build            | `tsup` (single CJS bundle)                            |
| Dev runner       | `tsx watch`                                           |
| Containerisation | Docker + Docker Compose (dev, prod, test compose files)|
| CI               | GitHub Actions (`ci.yml` typecheck/lint/build, `test.yml` unit + integration) |

## Project Conventions

### Code Style

- **Prettier** (`.prettierrc`): single quotes, trailing commas everywhere, always-arrow-parens.
- **ESLint** (`eslint.config.mjs`):
  - `typescript-eslint` `recommendedTypeChecked` is enforced.
  - `@typescript-eslint/consistent-type-imports` — use `import type` for type-only imports.
  - `@typescript-eslint/no-unused-vars` — ignored when prefixed with `_`.
  - Tests (`*.spec.ts`, `*.test.ts`) relax `no-explicit-any`, `no-unsafe-assignment`, and swap the unbound-method rule for the Vitest variant.
- **No emojis** in code, comments, or commit messages.
- **Naming**:
  - Files: kebab-case with role suffixes — `<feature>.service.ts`, `<feature>.repository.ts`, `<feature>.routes.ts`, `<feature>.grpc.ts`, `<feature>.schemas.ts`, `<feature>.urls.ts`, `<feature>.spec.ts`.
  - Types: kebab-case filenames under `types/` (e.g. `vcs-release.type.ts`).
  - Config: `<topic>.config.ts` under `src/shared/config/`, aggregated in `index.ts`.
- **Imports**: TypeScript path alias `@/* → src/*` is configured in `tsconfig.json` and used pervasively (e.g. `import { server } from '@/server'`). Prefer the alias over deep relative paths.

### Architecture Patterns

- **Monolithic Node.js process** that boots four concurrent subsystems from `src/index.ts`: Fastify REST server, gRPC server, cron scanner, and RabbitMQ notification consumer.
- **Manual dependency injection** in `src/container.ts` — no DI framework. Services are constructed once and wired by hand.
- **Layered layout** under `src/`:
  - `infrastructure/` — external-system adapters (`cache/`, `database/`, `grpc/`, `metrics/`, `queue/`). Each owns its client + a thin service.
  - `modules/` — feature capabilities, one folder per bounded context (`subscription/`, `repository/`, `github/`, `mailer/`, `notification/`, `scanner/`).
  - `shared/` — cross-cutting: `config/` (Zod-validated env), `errors/` (typed app errors), `lifecycle/` (graceful-shutdown registry), `logger/`, `plugins/` (Fastify plugins: auth, error handler, health, metrics), `types/`, `constants/`.
- **Service / Repository split**: each module has a `*.service.ts` for orchestration and a `*.repository.ts` for DB access via Drizzle. The Unit-of-Work pattern (`infrastructure/database/`) wraps transactional flows like subscribe.
- **Transport-agnostic core**: REST routes (`*.routes.ts`) and gRPC handlers (`*.grpc.ts`) are thin adapters over the same service. Validation lives in `*.schemas.ts` (Zod) for REST; gRPC delegates to the same service after parsing.
- **Async-by-queue for fan-out**: the scanner publishes one persistent message per detected release; the consumer handles per-subscriber fan-out with isolation (a single recipient's failure does not poison the message).
- **Retry policy** lives in the queue layer: up to 3 republishes via `x-retry-count` header, then nack-to-DLQ (`release.notifications.dead`). Per-recipient SMTP failures are logged + metricked but do NOT throw out of the handler.
- **Graceful shutdown**: every long-lived resource registers a teardown callback with the lifecycle registry; SIGTERM drains in order.
- **Auth as a plugin**: `api-key.plugin.ts` enforces a static `x-api-key` header on protected REST routes; gRPC checks the same key via request metadata. When `API_KEY` is unset, auth is disabled — useful for local dev.
- **OpenSpec is the source of truth** for new capabilities and breaking changes — see `openspec/AGENTS.md`. Skip proposals only for bug fixes, typos, and config tweaks.

### Testing Strategy

- **Unit tests** (`src/**/*.spec.ts`): in-process, fully mocked. HTTP is mocked with **MSW**; collaborators are mocked with `vitest-mock-extended`. Run with `npm run test` (watch) or `npm run test:run`.
- **Integration tests** (`tests/integration/**`): hit real PostgreSQL, Redis, and RabbitMQ brought up by `docker-compose.test.yml` on non-default ports (e.g. PG on 5433) so they don't clash with local dev. Driven by `vitest.integration.config.ts`. Run end-to-end with `npm run test:integration` (up → run → down).
- **CI** runs both suites on every push/PR to `main` (`.github/workflows/test.yml`) with the integration job using GitHub Actions service containers.
- **Coverage expectations**: every service and Fastify plugin has a `.spec.ts` next to it. New code is expected to ship with tests.

### Git Workflow

- **Main branch**: `main`. All work goes through PRs; `main` is protected by CI.
- **Branch names**: short, kebab-case, prefix matches intent — `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `refactor/<slug>`, `chore/<slug>`. Coursework branches sometimes encode the assignment, e.g. `fix-hw2-system-design`.
- **Commit style**: Conventional Commits with an optional scope. For this repo the scope is usually the homework assignment, e.g. `docs(hw2): ...`, `feat(hw1): ...`, `refactor(hw1): ...`, `chore(hw1): ...`. Imperative mood, lowercase subject, no trailing period.
- **PRs**: merged via GitHub PR (see `Merge pull request #N` history). PRs target `main` and must pass `ci.yml` + `test.yml`.
- **Architecture decisions** live in `docs/adr/NNN-<slug>.md` (numbered, dated, "Accepted/Superseded" status).

## Domain Context

- **Repository (`owner/repo`)**: the unit the service tracks. Each unique pair is stored once in the `repositories` table together with `last_seen_tag`, which is how the scanner decides whether a release is new.
- **Subscription**: an `(email, repository_id)` association with two tokens — `confirm_token` (single-use, activates the subscription) and `unsubscribe_token` (idempotent, kills it). A unique constraint on `(email, repository_id)` prevents duplicates.
- **Double opt-in**: a subscription is created as `confirmed=false` and only flipped on `GET /api/confirm/:token`. Unconfirmed rows are still persisted (so the same person can't be repeatedly re-emailed by re-subscribing), but they do not receive release notifications.
- **Release detection** is tag-based: the scanner asks GitHub for the latest release; if its tag differs from `last_seen_tag`, it publishes a notification and updates the tag.
- **Caching**: GitHub responses are cached in Redis with a TTL (`GITHUB_CACHE_TTL_SECONDS`, default 600). The cache is keyed per repo and exists strictly to stay under the GitHub rate limit — it is not a correctness mechanism.
- **At-least-once semantics**: messages are persistent, but a crash between sending an email and acking the message can produce duplicate emails. This is an accepted trade-off.

## Important Constraints

- **GitHub API rate limit**: 60 req/hour without a token, 5,000 with `GITHUB_TOKEN`. Realistically, tracking more than a handful of repos requires the token. Hitting the limit surfaces as `429` on the API.
- **Single-process scheduler**: `node-cron` runs in-process. Horizontal scaling would cause every replica to scan in parallel and duplicate notifications — an external scheduler (or a locking mechanism) is required before scaling out.
- **Single RabbitMQ channel / consumer** per process; parallel consumption across replicas is not yet wired and would need per-process channels and careful queue topology.
- **SMTP availability** is outside the service's control — hence the queue + retry + DLQ for delivery isolation.
- **Static API key auth** is intentionally simple (single shared secret in `x-api-key`). Not multi-tenant; not suitable for end-user-facing auth.
- **Coursework context**: changes are often scoped to a specific `hw<N>` assignment. Avoid mixing unrelated work into a homework-scoped branch.

## External Dependencies

- **GitHub REST API** (`https://api.github.com`, override via `GITHUB_BASE_URL`) — the only source of release data. Optional `GITHUB_TOKEN` raises the rate limit.
- **SMTP provider** — generic, configured via `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`. Used by Nodemailer.
- **PostgreSQL 16** — primary store. Connection via `DATABASE_URL`. Schema lives in `src/infrastructure/database/`; migrations in `drizzle/`.
- **Redis 7** — cache only (not a queue, not a session store). Connection via `REDIS_URL`.
- **RabbitMQ 3** — durable queue `release.notifications` + DLX → `release.notifications.dead`. Connection via `RABBITMQ_URL`.
- **Deployment target**: GCP VM running the full Docker Compose stack (see `docker-compose.prod.yml`); Prometheus metrics scraped from `/metrics`.

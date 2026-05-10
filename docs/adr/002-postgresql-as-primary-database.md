# ADR-002: PostgreSQL as Primary Database

**Status:** Accepted

**Date:** 2026-05-08

**Author:** Vladyslav Berdychevskyi

---

## Context

The service needs persistent storage for two entities:

- **Repository** – a unique `(owner, repo)` pair plus `last_seen_tag` for new-release detection.
- **Subscription** – an `(email, repository_id)` association with confirmation and unsubscribe tokens, and a `confirmed` flag.

Key requirements for the database:

1. **Atomicity** on subscribe: the "find-or-create repository → create subscription" operation must execute within a single transaction. Partial writes are unacceptable.
2. **Unique constraints at the DB level**: `(owner, repo)`, `(email, repository_id)`, `confirm_token`, `unsubscribe_token` – a race condition between two concurrent requests must not create a duplicate.
3. **Cascading deletes**: removing a repository must automatically remove all associated subscriptions.
4. **Migrations**: the schema must evolve in a controlled manner through versioned migration files.
5. **Type-safe ORM** without raw query strings, easy to maintain.

---

## Considered Alternatives

### 1. SQLite

An embedded, file-system-based database.

**Pros:** zero infrastructure, simple local development.

**Cons:**
- File-level write lock – concurrent requests (Fastify handles requests concurrently) will produce contention.
- Poor support for `uuid` types and complex constraints without workarounds.
- Not suitable for production deployments with multiple processes or replicas.
- Drizzle supports SQLite but with type limitations (no native `uuid`, `boolean`, etc.).

### 2. MongoDB

A document database.

**Pros:** flexible schema, horizontal scalability.

**Cons:**
- Multi-document transactions arrived in v4.0 but have limited performance compared to relational databases.
- Unique constraints on composite fields require an explicit index that must be monitored separately; in PostgreSQL this is DDL-level.
- The "repository → subscriptions" relationship is naturally relational; MongoDB would require either embedding (data duplication) or references (manual joins).
- Drizzle does not support MongoDB.

### 3. MySQL / MariaDB

A relational database and direct competitor to PostgreSQL.

**Pros:** widely adopted, good documentation.

**Cons:**
- Weaker support for complex types: no native `uuid` (requires `CHAR(36)` or `BINARY(16)`), `RETURNING` clause only appeared in MariaDB 10.5+ and MySQL 8.0+.
- `ON CONFLICT DO NOTHING` / `INSERT ... ON CONFLICT` (upsert) in PostgreSQL is more expressive and reliable than `INSERT IGNORE` or `ON DUPLICATE KEY UPDATE` in MySQL.
- Drizzle supports MySQL, but some types and operators differ, complicating any future migration.

### 4. PostgreSQL

A full-featured relational DBMS.

---

## Decision

**PostgreSQL is chosen**, with Drizzle ORM and a migration workflow via `drizzle-kit`.

**Schema:**

```
repositories
─────────────────────────────────────────────
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
owner           varchar(256) NOT NULL
repo            varchar(256) NOT NULL
last_seen_tag   varchar(256)
UNIQUE (owner, repo)

subscriptions
─────────────────────────────────────────────
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
created_at          timestamptz NOT NULL DEFAULT now()
updated_at          timestamptz NOT NULL DEFAULT now()
email               varchar(256) NOT NULL
repository_id       uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE
confirmed           boolean DEFAULT false
confirm_token       varchar(64) NOT NULL UNIQUE
unsubscribe_token   varchar(64) NOT NULL UNIQUE
UNIQUE (email, repository_id)
```

**UnitOfWork for atomic subscription:**

```
POST /api/subscribe
       │
       ▼
SubscriptionService.subscribe()
       │
       └── uow.run(async ({ repositories, subscriptions }) => {
               │
               ├── repositories.findOrCreate(owner, repo)   ┐
               │                                             │ single transaction
               └── subscriptions.createSubscription(...)    ┘
           })
```

`UnitOfWork.run()` wraps the callback in Drizzle's `db.transaction()`. Both repositories inside receive the `tx` (transaction client) instead of the global `db`, so all queries are guaranteed to run within the same DB transaction.

On a `UNIQUE constraint violation` (`(email, repository_id)`), PostgreSQL throws `error.code = '23505'`, which `isUniqueConstraintError()` catches and converts to `ConflictError(409)`.

---

## Consequences

### Positive

- **ACID transactions.** `findOrCreate` + `createSubscription` are atomic. Concurrent requests with the same `(email, repo)` cannot create a duplicate subscription thanks to the `UNIQUE` constraint and the transaction isolation level.
- **Expressive constraints.** Token uniqueness and cascading subscription deletes are declared at the DDL level, not in application code. The database is the last line of defense against corrupt data.
- **Native UUID.** PostgreSQL's `gen_random_uuid()` generates v4 UUIDs without additional libraries; Drizzle uses the `uuid` type directly.
- **Managed migrations.** `drizzle-kit generate` + `drizzle-kit migrate` produce versioned SQL files in `drizzle/migrations/`, committed to the repository and applied automatically at startup via `migrate(db, ...)`.
- **Type safety.** `typeof repositoriesTable.$inferSelect` yields a TypeScript type for a table row without manual interface declarations. Type errors in queries are caught at compile time.

### Negative

- **Infrastructure dependency.** Requires a separate Docker container both locally and in CI/CD. Integration tests use a separate port (5433) to avoid conflicting with a local PostgreSQL instance.
- **Connection pooling.** Node.js + `pg` without a properly tuned pool can exhaust allowed connections under load. Drizzle uses a `node-postgres` pool, but limits (`max`, `idleTimeoutMillis`) are left at defaults – production deployments require tuning.
- **Write scalability.** PostgreSQL can scale reads horizontally via read replicas, but writes go to the primary only. This is not a problem at current volumes, but must be considered as the number of subscribers and scan frequency grows.
- **Overhead for simple lookups.** Using PostgreSQL for `findByConfirmToken` is overkill performance-wise – Redis or even an in-memory map would be faster. But consistency and simplicity are worth more here.

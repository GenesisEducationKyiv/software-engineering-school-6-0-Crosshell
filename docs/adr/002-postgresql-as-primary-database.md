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
2. **Unique constraints at the DB level**: concurrent requests for the same entity must never create a duplicate.
3. **Cascading deletes**: removing a repository must automatically remove all associated subscriptions.
4. **Migrations**: the schema must evolve in a controlled manner through versioned migration files.

---

## Considered Alternatives

### 1. SQLite

An embedded, file-system-based database.

**Pros:** zero infrastructure, simple local development.

**Cons:**
- File-level write lock – concurrent requests (Fastify handles requests concurrently) will produce contention.
- Poor support for `uuid` types and complex constraints without workarounds.
- Not suitable for production deployments with multiple processes or replicas.

### 2. MongoDB

A document database.

**Pros:** flexible schema, horizontal scalability.

**Cons:**
- Multi-document transactions arrived in v4.0 but have limited performance compared to relational databases.
- Unique constraints on composite fields require an explicit index that must be monitored separately; in PostgreSQL this is DDL-level.
- The "repository → subscriptions" relationship is naturally relational; MongoDB would require either embedding (data duplication) or references (manual joins).

### 3. MySQL / MariaDB

A relational database and direct competitor to PostgreSQL.

**Pros:** widely adopted, good documentation.

**Cons:**
- Weaker support for complex types: no native `uuid` (requires `CHAR(36)` or `BINARY(16)`), `RETURNING` clause only appeared in MariaDB 10.5+ and MySQL 8.0+.
- `ON CONFLICT DO NOTHING` / `INSERT ... ON CONFLICT` (upsert) in PostgreSQL is more expressive and reliable than `INSERT IGNORE` or `ON DUPLICATE KEY UPDATE` in MySQL.

### 4. PostgreSQL

A full-featured relational DBMS.

---

## Decision

**PostgreSQL is chosen.**

---

## Consequences

### Positive

- **ACID transactions.** The subscribe operation is fully atomic. Concurrent requests for the same email and repository cannot create a duplicate subscription thanks to unique constraints and transaction isolation.
- **Expressive constraints.** Token uniqueness and cascading subscription deletes are declared at the DDL level, not in application code. The database is the last line of defense against corrupt data.
- **Native UUID.** PostgreSQL's `gen_random_uuid()` generates v4 UUIDs without additional libraries.
- **Managed migrations.** Schema changes are applied through versioned migration files committed to the repository, ensuring controlled evolution across environments.

### Negative

- **Infrastructure dependency.** Requires a separate Docker container both locally and in CI/CD. Integration tests use a separate port (5433) to avoid conflicting with a local PostgreSQL instance.
- **Connection pooling.** Connection pool limits must be properly tuned for production; defaults can exhaust allowed connections under load.
- **Write scalability.** PostgreSQL can scale reads horizontally via read replicas, but writes go to the primary only. This is not a problem at current volumes, but must be considered as the number of subscribers and scan frequency grows.
- **Overhead for simple lookups.** Token-based lookups are performance-wise overkill for a relational DB — Redis or an in-memory map would be faster. But consistency and simplicity are worth more here.

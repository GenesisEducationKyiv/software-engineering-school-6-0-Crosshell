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

| #  | Requirement                                                                                                                                                                                                                                                                |
|----|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| N1 | **Reliable delivery:** release notification messages are never silently lost; failed deliveries are retried automatically, and persistent failures are quarantined for manual inspection. Per-subscriber email failures are isolated and do not block other notifications. |
| N2 | **Fault tolerance:** temporary unavailability of the messaging system or email provider must not interrupt the scanner                                                                                                                                                     |
| N3 | **Observability:** Prometheus metrics for HTTP, GitHub API, scanner, and notifications; structured logs                                                                                                                                                                    |
| N4 | **Graceful shutdown:** on SIGTERM the service finishes active requests and closes all connections                                                                                                                                                                          |
| N5 | **Security:** all protected endpoints must verify client identity through a standardized authentication mechanism; public endpoints remain accessible without authentication                                                                                               |
| N6 | **Consistency:** subscription is an atomic operation (find-or-create repo + create subscription in one transaction)                                                                                                                                                        |

### Constraints

- **GitHub API rate limit:** unauthenticated access has a low hourly cap; a token is required for tracking more than a handful of repositories.
- **Email delivery:** an external provider; latency and availability are outside the service's control – hence the queue.
- **Two processes, one deployable:** the API process and the notifier worker each currently run as a single instance. Horizontal scaling of the API process will require an external scheduler for the cron job (to prevent parallel scan runs).

---

## 3. Architecture

The service runs as two processes sharing one codebase: an **API process** (REST/gRPC, subscriptions, the scanner) and a **notifier worker** that owns all outbound email. They talk to each other only through message queues or gRPC, never by sharing memory or a direct database connection to each other's data.

Subscribing is itself a short saga: the API process persists the pending subscription, then hands the confirmation email off to the worker over a queue or gRPC (configurable) and waits for a reply before completing the request.

```mermaid
flowchart TD
    REST["Client (REST)"]
    GRPC["Client (gRPC)"]

    subgraph api["API process"]
        Servers["REST & gRPC Servers"]
        SS["SubscriptionService"]
        Saga["Subscribe Saga Orchestrator"]
        GHClient["GitHub Client + Cache"]
        Scanner["Scanner (every 10 min)"]
    end

    subgraph worker["Notifier worker"]
        NS["NotificationService"]
        SagaHandler["Confirmation-email handler"]
    end

    DB[("Database")]
    Cache[("Cache")]
    NotifyChannel[/"Release-notification queue"/]
    SagaChannel[/"Confirmation-email channel<br/>(queue or gRPC)"/]
    GitHub(["GitHub"])
    Email(["Email Provider"])

    REST -->|HTTP| Servers
    GRPC -->|gRPC| Servers
    Servers --> SS
    Servers --> Saga
    SS --> DB
    SS --> GHClient
    Saga --> DB
    Saga -->|confirmation email| SagaChannel
    SagaChannel --> SagaHandler
    SagaHandler --> Email
    GHClient --> Cache
    GHClient -->|API| GitHub
    Scanner -->|read / write| DB
    Scanner --> GHClient
    Scanner -->|publish| NotifyChannel
    NotifyChannel --> NS
    NS --> Email
```

---

## 4. API Reference

### REST

The API exposes two groups of routes:

- **Subscription management** — protected by authentication when configured.
- **Infrastructure** (health check, metrics) — always public.

**Response codes:**
- `200` – success
- `400` – validation error (invalid email, wrong repo format)
- `401` – missing or incorrect API key
- `404` – token not found / repository does not exist on GitHub
- `409` – subscription already exists
- `429` – GitHub rate limit hit

### gRPC

Mirrors all REST subscription operations via protobuf RPC. See the `proto/` directory for full service definitions. Both transports delegate to the same service.

---

## 5. Infrastructure and Deployment

### Local Development

For local development, bring up only the infrastructure services and run each process directly, in separate terminals:

```bash
docker compose up -d notifier-postgres notifier-redis notifier-rabbitmq
npm run dev            # API process
npm run dev:notifier   # notifier worker
```

### Production

```bash
docker compose -f docker-compose.prod.yml up 
```

The application processes run as Docker containers alongside the infrastructure services, in the same network.

**Environment variables:** see `.env.example` for the full list with descriptions.

### Integration Tests

```bash
npm run test:integration
```

Separate ports prevent conflicts with the local dev environment during test runs.

---

## 6. Observability

### Metrics

Prometheus metrics cover HTTP requests, GitHub API calls, scanner activity, and notification delivery outcomes; each process exposes its own `/metrics` endpoint, visualized in Grafana. Default Node.js runtime metrics (event loop, heap, GC) are also exported.

### Logging

Structured JSON logs at `info` / `warn` / `error` levels, shipped to Elasticsearch and browsable in Kibana, covering queue lifecycle, scan activity, saga steps, notification delivery, and cache behavior.

### Graceful Shutdown

On `SIGTERM` each process stops accepting new requests, finishes active ones, then closes its own infrastructure connections in order.

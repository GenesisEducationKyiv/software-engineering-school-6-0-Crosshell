# Testing

## Requirements

- **Node.js** 22+ and **npm**
- **Docker** with the Compose plugin (v2)

Install dependencies before running any tests:

```bash
npm ci
```

---

## Run all tests

Runs unit → integration → E2E sequentially. Each stage manages its own Docker containers.

```bash
npm run test:all
```

---

## Unit tests

No external dependencies needed.

```bash
npm run test:run        # single run
npm run test            # watch mode
```

**Location:** `src/**/*.spec.ts`

---

## Integration tests

Infrastructure starts automatically in Docker. The app runs in the test process.

```bash
npm run test:integration        # start containers → run → tear down
npm run test:integration:up     # start containers only
npm run test:integration:run    # run against already-running containers
npm run test:integration:down   # tear down containers
```

**Location:** `tests/integration/*.spec.ts`

---

## E2E tests

The full application stack starts in Docker. Tests hit it over HTTP.

Install Playwright browsers once before first run:

```bash
npx playwright install --with-deps chromium
```

```bash
npm run test:e2e        # start full stack → run → tear down
npm run test:e2e:up     # start containers only
npm run test:e2e:run    # run against already-running containers
npm run test:e2e:down   # tear down containers
```

**Location:** `tests/e2e/*.spec.ts`

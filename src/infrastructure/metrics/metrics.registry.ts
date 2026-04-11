import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const githubApiRequestsTotal = new Counter({
  name: 'github_api_requests_total',
  help: 'Total number of GitHub API requests',
  labelNames: ['operation', 'cache'] as const,
  registers: [registry],
});

export const scannerRunsTotal = new Counter({
  name: 'scanner_runs_total',
  help: 'Total number of scanner cron runs',
  registers: [registry],
});

export const scannerNewReleasesTotal = new Counter({
  name: 'scanner_new_releases_total',
  help: 'Total number of new releases detected by scanner',
  registers: [registry],
});

export const notificationsSentTotal = new Counter({
  name: 'notifications_sent_total',
  help: 'Total number of release notification emails attempted',
  labelNames: ['status'] as const,
  registers: [registry],
});

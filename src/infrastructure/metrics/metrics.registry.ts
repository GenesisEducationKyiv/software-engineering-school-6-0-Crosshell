import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

// RED - Rate
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

// RED - Errors
export const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP requests that resulted in a 4xx or 5xx response',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

// RED - Duration
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

// GitHub API - Rate
export const githubApiRequestsTotal = new Counter({
  name: 'github_api_requests_total',
  help: 'Total number of GitHub API requests',
  labelNames: ['operation'] as const,
  registers: [registry],
});

// GitHub API - Errors
export const githubApiErrorsTotal = new Counter({
  name: 'github_api_errors_total',
  help: 'Total number of failed GitHub API requests',
  labelNames: ['operation'] as const,
  registers: [registry],
});

// GitHub API - Duration
export const githubApiDurationSeconds = new Histogram({
  name: 'github_api_duration_seconds',
  help: 'GitHub API request duration in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const githubCacheEventsTotal = new Counter({
  name: 'github_cache_events_total',
  help: 'Total number of GitHub cache hits and misses',
  labelNames: ['operation', 'result'] as const,
  registers: [registry],
});

// Scanner - Rate
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

// Scanner - Errors
export const scannerErrorsTotal = new Counter({
  name: 'scanner_errors_total',
  help: 'Total number of errors encountered while checking a repository',
  registers: [registry],
});

// Scanner - Duration
export const scannerDurationSeconds = new Histogram({
  name: 'scanner_duration_seconds',
  help: 'Full scan cycle duration in seconds',
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registry],
});

// Notifications - Rate
export const notificationsSentTotal = new Counter({
  name: 'notifications_sent_total',
  help: 'Total number of release notification emails attempted',
  labelNames: ['status'] as const,
  registers: [registry],
});

// Notifications - Duration
export const notificationProcessingDurationSeconds = new Histogram({
  name: 'notification_processing_duration_seconds',
  help: 'Time to process a single notification batch (all emails for one release)',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import metricsPlugin from '@/shared/plugins/metrics.plugin';
import healthPlugin from '@/shared/plugins/health.plugin';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.register(healthPlugin);
  app.register(metricsPlugin);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /metrics', () => {
  it('returns 200 with Prometheus text content type', async () => {
    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
  });

  it('exposes all registered custom metrics', async () => {
    const response = await app.inject({ method: 'GET', url: '/metrics' });
    const body = response.body;

    expect(body).toContain('# HELP http_requests_total');
    expect(body).toContain('# HELP http_request_duration_seconds');
    expect(body).toContain('# HELP github_api_requests_total');
    expect(body).toContain('# HELP scanner_runs_total');
    expect(body).toContain('# HELP notifications_sent_total');
  });

  it('exposes default Node.js runtime metrics', async () => {
    const response = await app.inject({ method: 'GET', url: '/metrics' });
    const body = response.body;

    expect(body).toContain('process_cpu_seconds_total');
    expect(body).toContain('nodejs_heap_size_total_bytes');
  });

  it('tracks http_requests_total after a request, excluding /metrics itself', async () => {
    await app.inject({ method: 'GET', url: '/health' });

    const response = await app.inject({ method: 'GET', url: '/metrics' });
    const body = response.body;

    expect(body).toContain('route="/health"');
    expect(body).not.toContain('route="/metrics"');
  });
});

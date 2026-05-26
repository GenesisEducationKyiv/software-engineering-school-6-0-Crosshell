import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import healthPlugin from '@/shared/plugins/health.plugin';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.register(healthPlugin);
  await app.ready();

  return app;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

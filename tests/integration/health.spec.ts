import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import healthPlugin from '@/shared/plugins/health.plugin';

async function buildApp(probe: () => Promise<void>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.register(healthPlugin, { probe });
  await app.ready();

  return app;
}

describe('GET /health', () => {
  describe('when all dependencies are reachable', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildApp(async () => {});
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 200 with status ok', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });
  });

  describe('when a dependency is unreachable', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildApp(async () => {
        throw new Error('connection refused');
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 503 with status unavailable', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'unavailable' });
    });
  });
});

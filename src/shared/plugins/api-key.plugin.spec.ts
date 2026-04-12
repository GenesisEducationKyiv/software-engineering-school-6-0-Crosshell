import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import apiKeyPlugin from './api-key.plugin';
import errorHandlerPlugin from './error-handler.plugin';
import { HttpStatus } from '@/shared/constants/http-status.constant';

let mockApiKey: string | undefined;

vi.mock('@/shared/config', () => ({
  get appConfig() {
    return { apiKey: mockApiKey };
  },
}));

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(errorHandlerPlugin);
  app.register(apiKeyPlugin);
  app.get('/protected', async () => ({ ok: true }));
  return app;
}

describe('apiKeyPlugin', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  describe('when no API key is configured', () => {
    beforeEach(() => {
      mockApiKey = undefined;
      app = buildApp();
    });

    it('should allow requests without an x-api-key header', async () => {
      const response = await app.inject({ method: 'GET', url: '/protected' });

      expect(response.statusCode).toBe(HttpStatus.OK);
    });

    it('should allow requests that include any x-api-key header value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { 'x-api-key': 'whatever' },
      });

      expect(response.statusCode).toBe(HttpStatus.OK);
    });
  });

  describe('when an API key is configured', () => {
    const CONFIGURED_KEY = 'super-secret-key';

    beforeEach(() => {
      mockApiKey = CONFIGURED_KEY;
      app = buildApp();
    });

    it('should allow requests with the correct x-api-key header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { 'x-api-key': CONFIGURED_KEY },
      });

      expect(response.statusCode).toBe(HttpStatus.OK);
    });

    it('should return 401 when the x-api-key header is missing', async () => {
      const response = await app.inject({ method: 'GET', url: '/protected' });

      expect(response.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should return 401 when the x-api-key header has the wrong value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { 'x-api-key': 'wrong-key' },
      });

      expect(response.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should return 401 when the x-api-key header is an empty string', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { 'x-api-key': '' },
      });

      expect(response.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should return 401 when the key matches a prefix but not the full value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { 'x-api-key': CONFIGURED_KEY.slice(0, 5) },
      });

      expect(response.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });
  });
});

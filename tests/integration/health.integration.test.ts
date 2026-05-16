import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ISubscriptionService } from '@/modules/subscription/subscription.service.interface';
import { buildTestApp, type TestApp } from './helpers/app.helper';

let app: TestApp;

beforeAll(async () => {
  app = await buildTestApp(mock<ISubscriptionService>());
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

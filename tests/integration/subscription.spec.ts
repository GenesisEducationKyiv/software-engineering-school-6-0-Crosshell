import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { FastifyInstance } from 'fastify';
import { buildSubscriptionApp } from './helpers/app.helper';
import { useSubscriptionTest } from './helpers/subscription-test.helper';
import { mswServer } from './setup';

const {
  getApp,
  getService,
  getSendConfirmationSpy,
  findRepoByOwnerAndRepo,
  findAllRepos,
  findAllSubscriptions,
  findSubscriptionById,
  findSubscriptionByEmailAndRepo,
} = useSubscriptionTest();

describe('POST /api/subscribe', () => {
  it('returns 200 and persists repository + unconfirmed subscription, then sends confirmation email', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ message: string }>()).toMatchObject({
      message: expect.stringContaining('Confirmation email sent'),
    });

    const repoRow = await findRepoByOwnerAndRepo('golang', 'go');
    expect(repoRow).toBeDefined();
    expect(repoRow?.owner).toBe('golang');
    expect(repoRow?.repo).toBe('go');
    expect(repoRow?.lastSeenTag).toBeNull();

    const subRow = await findSubscriptionByEmailAndRepo(
      'alice@example.com',
      'golang',
      'go',
    );
    expect(subRow).toBeDefined();
    expect(subRow?.email).toBe('alice@example.com');
    expect(subRow?.confirmed).toBe(false);
    expect(subRow?.confirmToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(subRow?.unsubscribeToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    expect(getSendConfirmationSpy()).toHaveBeenCalledOnce();
    expect(getSendConfirmationSpy()).toHaveBeenCalledWith(
      'alice@example.com',
      expect.stringContaining(subRow!.confirmToken),
      expect.stringContaining(subRow!.unsubscribeToken),
    );
  });

  it('returns 409 when the same email subscribes to the same repository twice', async () => {
    await getApp().inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('returns 404 when the GitHub repository does not exist', async () => {
    mswServer.use(
      http.get('https://api.github.com/repos/nonexistent/repo', () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    );

    const response = await getApp().inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'nonexistent/repo' },
    });

    expect(response.statusCode).toBe(404);

    const repos = await findAllRepos();
    expect(repos).toHaveLength(0);
  });

  it('returns 400 when the request body is invalid', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'not-an-email', repo: 'golang/go' },
    });

    expect(response.statusCode).toBe(400);
    expect(getSendConfirmationSpy()).not.toHaveBeenCalled();
  });
});

describe('GET /api/confirm/:token', () => {
  it('confirms the subscription and marks it as confirmed in the database', async () => {
    await getApp().inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    const subRow = await findSubscriptionByEmailAndRepo(
      'alice@example.com',
      'golang',
      'go',
    );
    expect(subRow?.confirmed).toBe(false);

    const response = await getApp().inject({
      method: 'GET',
      url: `/api/confirm/${subRow!.confirmToken}`,
    });

    expect(response.statusCode).toBe(200);

    const confirmedRow = await findSubscriptionById(subRow!.id);
    expect(confirmedRow?.confirmed).toBe(true);
  });

  it('returns 404 for an unknown confirmation token', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/api/confirm/00000000-0000-0000-0000-000000000000',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/unsubscribe/:token', () => {
  it('deletes the subscription from the database', async () => {
    await getApp().inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    const subRow = await findSubscriptionByEmailAndRepo(
      'alice@example.com',
      'golang',
      'go',
    );

    const response = await getApp().inject({
      method: 'GET',
      url: `/api/unsubscribe/${subRow!.unsubscribeToken}`,
    });

    expect(response.statusCode).toBe(200);

    const remaining = await findAllSubscriptions();
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 for an invalid unsubscribe token', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/api/unsubscribe/00000000-0000-0000-0000-000000000000',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/subscriptions', () => {
  it('returns only confirmed subscriptions for the given email', async () => {
    await getApp().inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });
    await getApp().inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'facebook/react' },
    });

    const golangSub = await findSubscriptionByEmailAndRepo(
      'alice@example.com',
      'golang',
      'go',
    );

    await getApp().inject({
      method: 'GET',
      url: `/api/confirm/${golangSub!.confirmToken}`,
    });

    const response = await getApp().inject({
      method: 'GET',
      url: '/api/subscriptions?email=alice@example.com',
    });

    expect(response.statusCode).toBe(200);
    const body =
      response.json<{ email: string; repo: string; confirmed: boolean }[]>();
    expect(body).toHaveLength(1);
    expect(body[0]?.confirmed).toBe(true);
    expect(body[0]?.email).toBe('alice@example.com');
    expect(body[0]?.repo).toBe('golang/go');
  });

  it('returns an empty array when there are no confirmed subscriptions', async () => {
    await getApp().inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    const response = await getApp().inject({
      method: 'GET',
      url: '/api/subscriptions?email=alice@example.com',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('returns 400 when the email query param is missing', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/api/subscriptions',
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('API Key auth', () => {
  let apiKeyApp: FastifyInstance;

  beforeAll(async () => {
    apiKeyApp = await buildSubscriptionApp(getService(), {
      apiKey: 'test-key',
    });
  });

  afterAll(async () => {
    await apiKeyApp.close();
  });

  it('returns 401 when x-api-key header is missing', async () => {
    const response = await apiKeyApp.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 200 when correct x-api-key header is provided', async () => {
    const response = await apiKeyApp.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
      headers: { 'x-api-key': 'test-key' },
    });

    expect(response.statusCode).toBe(200);
  });
});

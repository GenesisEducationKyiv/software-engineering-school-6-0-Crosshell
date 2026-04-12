import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { appConfig } from '@/shared/config';
import { UnauthorizedError } from '@/shared/errors/app.errors';

const apiKeyPlugin: FastifyPluginAsync = fp(async (server) => {
  if (!appConfig.apiKey) return;

  const PUBLIC_ROUTES = new Set(['/health', '/metrics']);

  server.addHook('onRequest', (request, _reply, done) => {
    if (PUBLIC_ROUTES.has(request.routeOptions?.url ?? '')) return done();

    const key = request.headers['x-api-key'];

    if (key !== appConfig.apiKey) {
      return done(new UnauthorizedError());
    }

    done();
  });
});

export default apiKeyPlugin;

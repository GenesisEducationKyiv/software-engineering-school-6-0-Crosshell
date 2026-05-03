import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { appConfig } from '@/shared/config';
import { UnauthorizedError } from '@/shared/errors/app.errors';

const apiKeyPlugin: FastifyPluginAsync = fp((server): Promise<void> => {
  if (!appConfig.apiKey) return Promise.resolve();

  server.addHook('onRequest', (request, _reply, done) => {
    const path = request.url.split('?')[0];

    if (!path.startsWith('/api/')) {
      return done();
    }

    const key = request.headers['x-api-key'];

    if (key !== appConfig.apiKey) {
      return done(new UnauthorizedError());
    }

    done();
  });

  return Promise.resolve();
});

export default apiKeyPlugin;

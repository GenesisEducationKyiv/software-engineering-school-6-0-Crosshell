import fp from 'fastify-plugin';
import { UnauthorizedError } from '@/shared/errors/app.errors';

interface ApiKeyPluginOptions {
  apiKey?: string;
}

const apiKeyPlugin = fp<ApiKeyPluginOptions>(
  async (server, opts): Promise<void> => {
    if (!opts.apiKey) {
      return;
    }

    server.addHook('onRequest', (request, _reply, done) => {
      const path = request.url.split('?')[0];

      if (!path.startsWith('/api/')) {
        return done();
      }

      const key = request.headers['x-api-key'];

      if (key !== opts.apiKey) {
        return done(new UnauthorizedError());
      }

      done();
    });
  },
);

export default apiKeyPlugin;

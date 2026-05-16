import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import {
  registry,
  httpRequestsTotal,
  httpRequestDurationSeconds,
} from '@/infrastructure/metrics/metrics.registry';

const metricsPlugin: FastifyPluginAsync = fp(async (server): Promise<void> => {
  server.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url ?? 'unknown';

    if (route === '/metrics') {
      return done();
    }

    httpRequestsTotal.inc({
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    });

    httpRequestDurationSeconds.observe(
      { method: request.method, route },
      reply.elapsedTime / 1000,
    );

    done();
  });

  server.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);

    return registry.metrics();
  });
});

export default metricsPlugin;

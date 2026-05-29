import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import {
  registry,
  httpRequestsTotal,
  httpErrorsTotal,
  httpRequestDurationSeconds,
} from '@/infrastructure/metrics/metrics.registry';

const metricsPlugin: FastifyPluginAsync = fp(async (server): Promise<void> => {
  server.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url ?? 'unknown';

    if (route === '/metrics') {
      return done();
    }

    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };

    httpRequestsTotal.inc(labels);

    if (reply.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }

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

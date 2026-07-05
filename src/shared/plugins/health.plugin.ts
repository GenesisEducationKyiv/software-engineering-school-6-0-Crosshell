import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

interface HealthPluginOptions extends FastifyPluginOptions {
  probe: () => Promise<void>;
}

export default async function healthPlugin(
  app: FastifyInstance,
  { probe }: HealthPluginOptions,
): Promise<void> {
  app.get('/health', async (_request, reply) => {
    try {
      await probe();

      return reply.code(200).send({ status: 'ok' });
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}

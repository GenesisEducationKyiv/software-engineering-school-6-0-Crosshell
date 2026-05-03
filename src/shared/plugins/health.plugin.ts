import type { FastifyInstance } from 'fastify';

export default function healthPlugin(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    return reply.code(200).send({ status: 'ok' });
  });
  return Promise.resolve();
}

import { createSubscriptionSchema } from '@/modules/subscription/subscription.schema';
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppServer } from '@/server';

const subscriptionRoutes: FastifyPluginAsyncZod = async (server: AppServer) => {
  server.post(
    '/',
    { schema: { body: createSubscriptionSchema } },
    async (request, reply) => {
      const { email, repositoryId } = request.body;

      return reply.code(201).send({
        message: `Subscription created: ${email} and ${repositoryId}`,
      });
    },
  );
};

export default subscriptionRoutes;

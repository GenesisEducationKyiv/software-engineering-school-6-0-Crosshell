import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  subscribeSchema,
  tokenSchema,
  getSubscriptionsQuerySchema,
  subscriptionWithRepoSchema,
} from '@/modules/subscription/subscription.schemas';
import type { ISubscriptionService } from '@/modules/subscription/subscription.service.interface';
import type { AppServer } from '@/server';
import { HttpStatus } from '@/shared/constants/http-status.constant';

const subscriptionRoutes =
  (service: ISubscriptionService): FastifyPluginAsyncZod =>
  (server: AppServer): Promise<void> => {
    server.post(
      '/subscribe',
      { schema: { body: subscribeSchema } },
      async (request, reply) => {
        await service.subscribe(request.body);
        return reply.code(HttpStatus.OK).send({
          message: 'Subscription successful. Confirmation email sent',
        });
      },
    );

    server.get(
      '/confirm/:token',
      { schema: { params: tokenSchema } },
      async (request, reply) => {
        await service.confirm(request.params.token);
        return reply
          .code(HttpStatus.OK)
          .send({ message: 'Subscription confirmed successfully' });
      },
    );

    server.get(
      '/unsubscribe/:token',
      { schema: { params: tokenSchema } },
      async (request, reply) => {
        await service.unsubscribe(request.params.token);
        return reply
          .code(HttpStatus.OK)
          .send({ message: 'Unsubscribed successfully' });
      },
    );

    server.get(
      '/subscriptions',
      {
        schema: {
          querystring: getSubscriptionsQuerySchema,
          response: { [HttpStatus.OK]: subscriptionWithRepoSchema.array() },
        },
      },
      async (request, reply) => {
        const subscriptions = await service.getSubscriptionsByEmail(
          request.query.email,
        );
        return reply.code(HttpStatus.OK).send(subscriptions);
      },
    );

    return Promise.resolve();
  };

export default subscriptionRoutes;

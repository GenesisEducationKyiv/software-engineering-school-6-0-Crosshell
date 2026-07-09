import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { SubscriptionResponse } from './subscription.schemas';
import {
  subscribeSchema,
  tokenSchema,
  getSubscriptionsQuerySchema,
  subscriptionResponseSchema,
} from './subscription.schemas';
import type { SubscriptionWithRepo } from './types/subscription-with-repo.type';
import type { ISubscriptionService } from './interfaces/subscription.service.interface';
import type { AppServer } from '@/server';
import { HttpStatus } from '@/shared/constants/http-status.constant';
import type { SubscribeSagaOrchestrator } from '@/modules/saga';

function toResponse(subscription: SubscriptionWithRepo): SubscriptionResponse {
  return {
    email: subscription.email,
    repo: `${subscription.owner}/${subscription.repo}`,
    confirmed: subscription.confirmed,
    lastSeenTag: subscription.lastSeenTag,
  };
}

const subscriptionRoutes =
  (
    service: ISubscriptionService,
    orchestrator: SubscribeSagaOrchestrator,
  ): FastifyPluginAsyncZod =>
  async (server: AppServer): Promise<void> => {
    server.post(
      '/subscribe',
      { schema: { body: subscribeSchema } },
      async (request, reply) => {
        await orchestrator.execute(request.body);

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
          response: { [HttpStatus.OK]: subscriptionResponseSchema.array() },
        },
      },
      async (request, reply) => {
        const subscriptions = await service.getSubscriptionsByEmail(
          request.query.email,
        );

        return reply.code(HttpStatus.OK).send(subscriptions.map(toResponse));
      },
    );
  };

export default subscriptionRoutes;

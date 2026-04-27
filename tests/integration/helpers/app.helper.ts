import Fastify from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import errorHandlerPlugin from '@/shared/plugins/error-handler.plugin';
import subscriptionRoutes from '@/modules/subscription/subscription.routes';
import type { SubscriptionService } from '@/modules/subscription/subscription.service';

export async function buildTestApp(subscriptionService: SubscriptionService) {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(errorHandlerPlugin);

  app.register(subscriptionRoutes(subscriptionService), { prefix: '/api' });

  await app.ready();
  return app;
}

export type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

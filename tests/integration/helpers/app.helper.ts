import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import errorHandlerPlugin from '@/shared/plugins/error-handler.plugin';
import healthPlugin from '@/shared/plugins/health.plugin';
import apiKeyPlugin from '@/shared/plugins/api-key.plugin';
import {
  subscriptionRoutes,
  type ISubscriptionService,
} from '@/modules/subscription';
import type { SubscribeSagaOrchestrator } from '@/modules/saga';

export async function buildSubscriptionApp(
  service: ISubscriptionService,
  orchestrator: SubscribeSagaOrchestrator,
  options: { apiKey?: string } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(errorHandlerPlugin);
  app.register(healthPlugin, { probe: async () => {} });
  app.register(apiKeyPlugin, { apiKey: options.apiKey });
  app.register(subscriptionRoutes(service, orchestrator), { prefix: '/api' });
  await app.ready();

  return app;
}

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
import subscriptionRoutes from '@/modules/subscription/subscription.routes';
import type { ISubscriptionService } from '@/modules/subscription/interfaces/subscription.service.interface';

export async function buildSubscriptionApp(
  service: ISubscriptionService,
  options: { apiKey?: string } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(errorHandlerPlugin);
  app.register(healthPlugin);
  app.register(apiKeyPlugin, { apiKey: options.apiKey });
  app.register(subscriptionRoutes(service), { prefix: '/api' });
  await app.ready();

  return app;
}

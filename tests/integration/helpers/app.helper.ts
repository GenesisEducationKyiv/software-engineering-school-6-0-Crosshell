import Fastify from 'fastify';
import type {
  FastifyInstance,
  FastifyBaseLogger,
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import errorHandlerPlugin from '@/shared/plugins/error-handler.plugin';
import healthPlugin from '@/shared/plugins/health.plugin';
import apiKeyPlugin from '@/shared/plugins/api-key.plugin';
import subscriptionRoutes from '@/modules/subscription/subscription.routes';
import type { ISubscriptionService } from '@/modules/subscription/interfaces/subscription.service.interface';
import { UnauthorizedError } from '@/shared/errors/app.errors';

export type TestApp = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export interface TestAppOptions {
  apiKey?: string;
}

export async function buildTestApp(
  subscriptionService: ISubscriptionService,
  options: TestAppOptions = {},
): Promise<TestApp> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(errorHandlerPlugin);
  app.register(healthPlugin);

  if (options.apiKey) {
    const apiKey = options.apiKey;
    app.addHook('onRequest', (request, _reply, done) => {
      const path = request.url.split('?')[0];
      if (!path?.startsWith('/api/')) return done();
      if (request.headers['x-api-key'] !== apiKey)
        return done(new UnauthorizedError());
      done();
    });
  } else {
    app.register(apiKeyPlugin);
  }

  app.register(subscriptionRoutes(subscriptionService), { prefix: '/api' });

  await app.ready();
  return app;
}

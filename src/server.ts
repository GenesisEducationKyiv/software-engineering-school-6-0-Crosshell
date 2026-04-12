import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { appConfig } from '@/shared/config';
import errorHandlerPlugin from '@/shared/plugins/error-handler.plugin';
import healthPlugin from '@/shared/plugins/health.plugin';
import metricsPlugin from '@/shared/plugins/metrics.plugin';
import apiKeyPlugin from '@/shared/plugins/api-key.plugin';
import { logger } from '@/shared/logger';
import type { FastifyBaseLogger } from 'fastify';

const server = Fastify({
  loggerInstance: logger as FastifyBaseLogger,
}).withTypeProvider<ZodTypeProvider>();

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(cors, {
  origin: [
    appConfig.nodeEnv === 'development' ? true : appConfig.appUrl,
    appConfig.frontendUrl,
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
});

server.register(errorHandlerPlugin);
server.register(healthPlugin);
server.register(apiKeyPlugin);
server.register(metricsPlugin);

export { server };

export type AppServer = typeof server;

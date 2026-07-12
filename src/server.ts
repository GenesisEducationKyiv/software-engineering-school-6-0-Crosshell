import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { appConfig } from '@/shared/config';
import errorHandlerPlugin from '@/shared/plugins/error-handler.plugin';
import metricsPlugin from '@/infrastructure/metrics/metrics.plugin';
import apiKeyPlugin from '@/shared/plugins/api-key.plugin';
import { logger } from '@/shared/logger';
import type { FastifyBaseLogger } from 'fastify';
import path from 'path';
import fastifyStatic from '@fastify/static';

const server = Fastify({
  loggerInstance: logger as FastifyBaseLogger,
}).withTypeProvider<ZodTypeProvider>();

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(cors, {
  origin: [appConfig.nodeEnv === 'development' ? true : appConfig.appUrl],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
});

server.register(fastifyStatic, {
  root: path.join(process.cwd(), 'public'),
  prefix: '/',
});

server.register(errorHandlerPlugin);
server.register(apiKeyPlugin, { apiKey: appConfig.apiKey });
server.register(metricsPlugin);

export { server };

export type AppServer = typeof server;

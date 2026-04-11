import Fastify from 'fastify';
import cors from '@fastify/cors';
import type {
  ZodTypeProvider} from 'fastify-type-provider-zod';
import {
  serializerCompiler,
  validatorCompiler
} from 'fastify-type-provider-zod';
import { appConfig } from '@/shared/config';
import errorHandlerPlugin from '@/shared/plugins/error-handler.plugin';
import { logger } from '@/shared/logger';
import type { FastifyBaseLogger } from 'fastify';

const server = Fastify({
  loggerInstance: logger as FastifyBaseLogger,
}).withTypeProvider<ZodTypeProvider>();

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(cors, {
  origin: appConfig.nodeEnv === 'development' ? true : appConfig.appUrl,
});

server.register(errorHandlerPlugin);

export { server };

export type AppServer = typeof server;

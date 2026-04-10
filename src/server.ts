import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { appConfig } from '@/shared/config/app.config';
import errorHandlerPlugin from '@/shared/plugins/error-handler.plugin';

const server = Fastify({
  logger: {
    transport:
      appConfig.nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
}).withTypeProvider<ZodTypeProvider>();

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(errorHandlerPlugin);

export { server };

export type AppServer = typeof server;

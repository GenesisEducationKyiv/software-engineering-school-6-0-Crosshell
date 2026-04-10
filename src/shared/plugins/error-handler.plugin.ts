import fp from 'fastify-plugin';
import { FastifyError, FastifyPluginAsync } from 'fastify';
import { AppError } from '@/shared/errors/app.errors';
import { HttpStatus } from '@/shared/constants/http-statutes.constants';

const errorHandlerPlugin: FastifyPluginAsync = fp(async (server) => {
  server.setErrorHandler((error: FastifyError | AppError, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }

    if (error.validation) {
      return reply
        .code(HttpStatus.BAD_REQUEST)
        .send({ message: error.message });
    }

    reply.log.error(error);

    return reply
      .code(HttpStatus.INTERNAL_SERVER_ERROR)
      .send({ message: 'Internal server error' });
  });
});

export default errorHandlerPlugin;

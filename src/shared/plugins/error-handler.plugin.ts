import fp from 'fastify-plugin';
import type { FastifyError, FastifyPluginAsync } from 'fastify';
import {
  AppError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  UnauthorizedError,
} from '@/shared/errors/app.errors';
import { HttpStatus } from '@/shared/constants/http-status.constant';

function resolveStatus(error: AppError): number {
  if (error instanceof UnauthorizedError) return HttpStatus.UNAUTHORIZED;
  if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof ConflictError) return HttpStatus.CONFLICT;
  if (error instanceof RateLimitError) return HttpStatus.SERVICE_UNAVAILABLE;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

const errorHandlerPlugin: FastifyPluginAsync = fp(async (server) => {
  server.setErrorHandler((error: FastifyError | AppError, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(resolveStatus(error)).send({ message: error.message });
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

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

const STATUS_MAP = new Map<Function, number>([
  [UnauthorizedError, HttpStatus.UNAUTHORIZED],
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  [RateLimitError, HttpStatus.TOO_MANY_REQUESTS],
]);

const STATUS_CACHE = new WeakMap<Function, number>();

function resolveStatus(error: AppError): number {
  const ctor = error.constructor;

  if (STATUS_CACHE.has(ctor)) {
    return STATUS_CACHE.get(ctor)!;
  }

  let proto = Object.getPrototypeOf(error);
  while (proto !== null) {
    const status = STATUS_MAP.get(proto.constructor);

    if (status !== undefined) {
      STATUS_CACHE.set(ctor, status);
      return status;
    }

    proto = Object.getPrototypeOf(proto);
  }

  const defaultStatus = HttpStatus.INTERNAL_SERVER_ERROR;
  STATUS_CACHE.set(ctor, defaultStatus);
  return defaultStatus;
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

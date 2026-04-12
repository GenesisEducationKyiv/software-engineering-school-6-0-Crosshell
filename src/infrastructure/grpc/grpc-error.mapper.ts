import type { ServerErrorResponse } from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';
import { ZodError } from 'zod';
import {
  AppError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
} from '@/shared/errors/app.errors';

type GrpcError = ServerErrorResponse & { code: status };
type AppErrorConstructor = abstract new (...args: never[]) => AppError;

const APP_ERROR_STATUS_MAP: [AppErrorConstructor, status][] = [
  [NotFoundError, status.NOT_FOUND],
  [ConflictError, status.ALREADY_EXISTS],
  [RateLimitError, status.RESOURCE_EXHAUSTED],
  [UnauthorizedError, status.UNAUTHENTICATED],
];

export function toGrpcError(err: unknown): GrpcError {
  if (err instanceof ZodError) {
    const message = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { name: 'ValidationError', message, code: status.INVALID_ARGUMENT };
  }

  if (err instanceof AppError) {
    const entry = APP_ERROR_STATUS_MAP.find(([Ctor]) => err instanceof Ctor);
    const code = entry ? entry[1] : status.INTERNAL;
    return { name: err.name, message: err.message, code };
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  return { name: 'InternalError', message, code: status.INTERNAL };
}

import { status, ServerErrorResponse } from '@grpc/grpc-js';
import { ZodError } from 'zod';
import {
  AppError,
  ConflictError,
  NotFoundError,
  RateLimitError,
} from '@/shared/errors/app.errors';

type GrpcError = ServerErrorResponse & { code: status };

export function toGrpcError(err: unknown): GrpcError {
  if (err instanceof ZodError) {
    const message = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { name: 'ValidationError', message, code: status.INVALID_ARGUMENT };
  }
  if (err instanceof NotFoundError) {
    return { name: err.name, message: err.message, code: status.NOT_FOUND };
  }
  if (err instanceof ConflictError) {
    return { name: err.name, message: err.message, code: status.ALREADY_EXISTS };
  }
  if (err instanceof RateLimitError) {
    return {
      name: err.name,
      message: err.message,
      code: status.RESOURCE_EXHAUSTED,
    };
  }
  if (err instanceof AppError) {
    return { name: err.name, message: err.message, code: status.INTERNAL };
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  return { name: 'InternalError', message, code: status.INTERNAL };
}

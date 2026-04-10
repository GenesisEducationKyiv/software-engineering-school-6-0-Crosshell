import { HttpStatus } from '@/shared/constants/http-statutes.constants';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    name: string,
  ) {
    super(message);
    this.name = name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(HttpStatus.NOT_FOUND, message, 'NotFoundError');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(HttpStatus.CONFLICT, message, 'ConflictError');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super(HttpStatus.SERVICE_UNAVAILABLE, message, 'RateLimitError');
  }
}

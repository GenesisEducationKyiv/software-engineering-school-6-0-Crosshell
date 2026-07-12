export class AppError extends Error {
  constructor(
    readonly name: string,
    message: string,
  ) {
    super(message);
    this.name = name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NotFoundError', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('ConflictError', message);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super('RateLimitError', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UnauthorizedError', message);
  }
}

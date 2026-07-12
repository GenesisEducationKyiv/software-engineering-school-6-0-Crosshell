import { describe, it, expect } from 'vitest';
import { status } from '@grpc/grpc-js';
import { z } from 'zod';
import { toGrpcError } from './grpc-error.mapper';
import {
  ConflictError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
} from '@/shared/errors/app.errors';

function parseAndGetError(schema: z.ZodTypeAny, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error('Expected parse to fail');
  }

  return result.error;
}

describe('toGrpcError', () => {
  describe('ZodError', () => {
    it('should return INVALID_ARGUMENT code', () => {
      const zodError = parseAndGetError(z.object({ email: z.email() }), {
        email: 'bad',
      });

      const result = toGrpcError(zodError);

      expect(result.code).toBe(status.INVALID_ARGUMENT);
    });

    it('should return ValidationError as the name', () => {
      const zodError = parseAndGetError(z.string(), 123);

      const result = toGrpcError(zodError);

      expect(result.name).toBe('ValidationError');
    });

    it('should format a single issue as "path: message"', () => {
      const zodError = parseAndGetError(z.object({ email: z.email() }), {
        email: 'not-an-email',
      });

      const result = toGrpcError(zodError);

      expect(result.message).toMatch(/^email: .+/);
    });

    it('should join multiple issues with ", "', () => {
      const zodError = parseAndGetError(
        z.object({ email: z.email(), age: z.number() }),
        { email: 'bad', age: 'not-a-number' },
      );

      const result = toGrpcError(zodError);

      expect(result.message).toContain('email:');
      expect(result.message).toContain('age:');
      expect(result.message).toContain(', ');
    });

    it('should use dot-joined path segments for nested fields', () => {
      const zodError = parseAndGetError(
        z.object({ address: z.object({ zip: z.string() }) }),
        { address: { zip: 123 } },
      );

      const result = toGrpcError(zodError);

      expect(result.message).toContain('address.zip:');
    });
  });

  describe('NotFoundError', () => {
    it('should return NOT_FOUND code', () => {
      const result = toGrpcError(new NotFoundError('resource not found'));

      expect(result.code).toBe(status.NOT_FOUND);
    });

    it('should preserve the original error message', () => {
      const result = toGrpcError(new NotFoundError('resource not found'));

      expect(result.message).toBe('resource not found');
    });

    it('should preserve the error name', () => {
      const result = toGrpcError(new NotFoundError('resource not found'));

      expect(result.name).toBe('NotFoundError');
    });
  });

  describe('ConflictError', () => {
    it('should return ALREADY_EXISTS code', () => {
      const result = toGrpcError(new ConflictError('already registered'));

      expect(result.code).toBe(status.ALREADY_EXISTS);
    });

    it('should preserve the original error message', () => {
      const result = toGrpcError(new ConflictError('already registered'));

      expect(result.message).toBe('already registered');
    });

    it('should preserve the error name', () => {
      const result = toGrpcError(new ConflictError('already registered'));

      expect(result.name).toBe('ConflictError');
    });
  });

  describe('RateLimitError', () => {
    it('should return RESOURCE_EXHAUSTED code', () => {
      const result = toGrpcError(new RateLimitError('try again in 60s'));

      expect(result.code).toBe(status.RESOURCE_EXHAUSTED);
    });

    it('should preserve the original error message', () => {
      const result = toGrpcError(new RateLimitError('try again in 60s'));

      expect(result.message).toBe('try again in 60s');
    });

    it('should preserve the error name', () => {
      const result = toGrpcError(new RateLimitError('try again in 60s'));

      expect(result.name).toBe('RateLimitError');
    });
  });

  describe('UnauthorizedError', () => {
    it('should return UNAUTHENTICATED code', () => {
      const result = toGrpcError(new UnauthorizedError('not allowed'));

      expect(result.code).toBe(status.UNAUTHENTICATED);
    });

    it('should preserve the original error message', () => {
      const result = toGrpcError(new UnauthorizedError('not allowed'));

      expect(result.message).toBe('not allowed');
    });

    it('should preserve the error name', () => {
      const result = toGrpcError(new UnauthorizedError('not allowed'));

      expect(result.name).toBe('UnauthorizedError');
    });
  });

  describe('plain Error (not an AppError)', () => {
    it('should return INTERNAL code', () => {
      const result = toGrpcError(new Error('something broke'));

      expect(result.code).toBe(status.INTERNAL);
    });

    it('should use the Error message', () => {
      const result = toGrpcError(new Error('something broke'));

      expect(result.message).toBe('something broke');
    });

    it('should return InternalError as the name', () => {
      const result = toGrpcError(new Error('something broke'));

      expect(result.name).toBe('InternalError');
    });
  });

  describe('unknown non-Error values', () => {
    it.each([
      ['string', 'oops'],
      ['number', 42],
      ['null', null],
      ['plain object', { detail: 'broken' }],
      ['undefined', undefined],
    ])(
      'should return INTERNAL code when thrown value is a %s',
      (_label, thrown) => {
        const result = toGrpcError(thrown);

        expect(result.code).toBe(status.INTERNAL);
      },
    );

    it('should return the generic fallback message for non-Error values', () => {
      const result = toGrpcError('a raw string error');

      expect(result.message).toBe('Internal server error');
    });

    it('should return InternalError as the name for non-Error values', () => {
      const result = toGrpcError(null);

      expect(result.name).toBe('InternalError');
    });
  });
});

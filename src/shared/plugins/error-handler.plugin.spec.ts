import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import errorHandlerPlugin from './error-handler.plugin';
import {
  AppError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  UnauthorizedError,
} from '@/shared/errors/app.errors';
import { HttpStatus } from '@/shared/constants/http-status.constant';

function buildApp(): FastifyInstance {
  return Fastify({ logger: false });
}

describe('errorHandlerPlugin', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp();
    app.register(errorHandlerPlugin);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('AppError subclasses', () => {
    it.each([
      ['NotFoundError', new NotFoundError('not found'), HttpStatus.NOT_FOUND],
      [
        'ConflictError',
        new ConflictError('already exists'),
        HttpStatus.CONFLICT,
      ],
      [
        'RateLimitError',
        new RateLimitError('slow down'),
        HttpStatus.TOO_MANY_REQUESTS,
      ],
      [
        'UnauthorizedError',
        new UnauthorizedError('forbidden'),
        HttpStatus.UNAUTHORIZED,
      ],
    ])(
      'should return %s with status %s',
      async (_name, error, expectedStatus) => {
        app.get('/throw', async () => {
          throw error;
        });

        const response = await app.inject({ method: 'GET', url: '/throw' });

        expect(response.statusCode).toBe(expectedStatus);
      },
    );

    it('should include the error message in the response body', async () => {
      app.get('/throw', async () => {
        throw new NotFoundError('user not found');
      });

      const response = await app.inject({ method: 'GET', url: '/throw' });

      expect(response.json()).toEqual({ message: 'user not found' });
    });

    it('should return 500 for an AppError subclass with no entry in the status map', async () => {
      class ObscureAppError extends AppError {
        constructor() {
          super('ObscureAppError', 'something obscure');
        }
      }
      app.get('/throw', async () => {
        throw new ObscureAppError();
      });

      const response = await app.inject({ method: 'GET', url: '/throw' });

      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should resolve the status of a subclass via prototype chain walk', async () => {
      class RepositoryNotFoundError extends NotFoundError {
        constructor() {
          super('repository does not exist');
        }
      }
      app.get('/throw', async () => {
        throw new RepositoryNotFoundError();
      });

      const response = await app.inject({ method: 'GET', url: '/throw' });

      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('should use the cached status on repeated requests with the same error type', async () => {
      app.get('/throw', async () => {
        throw new ConflictError('dupe');
      });

      const first = await app.inject({ method: 'GET', url: '/throw' });
      const second = await app.inject({ method: 'GET', url: '/throw' });

      expect(first.statusCode).toBe(HttpStatus.CONFLICT);
      expect(second.statusCode).toBe(HttpStatus.CONFLICT);
    });
  });

  describe('Fastify schema validation errors', () => {
    beforeEach(() => {
      app.post(
        '/validated',
        {
          schema: {
            body: {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string' } },
            },
          },
        },
        async () => ({ ok: true }),
      );
    });

    it('should return 400 when request body fails schema validation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/validated',
        payload: {},
      });

      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should include a message field in the validation error response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/validated',
        payload: {},
      });

      expect(response.json()).toHaveProperty('message');
      expect(typeof response.json().message).toBe('string');
    });
  });

  describe('unknown errors', () => {
    it('should return 500 for a plain unhandled Error', async () => {
      app.get('/throw', async () => {
        throw new Error('internal details');
      });

      const response = await app.inject({ method: 'GET', url: '/throw' });

      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should respond with the generic "Internal server error" message', async () => {
      app.get('/throw', async () => {
        throw new Error('internal details');
      });

      const response = await app.inject({ method: 'GET', url: '/throw' });

      expect(response.json()).toEqual({ message: 'Internal server error' });
    });

    it('should not leak internal error details in the response body', async () => {
      app.get('/throw', async () => {
        throw new Error('secret DB password is hunter2');
      });

      const response = await app.inject({ method: 'GET', url: '/throw' });

      expect(response.body).not.toContain('hunter2');
    });
  });
});

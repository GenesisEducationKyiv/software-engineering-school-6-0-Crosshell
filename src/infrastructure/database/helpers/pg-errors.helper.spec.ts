import { describe, it, expect } from 'vitest';
import {
  isUniqueConstraintError,
  isUniqueConstraintErrorFor,
} from './pg-errors.helper';

describe('isUniqueConstraintError', () => {
  describe('when the error object has code "23505" directly', () => {
    it('should return true', () => {
      expect(isUniqueConstraintError({ code: '23505' })).toBe(true);
    });

    it('should return true when other properties are also present', () => {
      expect(
        isUniqueConstraintError({
          code: '23505',
          message: 'duplicate key',
          detail: 'Key (email)=(...) already exists.',
        }),
      ).toBe(true);
    });
  });

  describe('when the error has a cause with code "23505"', () => {
    it('should return true', () => {
      expect(isUniqueConstraintError({ cause: { code: '23505' } })).toBe(true);
    });

    it('should return true for a wrapped Node.js error with a pg cause', () => {
      const pgError = { code: '23505', message: 'duplicate key' };
      const wrappedError = new Error('wrap', { cause: pgError });
      expect(isUniqueConstraintError(wrappedError)).toBe(true);
    });
  });

  describe('when the error does not represent a unique-constraint violation', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a number', 42],
      ['a string', 'some error'],
      ['an empty object', {}],
      ['wrong PG error code', { code: '23503' }],
      ['numeric code (not a string)', { code: 23505 }],
      ['a plain Error without code', new Error('generic error')],
    ])('should return false when the value is %s', (_label, value) => {
      expect(isUniqueConstraintError(value)).toBe(false);
    });

    it('should return false when cause has a wrong code', () => {
      expect(isUniqueConstraintError({ cause: { code: '23503' } })).toBe(false);
    });

    it('should return false when cause is null', () => {
      expect(isUniqueConstraintError({ cause: null })).toBe(false);
    });

    it('should return false when cause is a string', () => {
      expect(isUniqueConstraintError({ cause: '23505' })).toBe(false);
    });

    it('should return false when cause has a numeric code', () => {
      expect(isUniqueConstraintError({ cause: { code: 23505 } })).toBe(false);
    });
  });
});

describe('isUniqueConstraintErrorFor', () => {
  it('should return true when code and constraint name match', () => {
    expect(
      isUniqueConstraintErrorFor(
        { code: '23505', constraint: 'email_repository_id_unq' },
        'email_repository_id_unq',
      ),
    ).toBe(true);
  });

  it('should return true when matched via wrapped cause', () => {
    const pgError = { code: '23505', constraint: 'email_repository_id_unq' };
    expect(
      isUniqueConstraintErrorFor(
        new Error('wrap', { cause: pgError }),
        'email_repository_id_unq',
      ),
    ).toBe(true);
  });

  it('should return false when constraint name does not match', () => {
    expect(
      isUniqueConstraintErrorFor(
        { code: '23505', constraint: 'subscriptions_confirm_token_unique' },
        'email_repository_id_unq',
      ),
    ).toBe(false);
  });

  it('should return false when constraint is absent', () => {
    expect(
      isUniqueConstraintErrorFor({ code: '23505' }, 'email_repository_id_unq'),
    ).toBe(false);
  });

  it('should return false when error is not a unique constraint violation', () => {
    expect(
      isUniqueConstraintErrorFor({ code: '23503' }, 'email_repository_id_unq'),
    ).toBe(false);
  });
});

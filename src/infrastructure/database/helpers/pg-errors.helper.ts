function extract23505(err: unknown): { constraint?: string } | null {
  if (typeof err !== 'object' || err === null) {
    return null;
  }

  if ('code' in err && (err as { code: unknown }).code === '23505') {
    return err as { constraint?: string };
  }

  if (
    'cause' in err &&
    typeof (err as { cause: unknown }).cause === 'object' &&
    (err as { cause: { code?: unknown } }).cause !== null &&
    (err as { cause: { code?: unknown } }).cause.code === '23505'
  ) {
    return (err as { cause: { constraint?: string } }).cause;
  }

  return null;
}

export function isUniqueConstraintError(err: unknown): boolean {
  return extract23505(err) !== null;
}

export function isUniqueConstraintErrorFor(
  err: unknown,
  constraintName: string,
): boolean {
  const pg = extract23505(err);

  return pg !== null && pg.constraint === constraintName;
}

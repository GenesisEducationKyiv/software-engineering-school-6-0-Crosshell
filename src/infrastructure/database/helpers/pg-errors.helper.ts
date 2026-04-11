function hasCode23505(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

export function isUniqueConstraintError(err: unknown): boolean {
  return (
    hasCode23505(err) ||
    (typeof err === 'object' &&
      err !== null &&
      'cause' in err &&
      hasCode23505((err as { cause: unknown }).cause))
  );
}

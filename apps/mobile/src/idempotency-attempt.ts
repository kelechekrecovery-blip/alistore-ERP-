export interface IdempotencyAttempt {
  fingerprint: string;
  key: string;
}

export function stableIdempotencyAttempt(
  current: IdempotencyAttempt | null,
  input: unknown,
  createKey: () => string,
): IdempotencyAttempt {
  const fingerprint = JSON.stringify(input);
  return current?.fingerprint === fingerprint ? current : { fingerprint, key: createKey() };
}

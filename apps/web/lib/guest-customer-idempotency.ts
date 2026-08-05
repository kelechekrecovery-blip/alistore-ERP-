export interface GuestCustomerAttempt {
  fingerprint: string;
  key: string;
}

export function stableIdempotencyAttempt(
  current: GuestCustomerAttempt | null,
  input: unknown,
  createKey: () => string = () => crypto.randomUUID(),
): GuestCustomerAttempt {
  const fingerprint = JSON.stringify(input);
  return current?.fingerprint === fingerprint ? current : { fingerprint, key: createKey() };
}

/** Keep one unguessable bearer-like key for identical retries; rotate on edits. */
export function guestCustomerAttempt(
  current: GuestCustomerAttempt | null,
  input: { phone: string; name?: string },
  createKey: () => string = () => crypto.randomUUID(),
): GuestCustomerAttempt {
  const trimmedPhone = input.phone.trim();
  const phone = /^\d{9,15}$/.test(trimmedPhone) ? `+${trimmedPhone}` : trimmedPhone;
  return stableIdempotencyAttempt(current, { phone, name: input.name?.trim() || 'Клиент' }, createKey);
}

interface CancellationKeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredCancellationAttempt {
  fingerprint: string;
  idempotencyKey: string;
}

const PREFIX = 'alistore.order-cancellation.v1';
const memoryAttempts = new Map<string, StoredCancellationAttempt>();

/**
 * Reuses one mutation key for retries of the same logical cancellation. A
 * changed reason is a new customer intent and therefore rotates the key.
 */
export function cancellationRequestKey(
  orderId: string,
  reason: string,
  storage: CancellationKeyStorage,
  createKey: () => string = () => crypto.randomUUID(),
): string {
  const storageKey = keyFor(orderId);
  const fingerprint = fingerprintReason(reason);
  const current = readStoredAttempt(storage, storageKey);
  if (current?.fingerprint === fingerprint) return current.idempotencyKey;

  const idempotencyKey = createKey();
  writeStoredAttempt(storage, storageKey, { fingerprint, idempotencyKey });
  return idempotencyKey;
}

/** Successful API acceptance ends the logical attempt; transport errors do not. */
export function completeCancellationAttempt(
  orderId: string,
  reason: string,
  storage: CancellationKeyStorage,
): void {
  const storageKey = keyFor(orderId);
  const current = readStoredAttempt(storage, storageKey);
  if (current?.fingerprint === fingerprintReason(reason)) {
    memoryAttempts.delete(storageKey);
    try {
      storage.removeItem(storageKey);
    } catch {
      // The successful response still completes the in-memory attempt.
    }
  }
}

function keyFor(orderId: string): string {
  return `${PREFIX}.${orderId}`;
}

function fingerprintReason(reason: string): string {
  const normalized = reason.trim().replace(/\s+/g, ' ');
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${normalized.length}:${(hash >>> 0).toString(16)}`;
}

function readAttempt(value: string | null): StoredCancellationAttempt | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredCancellationAttempt>;
    return typeof parsed.fingerprint === 'string' && typeof parsed.idempotencyKey === 'string'
      ? { fingerprint: parsed.fingerprint, idempotencyKey: parsed.idempotencyKey }
      : null;
  } catch {
    return null;
  }
}

function readStoredAttempt(
  storage: CancellationKeyStorage,
  storageKey: string,
): StoredCancellationAttempt | null {
  const inMemory = memoryAttempts.get(storageKey);
  if (inMemory) return inMemory;

  try {
    const persisted = readAttempt(storage.getItem(storageKey));
    if (persisted) {
      memoryAttempts.set(storageKey, persisted);
      return persisted;
    }
    return memoryAttempts.get(storageKey) ?? null;
  } catch {
    return memoryAttempts.get(storageKey) ?? null;
  }
}

function writeStoredAttempt(
  storage: CancellationKeyStorage,
  storageKey: string,
  attempt: StoredCancellationAttempt,
): void {
  memoryAttempts.set(storageKey, attempt);
  try {
    storage.setItem(storageKey, JSON.stringify(attempt));
  } catch {
    // Private/blocked storage falls back to this module's per-tab memory.
  }
}

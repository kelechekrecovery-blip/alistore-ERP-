import { describe, expect, it } from 'vitest';
import {
  cancellationRequestKey,
  completeCancellationAttempt,
} from './order-cancellation-idempotency';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('cancellation request idempotency', () => {
  it('reuses the key after a transport failure and rotates only for a new intent or completed attempt', () => {
    const storage = memoryStorage();
    let sequence = 0;
    const createKey = () => `cancel-${++sequence}`;

    const first = cancellationRequestKey('order-1', 'Передумал покупать', storage, createKey);
    const retry = cancellationRequestKey('order-1', '  Передумал   покупать  ', storage, createKey);
    expect(retry).toBe(first);
    expect(sequence).toBe(1);

    const changedIntent = cancellationRequestKey('order-1', 'Нашёл другую модель', storage, createKey);
    expect(changedIntent).not.toBe(first);
    expect(sequence).toBe(2);

    // A successful API response closes exactly the current logical attempt.
    completeCancellationAttempt('order-1', 'Нашёл другую модель', storage);
    const afterCompletion = cancellationRequestKey('order-1', 'Нашёл другую модель', storage, createKey);
    expect(afterCompletion).not.toBe(changedIntent);
    expect(sequence).toBe(3);
  });

  it('keeps retry semantics in memory when storage throws SecurityError or quota errors', () => {
    const blockedStorage = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };
    let sequence = 0;
    const createKey = () => `blocked-${++sequence}`;

    const first = cancellationRequestKey('blocked-order', 'Не тот цвет', blockedStorage, createKey);
    expect(cancellationRequestKey('blocked-order', ' Не тот   цвет ', blockedStorage, createKey)).toBe(first);
    expect(sequence).toBe(1);

    const changed = cancellationRequestKey('blocked-order', 'Другая причина', blockedStorage, createKey);
    expect(changed).not.toBe(first);
    completeCancellationAttempt('blocked-order', 'Другая причина', blockedStorage);
    expect(cancellationRequestKey('blocked-order', 'Другая причина', blockedStorage, createKey)).not.toBe(changed);
    expect(sequence).toBe(3);
  });

  it('keeps the latest in-memory intent when reads work but writes exceed quota', () => {
    const values = new Map<string, string>();
    const storageKey = 'alistore.order-cancellation.v1.quota-order';
    values.set(storageKey, JSON.stringify({
      fingerprint: 'old',
      idempotencyKey: 'persisted-old',
    }));
    const quotaStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
      removeItem: (key: string) => values.delete(key),
    };
    let sequence = 0;
    const createKey = () => `quota-${++sequence}`;

    const first = cancellationRequestKey('quota-order', 'Новая причина', quotaStorage, createKey);
    const retry = cancellationRequestKey('quota-order', ' Новая   причина ', quotaStorage, createKey);

    expect(first).toBe('quota-1');
    expect(retry).toBe(first);
    expect(sequence).toBe(1);
  });
});

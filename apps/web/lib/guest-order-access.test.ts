import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestOrderLink, readGuestOrderAccess, saveGuestOrderAccess } from './guest-order-access';

const originalWindow = globalThis.window;

function installWindow(localStorage: Storage) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage,
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

describe('guest order capability persistence', () => {
  it('persists and reads a capability when browser storage works', () => {
    const values = new Map<string, string>();
    installWindow({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
      clear: () => values.clear(),
      key: (index) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    });

    expect(saveGuestOrderAccess('order-1', 'opaque-capability', 300)).toBe(true);
    expect(readGuestOrderAccess('order-1')).toBe('opaque-capability');
  });

  it.each([
    ['SecurityError', new DOMException('blocked', 'SecurityError')],
    ['quota error', new DOMException('full', 'QuotaExceededError')],
  ])('does not throw or hide the direct order link when setItem fails with %s', (_label, failure) => {
    installWindow({
      getItem: () => null,
      setItem: () => { throw failure; },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    });

    expect(saveGuestOrderAccess('order-2', 'guest-capability', 300)).toBe(false);
    expect(guestOrderLink('order-2', 'guest-capability')).toBe('/order/order-2#access=guest-capability');
  });

  it('guards a localStorage getter that throws before setItem is reached', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        get localStorage(): never {
          throw new DOMException('blocked', 'SecurityError');
        },
        atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      },
    });

    expect(saveGuestOrderAccess('order-3', 'guest-capability', 300)).toBe(false);
  });
});

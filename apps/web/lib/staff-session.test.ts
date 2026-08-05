import { describe, expect, it } from 'vitest';
import { clearStaffSignedOut, isStaffSignedOut, markStaffSignedOut, resolveStaffStorage } from './staff-session';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

class CookieJar {
  private values = new Map<string, string>();

  get cookie(): string {
    return [...this.values].map(([key, value]) => `${key}=${value}`).join('; ');
  }

  set cookie(serialized: string) {
    const [pair] = serialized.split(';');
    const separator = pair.indexOf('=');
    const key = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (/max-age=0/i.test(serialized)) this.values.delete(key);
    else this.values.set(key, value);
  }
}

describe('durable staff sign-out', () => {
  it('blocks restoration after an offline logout until a fresh login clears it', () => {
    const storage = memoryStorage();
    const cookies = new CookieJar();
    cookies.cookie = 'alistore_staff_session_hint=1; path=/; domain=.ali.kg';

    markStaffSignedOut(storage, cookies, 100);
    expect(isStaffSignedOut(storage, cookies)).toBe(true);
    // The parent-domain hint may survive, but the admin-origin tombstone wins.
    expect(cookies.cookie).toContain('alistore_staff_session_hint=1');

    clearStaffSignedOut(storage, cookies);
    expect(isStaffSignedOut(storage, cookies)).toBe(false);
  });

  it('falls back to the cookie when storage is unavailable', () => {
    const blockedStorage = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };
    const cookies = new CookieJar();
    markStaffSignedOut(blockedStorage, cookies, 100);
    expect(isStaffSignedOut(blockedStorage, cookies)).toBe(true);
  });

  it('guards a localStorage getter that throws before any method is called', () => {
    const blockedWindow = {
      get localStorage(): never {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    expect(resolveStaffStorage(blockedWindow)).toBeUndefined();
  });
});

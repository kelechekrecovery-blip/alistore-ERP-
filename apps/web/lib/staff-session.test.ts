import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffAuthMe, staffAuthRefresh } from './api/staff-auth';
import { clearStaffSession, clearStaffSignedOut, isStaffSignedOut, logoutStaffSession, markStaffSignedOut, resolveStaffStorage, restoreStaffSession } from './staff-session';

vi.mock('./api/staff-auth', () => ({
  staffAuthMe: vi.fn(),
  staffAuthRefresh: vi.fn(),
}));

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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('blocks restoration after an offline logout until a fresh login clears it', () => {
    const storage = memoryStorage();
    const cookies = new CookieJar();
    cookies.cookie = 'alistore_staff_session_hint=1; path=/; domain=.ali.kg';

    expect(markStaffSignedOut(storage, cookies, 100)).toBe(true);
    expect(isStaffSignedOut(storage, cookies)).toBe(true);
    // The parent-domain hint may survive, but the admin-origin tombstone wins.
    expect(cookies.cookie).toContain('alistore_staff_session_hint=1');

    expect(clearStaffSignedOut(storage, cookies)).toBe(true);
    expect(isStaffSignedOut(storage, cookies)).toBe(false);
  });

  it('falls back to the cookie when storage is unavailable', () => {
    const blockedStorage = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };
    const cookies = new CookieJar();
    expect(markStaffSignedOut(blockedStorage, cookies, 100)).toBe(true);
    expect(isStaffSignedOut(blockedStorage, cookies)).toBe(true);
  });

  it('reports when neither durable sign-out marker can be written', () => {
    const blockedStorage = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };
    const blockedCookies = {
      get cookie(): string { throw new DOMException('blocked', 'SecurityError'); },
      set cookie(_value: string) { throw new DOMException('blocked', 'SecurityError'); },
    };

    expect(markStaffSignedOut(blockedStorage, blockedCookies, 100)).toBe(false);
  });

  it('does not claim a successful login reset while a storage tombstone survives', () => {
    const values = new Map<string, string>([['alistore.staff.signed-out.v1', '100']]);
    const blockedRemoval = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };
    const cookies = new CookieJar();

    expect(clearStaffSignedOut(blockedRemoval, cookies)).toBe(false);
    expect(isStaffSignedOut(blockedRemoval, cookies)).toBe(true);
  });

  it('does not claim a successful login reset while a cookie tombstone survives', () => {
    const storage = memoryStorage();
    const blockedCookieRemoval = {
      get cookie(): string { return 'alistore_staff_signed_out=1'; },
      set cookie(_value: string) { throw new DOMException('blocked', 'SecurityError'); },
    };

    expect(clearStaffSignedOut(storage, blockedCookieRemoval)).toBe(false);
    expect(isStaffSignedOut(storage, blockedCookieRemoval)).toBe(true);
  });

  it('guards a localStorage getter that throws before any method is called', () => {
    const blockedWindow = {
      get localStorage(): never {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    expect(resolveStaffStorage(blockedWindow)).toBeUndefined();
  });

  it('still revokes the server session when local markers and cookie expiration are blocked', async () => {
    const blockedWindow = {
      location: { protocol: 'https:' },
      get localStorage(): never { throw new DOMException('blocked', 'SecurityError'); },
    };
    const blockedDocument = {
      get cookie(): string { throw new DOMException('blocked', 'SecurityError'); },
      set cookie(_value: string) { throw new DOMException('blocked', 'SecurityError'); },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('window', blockedWindow);
    vi.stubGlobal('document', blockedDocument);
    vi.stubGlobal('fetch', fetchMock);

    await expect(clearStaffSession()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports an unsafe logout when local markers fail and the server cannot revoke', async () => {
    const blockedWindow = {
      location: { protocol: 'https:' },
      get localStorage(): never { throw new DOMException('blocked', 'SecurityError'); },
    };
    const blockedDocument = {
      get cookie(): string { throw new DOMException('blocked', 'SecurityError'); },
      set cookie(_value: string) { throw new DOMException('blocked', 'SecurityError'); },
    };
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('window', blockedWindow);
    vi.stubGlobal('document', blockedDocument);
    vi.stubGlobal('fetch', fetchMock);

    await expect(clearStaffSession()).rejects.toThrow('Не удалось безопасно завершить сессию');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('lets the UI discard authenticated state only after server revocation succeeds', async () => {
    const storage = memoryStorage();
    const cookies = new CookieJar();
    const onSignedOut = vi.fn();
    const onError = vi.fn();
    vi.stubGlobal('window', { location: { protocol: 'https:' }, localStorage: storage });
    vi.stubGlobal('document', cookies);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await logoutStaffSession(onSignedOut, onError);

    expect(onSignedOut).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps authenticated UI state and reports the error when logout is not safe', async () => {
    const blockedWindow = {
      location: { protocol: 'https:' },
      get localStorage(): never { throw new DOMException('blocked', 'SecurityError'); },
    };
    const blockedDocument = {
      get cookie(): string { throw new DOMException('blocked', 'SecurityError'); },
      set cookie(_value: string) { throw new DOMException('blocked', 'SecurityError'); },
    };
    const onSignedOut = vi.fn();
    const onError = vi.fn();
    vi.stubGlobal('window', blockedWindow);
    vi.stubGlobal('document', blockedDocument);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await logoutStaffSession(onSignedOut, onError);

    expect(onSignedOut).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Не удалось безопасно завершить сессию'));
  });

  it('closes the local UI when its durable tombstone succeeds even if server revoke is offline', async () => {
    const storage = memoryStorage();
    const cookies = new CookieJar();
    const onSignedOut = vi.fn();
    const onError = vi.fn();
    vi.stubGlobal('window', { location: { protocol: 'https:' }, localStorage: storage });
    vi.stubGlobal('document', cookies);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await logoutStaffSession(onSignedOut, onError);

    expect(onSignedOut).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('offline');
    expect(isStaffSignedOut(storage, cookies)).toBe(true);
  });

  it('does not resurrect a session when logout races an in-flight refresh', async () => {
    const storage = memoryStorage();
    const cookies = new CookieJar();
    cookies.cookie = 'alistore_staff_session_hint=1; path=/';
    let resolveRefresh!: (value: Awaited<ReturnType<typeof staffAuthRefresh>>) => void;
    const deferredRefresh = new Promise<Awaited<ReturnType<typeof staffAuthRefresh>>>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.mocked(staffAuthRefresh).mockReturnValueOnce(deferredRefresh);
    vi.mocked(staffAuthMe).mockRejectedValue(new Error('must not be called'));
    vi.stubGlobal('window', { location: { protocol: 'https:' }, localStorage: storage });
    vi.stubGlobal('document', cookies);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const restoring = restoreStaffSession();
    await vi.waitFor(() => expect(staffAuthRefresh).toHaveBeenCalledOnce());
    const onSignedOut = vi.fn();
    const loggingOut = clearStaffSession(onSignedOut);
    resolveRefresh({
      accessToken: 'stale-access',
      staffId: '',
      username: 'seller',
      role: 'seller',
      point: 'point-1',
      storePoint: { id: 'point-1', code: 'P1', name: 'Point 1', inventoryLocation: 'MAIN' },
      totpEnabled: false,
    });

    await expect(restoring).resolves.toBeNull();
    await expect(loggingOut).resolves.toBeUndefined();
    expect(staffAuthMe).not.toHaveBeenCalled();
    expect(onSignedOut).toHaveBeenCalledOnce();
    expect(isStaffSignedOut(storage, cookies)).toBe(true);
  });

  it('aborts a stalled refresh so logout cannot leave the operational UI locked', async () => {
    const storage = memoryStorage();
    const cookies = new CookieJar() as CookieJar & {
      body: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void; hasAttribute(name: string): boolean };
    };
    const bodyAttributes = new Map<string, string>();
    cookies.body = {
      setAttribute: (name, value) => { bodyAttributes.set(name, value); },
      removeAttribute: (name) => { bodyAttributes.delete(name); },
      hasAttribute: (name) => bodyAttributes.has(name),
    };
    cookies.cookie = 'alistore_staff_session_hint=1; path=/';
    vi.mocked(staffAuthRefresh).mockImplementationOnce((signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('window', { location: { protocol: 'https:' }, localStorage: storage });
    vi.stubGlobal('document', cookies);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const restoring = restoreStaffSession();
    await vi.waitFor(() => expect(staffAuthRefresh).toHaveBeenCalledOnce());
    await logoutStaffSession(vi.fn(), vi.fn());

    await expect(restoring).resolves.toBeNull();
    expect(cookies.body.hasAttribute('inert')).toBe(false);
    expect(cookies.body.hasAttribute('aria-busy')).toBe(false);
  });

  it('aborts a stalled profile lookup after refresh before revoking logout', async () => {
    const storage = memoryStorage();
    const cookies = new CookieJar() as CookieJar & {
      body: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void; hasAttribute(name: string): boolean };
    };
    const bodyAttributes = new Map<string, string>();
    cookies.body = {
      setAttribute: (name, value) => { bodyAttributes.set(name, value); },
      removeAttribute: (name) => { bodyAttributes.delete(name); },
      hasAttribute: (name) => bodyAttributes.has(name),
    };
    cookies.cookie = 'alistore_staff_session_hint=1; path=/';
    vi.mocked(staffAuthRefresh).mockResolvedValueOnce({
      accessToken: 'rotated-access',
      staffId: '',
      username: 'seller',
      role: 'seller',
      point: 'point-1',
      storePoint: { id: 'point-1', code: 'P1', name: 'Point 1', inventoryLocation: 'MAIN' },
      totpEnabled: false,
    });
    vi.mocked(staffAuthMe).mockImplementationOnce((_accessToken, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('window', { location: { protocol: 'https:' }, localStorage: storage });
    vi.stubGlobal('document', cookies);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const restoring = restoreStaffSession();
    await vi.waitFor(() => expect(staffAuthMe).toHaveBeenCalledOnce());
    await logoutStaffSession(vi.fn(), vi.fn());

    await expect(restoring).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cookies.body.hasAttribute('inert')).toBe(false);
    expect(cookies.body.hasAttribute('aria-busy')).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function staffSession(accessToken: string, staffId = 'staff-1') {
  return {
    accessToken,
    staffId,
    username: staffId === 'staff-1' ? 'owner' : 'other-owner',
    role: 'owner',
    point: 'BISHKEK-1',
    storePoint: {
      id: 'point-1',
      code: 'BISHKEK-1',
      name: 'Bishkek',
      inventoryLocation: 'BISHKEK-1',
    },
    totpEnabled: true,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function browserModules() {
  const storage = memoryStorage();
  const cookies = new CookieJar();
  vi.stubGlobal('window', {
    localStorage: storage,
    location: { protocol: 'http:', hostname: 'localhost', host: 'localhost:3000' },
  });
  vi.stubGlobal('document', cookies);
  let lockTail = Promise.resolve<unknown>(undefined);
  vi.stubGlobal('navigator', {
    locks: {
      request: <T>(_name: string, _options: LockOptions, callback: () => Promise<T>): Promise<T> => {
        const result = lockTail.then(callback, callback);
        lockTail = result.then(() => undefined, () => undefined);
        return result;
      },
    },
  });
  const sessionModule = await import('./staff-session');
  const httpModule = await import('./api/http');
  return { cookies, httpModule, sessionModule, storage };
}

function bearer(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.authorization;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('transparent browser staff access-token refresh', () => {
  it('rotates through the HttpOnly cookie and retries the original request once', async () => {
    const { httpModule, sessionModule } = await browserModules();
    const liveSession = staffSession('expired-access');
    sessionModule.saveStaffSession(liveSession);
    const calls: Array<{ init?: RequestInit; url: string }> = [];

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/staff-auth/refresh')) return jsonResponse(staffSession('fresh-access'), 201);
      if (bearer(init) === 'Bearer expired-access') return jsonResponse({ message: 'expired' }, 401);
      return jsonResponse({ ok: true });
    }));

    await expect(httpModule.getJson('/inventory/quarantine', liveSession.accessToken))
      .resolves.toEqual({ ok: true });

    expect(calls.map(({ url }) => url.replace(/^.*\/api/u, ''))).toEqual([
      '/inventory/quarantine',
      '/staff-auth/refresh',
      '/inventory/quarantine',
    ]);
    expect(bearer(calls[2].init)).toBe('Bearer fresh-access');
    expect(calls[1].init?.credentials).toBe('include');
    expect(liveSession.accessToken).toBe('fresh-access');
    expect(sessionModule.loadStaffSession()?.accessToken).toBe('fresh-access');
  });

  it('singleflights refresh for concurrent staff 401 responses', async () => {
    const { httpModule, sessionModule } = await browserModules();
    const liveSession = staffSession('expired-access');
    sessionModule.saveStaffSession(liveSession);
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        await refreshGate;
        return jsonResponse(staffSession('fresh-access'), 201);
      }
      if (bearer(init) === 'Bearer expired-access') return jsonResponse({ message: 'expired' }, 401);
      return jsonResponse({ path: new URL(url).pathname });
    }));

    const first = httpModule.getJson<{ path: string }>('/staff-tasks/mine', liveSession.accessToken);
    const second = httpModule.getJson<{ path: string }>('/notifications', liveSession.accessToken);
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { path: '/api/staff-tasks/mine' },
      { path: '/api/notifications' },
    ]);
    expect(refreshCalls).toBe(1);
  });

  it('reuses a same-session rotation when a concurrent old-token 401 arrives later', async () => {
    const { httpModule, sessionModule } = await browserModules();
    const liveSession = staffSession('expired-access');
    sessionModule.saveStaffSession(liveSession);
    let refreshCalls = 0;
    let releaseSlow401!: () => void;
    const slow401Gate = new Promise<void>((resolve) => { releaseSlow401 = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse(staffSession('fresh-access'), 201);
      }
      if (url.endsWith('/slow') && bearer(init) === 'Bearer expired-access') await slow401Gate;
      if (bearer(init) === 'Bearer expired-access') return jsonResponse({ message: 'expired' }, 401);
      return jsonResponse({ ok: true });
    }));

    const fast = httpModule.getJson('/fast', liveSession.accessToken);
    const slow = httpModule.getJson('/slow', liveSession.accessToken);
    await expect(fast).resolves.toEqual({ ok: true });
    releaseSlow401();
    await expect(slow).resolves.toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
  });

  it('does not retry an old mutation after logout during refresh', async () => {
    const { httpModule, sessionModule } = await browserModules();
    const liveSession = staffSession('expired-access');
    sessionModule.saveStaffSession(liveSession);
    let protectedCalls = 0;
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        await refreshGate;
        return jsonResponse(staffSession('fresh-access'), 201);
      }
      if (url.endsWith('/staff-auth/logout')) return new Response(null, { status: 204 });
      protectedCalls += 1;
      return jsonResponse({ message: 'expired' }, 401);
    }));

    const mutation = httpModule.postAuthJson('/orders/order-1/fulfill', {}, liveSession.accessToken);
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    const logout = sessionModule.clearStaffSession();
    releaseRefresh();
    await logout;

    await expect(mutation).rejects.toMatchObject({ status: 401 });
    expect(protectedCalls).toBe(1);
    expect(sessionModule.loadStaffSession()).toBeNull();
  });

  it('does not replay an old mutation as a different staff login during refresh', async () => {
    const { httpModule, sessionModule } = await browserModules();
    const oldSession = staffSession('staff-a-expired', 'staff-a');
    const newSession = staffSession('staff-b-access', 'staff-b');
    sessionModule.saveStaffSession(oldSession);
    let protectedCalls = 0;
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        await refreshGate;
        return jsonResponse(staffSession('staff-a-fresh', 'staff-a'), 201);
      }
      protectedCalls += 1;
      return jsonResponse({ message: 'expired' }, 401);
    }));

    const mutation = httpModule.postAuthJson('/orders/order-1/fulfill', {}, oldSession.accessToken);
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    sessionModule.saveStaffSession(newSession);
    releaseRefresh();

    await expect(mutation).rejects.toMatchObject({ status: 401 });
    expect(protectedCalls).toBe(1);
    expect(sessionModule.loadStaffSession()).toBe(newSession);
    expect(sessionModule.loadStaffSession()?.accessToken).toBe('staff-b-access');
  });

  it('rejects a refresh response for a different staffId without retry or overwrite', async () => {
    const { httpModule, sessionModule } = await browserModules();
    const oldSession = staffSession('staff-a-expired', 'staff-a');
    sessionModule.saveStaffSession(oldSession);
    let protectedCalls = 0;

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/staff-auth/refresh')) {
        return jsonResponse(staffSession('staff-b-access', 'staff-b'), 201);
      }
      protectedCalls += 1;
      return jsonResponse({ message: 'expired' }, 401);
    }));

    await expect(httpModule.postAuthJson('/orders/order-1/fulfill', {}, oldSession.accessToken))
      .rejects.toMatchObject({ status: 401, code: 'staff_refresh_principal_mismatch' });
    expect(protectedCalls).toBe(1);
    expect(oldSession.accessToken).toBe('staff-a-expired');
    expect(sessionModule.loadStaffSession()).toBeNull();
  });

  it('serializes refresh-cookie rotation across isolated browser tabs', async () => {
    const storage = memoryStorage();
    const cookies = new CookieJar();
    vi.stubGlobal('window', {
      localStorage: storage,
      location: { protocol: 'http:', hostname: 'localhost', host: 'localhost:3000' },
    });
    vi.stubGlobal('document', cookies);

    let lockTail = Promise.resolve<unknown>(undefined);
    const lockManager = {
      request: <T>(_name: string, _options: LockOptions, callback: () => Promise<T>): Promise<T> => {
        const result = lockTail.then(callback, callback);
        lockTail = result.then(() => undefined, () => undefined);
        return result;
      },
    };
    vi.stubGlobal('navigator', { locks: lockManager });

    const tabOneSession = await import('./staff-session');
    const tabOneHttp = await import('./api/http');
    tabOneSession.saveStaffSession(staffSession('tab-one-expired'));
    vi.resetModules();
    const tabTwoSession = await import('./staff-session');
    const tabTwoHttp = await import('./api/http');
    tabTwoSession.saveStaffSession(staffSession('tab-two-expired'));

    let activeRefreshes = 0;
    let maxActiveRefreshes = 0;
    let refreshCalls = 0;
    let releaseFirstRefresh!: () => void;
    const firstRefreshGate = new Promise<void>((resolve) => { releaseFirstRefresh = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        const currentCall = refreshCalls;
        activeRefreshes += 1;
        maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes);
        if (currentCall === 1) await firstRefreshGate;
        activeRefreshes -= 1;
        return jsonResponse(staffSession(`fresh-${currentCall}`), 201);
      }
      if (bearer(init)?.includes('expired')) return jsonResponse({ message: 'expired' }, 401);
      return jsonResponse({ ok: true });
    }));

    const first = tabOneHttp.getJson('/staff-tasks/mine', 'tab-one-expired');
    const second = tabTwoHttp.getJson('/notifications', 'tab-two-expired');
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    expect(maxActiveRefreshes).toBe(1);
    releaseFirstRefresh();

    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(2);
    expect(maxActiveRefreshes).toBe(1);
  });

  it('serializes concurrent session restoration across isolated browser tabs', async () => {
    const storage = memoryStorage();
    const cookies = new CookieJar();
    cookies.cookie = 'alistore_staff_session_hint=1; path=/';
    vi.stubGlobal('window', {
      localStorage: storage,
      location: { protocol: 'http:', hostname: 'localhost', host: 'localhost:3000' },
    });
    vi.stubGlobal('document', cookies);

    let lockTail = Promise.resolve<unknown>(undefined);
    vi.stubGlobal('navigator', {
      locks: {
        request: <T>(_name: string, _options: LockOptions, callback: () => Promise<T>): Promise<T> => {
          const result = lockTail.then(callback, callback);
          lockTail = result.then(() => undefined, () => undefined);
          return result;
        },
      },
    });

    const tabOne = await import('./staff-session');
    vi.resetModules();
    const tabTwo = await import('./staff-session');
    let activeRefreshes = 0;
    let maxActiveRefreshes = 0;
    let refreshCalls = 0;
    let releaseFirstRefresh!: () => void;
    const firstRefreshGate = new Promise<void>((resolve) => { releaseFirstRefresh = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        const currentCall = refreshCalls;
        activeRefreshes += 1;
        maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes);
        if (currentCall === 1) await firstRefreshGate;
        activeRefreshes -= 1;
        return jsonResponse(staffSession(`restored-${currentCall}`), 201);
      }
      if (url.endsWith('/staff-auth/me')) {
        return jsonResponse({
          id: 'staff-1',
          username: 'owner',
          role: 'owner',
          point: 'BISHKEK-1',
          storePoint: staffSession('unused').storePoint,
          active: true,
          totpEnabled: true,
        });
      }
      throw new Error(`unexpected request ${url}`);
    }));

    const first = tabOne.restoreStaffSession();
    const second = tabTwo.restoreStaffSession();
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseFirstRefresh();
    const restored = await Promise.all([first, second]);

    expect(restored.map((session) => session?.accessToken)).toEqual(['restored-1', 'restored-2']);
    expect(refreshCalls).toBe(2);
    expect(maxActiveRefreshes).toBe(1);
  });

  it('preserves a new login when an older restore succeeds late', async () => {
    const { cookies, sessionModule } = await browserModules();
    cookies.cookie = 'alistore_staff_session_hint=1; path=/';
    const newSession = staffSession('staff-b-access', 'staff-b');
    let refreshCalls = 0;
    let meCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        await refreshGate;
        return jsonResponse(staffSession('staff-a-restored', 'staff-a'), 201);
      }
      if (url.endsWith('/staff-auth/me')) meCalls += 1;
      return jsonResponse({ message: 'unexpected' }, 500);
    }));

    const restore = sessionModule.restoreStaffSession();
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    sessionModule.saveStaffSession(newSession);
    releaseRefresh();

    await expect(restore).resolves.toBe(newSession);
    expect(meCalls).toBe(0);
    expect(sessionModule.loadStaffSession()).toBe(newSession);
  });

  it('preserves a new login when an older restore fails late', async () => {
    const { cookies, sessionModule } = await browserModules();
    cookies.cookie = 'alistore_staff_session_hint=1; path=/';
    const newSession = staffSession('staff-b-access', 'staff-b');
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        await refreshGate;
        return jsonResponse({ code: 'staff_refresh_invalid', message: 'invalid' }, 422);
      }
      throw new Error(`unexpected request ${String(input)}`);
    }));

    const restore = sessionModule.restoreStaffSession();
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    sessionModule.saveStaffSession(newSession);
    releaseRefresh();

    await expect(restore).resolves.toBe(newSession);
    expect(sessionModule.loadStaffSession()).toBe(newSession);
    expect(sessionModule.loadStaffSession()?.staffId).toBe('staff-b');
  });

  it('orders a login and its memory save after a pending restore cookie transition', async () => {
    const { cookies, sessionModule } = await browserModules();
    const staffAuth = await import('./api/staff-auth');
    cookies.cookie = 'alistore_staff_session_hint=1; path=/';
    let cookiePrincipal = 'staff-a-old';
    let loginCalls = 0;
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        await refreshGate;
        cookiePrincipal = 'staff-a';
        return jsonResponse(staffSession('staff-a-restored', 'staff-a'), 201);
      }
      if (url.endsWith('/staff-auth/me')) {
        return jsonResponse({
          id: 'staff-a', username: 'owner-a', role: 'owner', point: 'BISHKEK-1',
          storePoint: staffSession('unused').storePoint, active: true, totpEnabled: true,
        });
      }
      if (url.endsWith('/staff-auth/login')) {
        loginCalls += 1;
        cookiePrincipal = 'staff-b';
        return jsonResponse(staffSession('staff-b-access', 'staff-b'), 201);
      }
      throw new Error(`unexpected request ${url}`);
    }));

    const restore = sessionModule.restoreStaffSession();
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    const login = staffAuth.staffLogin('owner-b', 'password', undefined, sessionModule.saveStaffSession);
    await Promise.resolve();
    expect(loginCalls).toBe(0);
    expect(cookiePrincipal).toBe('staff-a-old');
    releaseRefresh();

    await expect(restore).resolves.toMatchObject({ staffId: 'staff-a' });
    await expect(login).resolves.toMatchObject({ staffId: 'staff-b' });
    expect(cookiePrincipal).toBe('staff-b');
    expect(sessionModule.loadStaffSession()).toMatchObject({ staffId: 'staff-b', accessToken: 'staff-b-access' });
  });

  it('orders logout after a pending refresh and leaves cookie and memory signed out', async () => {
    const { httpModule, sessionModule } = await browserModules();
    const liveSession = staffSession('staff-a-expired', 'staff-a');
    sessionModule.saveStaffSession(liveSession);
    let cookiePrincipal: string | null = 'staff-a';
    let logoutCalls = 0;
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        await refreshGate;
        cookiePrincipal = 'staff-a';
        return jsonResponse(staffSession('staff-a-fresh', 'staff-a'), 201);
      }
      if (url.endsWith('/staff-auth/logout')) {
        logoutCalls += 1;
        cookiePrincipal = null;
        return new Response(null, { status: 204 });
      }
      if (bearer(init) === 'Bearer staff-a-expired') return jsonResponse({ message: 'expired' }, 401);
      return jsonResponse({ ok: true });
    }));

    const request = httpModule.getJson('/staff-tasks/mine', liveSession.accessToken);
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    const logout = sessionModule.clearStaffSession();
    await Promise.resolve();
    expect(logoutCalls).toBe(0);
    releaseRefresh();
    await logout;

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(cookiePrincipal).toBeNull();
    expect(sessionModule.loadStaffSession()).toBeNull();
    expect(logoutCalls).toBe(1);
  });

  it('revalidates the captured identity immediately before replay', async () => {
    const { httpModule } = await browserModules();
    const identity = { generation: 1, staffId: 'staff-a' };
    let current = true;
    httpModule.configureStaffAccessTokenRecovery({
      captureStaffSession: () => identity,
      refreshStaffAccessToken: async () => {
        await Promise.resolve();
        current = false;
        return 'fresh-access';
      },
      isStaffSessionCurrent: () => current,
    });
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpModule.postAuthJson('/orders/order-1/fulfill', {}, 'expired-access'))
      .rejects.toMatchObject({ status: 401, message: 'Staff-сессия была изменена' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears local session state after a terminal refresh rejection', async () => {
    const { cookies, httpModule, sessionModule, storage } = await browserModules();
    const liveSession = staffSession('expired-access');
    sessionModule.saveStaffSession(liveSession);
    let refreshCalls = 0;

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse({ code: 'staff_refresh_invalid', message: 'invalid' }, 422);
      }
      return jsonResponse({ message: 'expired' }, 401);
    }));

    await expect(httpModule.getJson('/inventory/quarantine', liveSession.accessToken))
      .rejects.toMatchObject({ status: 422, code: 'staff_refresh_invalid' });
    expect(sessionModule.loadStaffSession()).toBeNull();
    expect(storage.getItem(sessionModule.STAFF_SESSION_KEY)).toBeNull();
    expect(sessionModule.isStaffSignedOut(storage, cookies)).toBe(true);

    // The old bearer is no longer classified as staff, so later 401s cannot
    // repeatedly hit the refresh endpoint.
    await expect(httpModule.getJson('/inventory/quarantine', liveSession.accessToken))
      .rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(1);
  });

  it('retains the session for non-terminal refresh validation failures', async () => {
    const { httpModule, sessionModule } = await browserModules();
    const liveSession = staffSession('expired-access');
    sessionModule.saveStaffSession(liveSession);

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/staff-auth/refresh')) {
        return jsonResponse({ code: 'unrelated_validation', message: 'retry later' }, 422);
      }
      return jsonResponse({ message: 'expired' }, 401);
    }));

    await expect(httpModule.getJson('/inventory/quarantine', liveSession.accessToken))
      .rejects.toMatchObject({ status: 422, code: 'unrelated_validation' });
    expect(sessionModule.loadStaffSession()).toBe(liveSession);
  });

  it.each([403, 500])('does not refresh or retry an authenticated staff %s', async (status) => {
    const { httpModule, sessionModule } = await browserModules();
    const liveSession = staffSession('staff-access');
    sessionModule.saveStaffSession(liveSession);
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'failed' }, status));
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpModule.getJson('/inventory/quarantine', liveSession.accessToken))
      .rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never treats a customer bearer as the active staff session', async () => {
    const { httpModule, sessionModule } = await browserModules();
    sessionModule.saveStaffSession(staffSession('staff-access'));
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpModule.getJson('/orders/mine', 'customer-access'))
      .rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops after one retry when the refreshed bearer is also rejected', async () => {
    const { httpModule, sessionModule } = await browserModules();
    const liveSession = staffSession('expired-access');
    sessionModule.saveStaffSession(liveSession);
    let protectedCalls = 0;
    let refreshCalls = 0;

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/staff-auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse(staffSession('fresh-but-rejected'), 201);
      }
      protectedCalls += 1;
      return jsonResponse({ message: 'unauthorized' }, 401);
    }));

    await expect(httpModule.getJson('/inventory/quarantine', liveSession.accessToken))
      .rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(2);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  completeAuthFlow,
  createCrossTabRefresh,
  createSessionMutationCoordinator,
  createSingleFlight,
  clearClientSignedOut,
  isLogoutStorageEvent,
  isClientSignedOut,
  markClientSignedOut,
  runAuthHydration,
  safeStorageRemove,
  type ExclusiveLockManager,
} from './auth';

function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => { resolve = done; }),
    resolve,
  };
}

class TestLockManager implements ExclusiveLockManager {
  private tail: Promise<void> = Promise.resolve();

  request<T>(
    _name: string,
    _options: { mode: 'exclusive' },
    callback: () => Promise<T>,
  ): Promise<T> {
    const result = this.tail.then(callback);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

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
    if (/Max-Age=0/i.test(serialized)) this.values.delete(key);
    else this.values.set(key, value);
  }
}

describe('createSingleFlight', () => {
  it('coalesces concurrent calls and allows a later refresh after settlement', async () => {
    let resolveFirst!: (value: string) => void;
    const operation = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce('second');
    const run = createSingleFlight(operation);

    const first = run();
    const concurrent = run();
    expect(operation).toHaveBeenCalledTimes(1);

    resolveFirst('first');
    await expect(Promise.all([first, concurrent])).resolves.toEqual(['first', 'first']);
    await expect(run()).resolves.toBe('second');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('durable client sign-out', () => {
  it('suppresses reload refresh after failed logout and successful login clears the tombstone', async () => {
    const storage = memoryStorage();
    const cookies = new CookieJar();
    cookies.cookie = 'alistore_session_hint=1; Path=/';

    // Local sign-out happens before the server request; a rejected request
    // intentionally leaves the marker in place for the next provider mount.
    markClientSignedOut(storage, cookies, 100);
    expect(cookies.cookie).not.toContain('alistore_session_hint=');
    expect(isClientSignedOut(storage, cookies)).toBe(true);

    // A new provider/hydration observes the same storage/cookie state and must
    // not use a surviving HttpOnly refresh cookie.
    expect(isClientSignedOut(storage, cookies)).toBe(true);

    await completeAuthFlow(
      { current: 0 },
      async () => ({ accessToken: 'new-session' }),
      async () => ({ customerId: 'customer-1' }),
      () => clearClientSignedOut(storage, cookies),
    );
    expect(isClientSignedOut(storage, cookies)).toBe(false);
  });

  it('does not treat successful-auth tombstone removal in another tab as logout', () => {
    const sharedStorage = memoryStorage();
    const cookies = new CookieJar();
    markClientSignedOut(sharedStorage, cookies, 100);

    cookies.cookie = 'alistore_session_hint=1; Path=/';
    clearClientSignedOut(sharedStorage, cookies);

    const peerEvent = {
      key: 'alistore.auth.signed-out.v1',
      newValue: null,
    };
    expect(isLogoutStorageEvent(peerEvent)).toBe(false);
    expect(cookies.cookie).toContain('alistore_session_hint=1');
  });

  it('always finishes hydration when browser storage operations throw SecurityError', async () => {
    const blockedStorage = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };
    const finish = vi.fn();

    await runAuthHydration(async () => {
      expect(safeStorageRemove(blockedStorage, 'alistore.auth.v1')).toBe(false);
      expect(isClientSignedOut(blockedStorage, undefined)).toBe(false);
    }, finish);

    expect(finish).toHaveBeenCalledOnce();
  });
});

describe('completeAuthFlow generation guard', () => {
  it('does not commit a late login response after logout advances the generation', async () => {
    const generation = { current: 0 };
    const tokens = deferred<{ accessToken: string }>();
    const commit = vi.fn();
    const completion = completeAuthFlow(
      generation,
      () => tokens.promise,
      async () => ({ customerId: 'customer-1' }),
      commit,
    );

    generation.current += 1;
    tokens.resolve({ accessToken: 'late-access' });

    await expect(completion).resolves.toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it('does not commit when logout happens while the late authMe is pending', async () => {
    const generation = { current: 0 };
    const user = deferred<{ customerId: string }>();
    const commit = vi.fn();
    const completion = completeAuthFlow(
      generation,
      async () => ({ accessToken: 'access' }),
      () => user.promise,
      commit,
    );
    await vi.waitFor(() => expect(commit).not.toHaveBeenCalled());

    generation.current += 1;
    user.resolve({ customerId: 'late-customer' });

    await expect(completion).resolves.toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('createCrossTabRefresh', () => {
  it('serializes two independent tab coordinators and re-checks the non-secret epoch before refreshing', async () => {
    const locks = new TestLockManager();
    let epoch = 0;
    let cookieVersion = 1;
    let releaseFirst!: () => void;
    const observations: string[] = [];

    const firstTab = createCrossTabRefresh(async () => {
      observations.push(`first:cookie-${cookieVersion}:epoch-${epoch}`);
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      cookieVersion = 2;
      return 'first-access-token';
    }, {
      locks,
      readEpoch: () => epoch,
      writeEpoch: (next) => { epoch = next; },
      now: () => 100,
    });
    const secondTab = createCrossTabRefresh(async () => {
      observations.push(`second:cookie-${cookieVersion}:epoch-${epoch}`);
      cookieVersion = 3;
      return 'second-access-token';
    }, {
      locks,
      readEpoch: () => epoch,
      writeEpoch: (next) => { epoch = next; },
      now: () => 100,
    });

    const first = firstTab();
    const second = secondTab();
    await vi.waitFor(() => expect(observations).toEqual(['first:cookie-1:epoch-0']));

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([
      'first-access-token',
      'second-access-token',
    ]);
    expect(observations).toEqual([
      'first:cookie-1:epoch-0',
      'second:cookie-2:epoch-100',
    ]);
    expect(epoch).toBe(101);
  });

  it('restores/refreshes with in-provider single-flight when Web Locks are unavailable', async () => {
    const operation = vi.fn(async () => 'fresh');
    vi.stubEnv('NEXT_PUBLIC_AUTH_REFRESH_ROTATION_GRACE_ENABLED', 'true');
    try {
      const refresh = createCrossTabRefresh(operation, { locks: null });

      await expect(Promise.all([refresh(), refresh()])).resolves.toEqual(['fresh', 'fresh']);
      expect(operation).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('fails closed without Web Locks while server rotation grace is disabled', async () => {
    const operation = vi.fn(async () => 'must-not-refresh');
    vi.stubEnv('NEXT_PUBLIC_AUTH_REFRESH_ROTATION_GRACE_ENABLED', 'false');
    try {
      const refresh = createCrossTabRefresh(operation, { locks: null });

      await expect(refresh()).rejects.toThrow('refresh_coordination_unavailable');
      expect(operation).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('allows independent lockless tab coordinators to rely on server rotation grace', async () => {
    const firstOperation = vi.fn(async () => 'first-fresh');
    const secondOperation = vi.fn(async () => 'second-fresh');
    const firstTab = createCrossTabRefresh(firstOperation, {
      locks: null,
      serverGraceEnabled: true,
    });
    const secondTab = createCrossTabRefresh(secondOperation, {
      locks: null,
      serverGraceEnabled: true,
    });

    await expect(Promise.all([firstTab(), secondTab()])).resolves.toEqual([
      'first-fresh',
      'second-fresh',
    ]);
    expect(firstOperation).toHaveBeenCalledTimes(1);
    expect(secondOperation).toHaveBeenCalledTimes(1);
  });
});

describe('createSessionMutationCoordinator', () => {
  it('waits for a held refresh before logout clears the rotated cookie', async () => {
    const locks = new TestLockManager();
    let epoch = 0;
    let cookieVersion = 1;
    let releaseRefresh!: () => void;
    const observations: string[] = [];
    const coordination = {
      locks,
      readEpoch: () => epoch,
      writeEpoch: (next: number) => { epoch = next; },
      now: () => 100,
    };
    const refreshTab = createSessionMutationCoordinator(async () => {
      observations.push(`refresh:cookie-${cookieVersion}:epoch-${epoch}`);
      await new Promise<void>((resolve) => { releaseRefresh = resolve; });
      cookieVersion = 2;
      return 'fresh-access';
    }, async () => undefined, coordination);
    const logoutTab = createSessionMutationCoordinator(async () => 'unused', async () => {
      observations.push(`logout:cookie-${cookieVersion}:epoch-${epoch}`);
      cookieVersion = 0;
    }, coordination);

    const refresh = refreshTab.refresh();
    const logout = logoutTab.logout();
    await vi.waitFor(() => expect(observations).toEqual(['refresh:cookie-1:epoch-0']));

    releaseRefresh();
    await expect(Promise.all([refresh, logout])).resolves.toEqual(['fresh-access', undefined]);
    expect(observations).toEqual([
      'refresh:cookie-1:epoch-0',
      'logout:cookie-2:epoch-100',
    ]);
    expect(cookieVersion).toBe(0);
    expect(epoch).toBe(101);
  });

  it('lockless logout clears local generation before best-effort server cleanup and blocks a stale completion', async () => {
    const generation = { current: 0 };
    let localAccess: string | null = 'old-access';
    const staleTokens = deferred<{ accessToken: string }>();
    const commit = vi.fn((tokens: { accessToken: string }) => {
      localAccess = tokens.accessToken;
    });
    const staleCompletion = completeAuthFlow(
      generation,
      () => staleTokens.promise,
      async () => ({ customerId: 'customer-1' }),
      commit,
    );
    const serverLogout = vi.fn().mockRejectedValue(new Error('offline'));
    const coordinator = createSessionMutationCoordinator(
      vi.fn(async () => ({ accessToken: 'must-not-refresh' })),
      serverLogout,
      { locks: null },
    );

    generation.current += 1;
    localAccess = null;
    await expect(coordinator.logout()).rejects.toThrow('offline');
    staleTokens.resolve({ accessToken: 'late-refresh-access' });

    await expect(staleCompletion).resolves.toBe(false);
    expect(localAccess).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    expect(serverLogout).toHaveBeenCalledTimes(1);
  });
});

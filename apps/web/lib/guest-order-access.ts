const STORAGE_KEY = 'alistore.guest-order-access.v1';

type StoredAccess = { capability: string; expiresAt: number };
type StoredAccessMap = Record<string, StoredAccess>;

function readMap(): StoredAccessMap {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredAccessMap;
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeMap(value: StoredAccessMap) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function tokenExpiry(capability: string): number | null {
  try {
    const payload = capability.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims = JSON.parse(window.atob(normalized)) as { exp?: number };
    return Number.isFinite(claims.exp) ? Number(claims.exp) * 1000 : null;
  } catch {
    return null;
  }
}

export function saveGuestOrderAccess(orderId: string, capability: string, expiresInSeconds?: number) {
  if (typeof window === 'undefined' || !orderId || !capability) return;
  const expiresAt = tokenExpiry(capability) ?? Date.now() + Math.max(60, expiresInSeconds ?? 0) * 1000;
  const map = readMap();
  map[orderId] = { capability, expiresAt };
  writeMap(map);
}

export function readGuestOrderAccess(orderId: string): string | null {
  if (typeof window === 'undefined') return null;
  const map = readMap();
  const access = map[orderId];
  if (!access) return null;
  if (access.expiresAt <= Date.now()) {
    delete map[orderId];
    writeMap(map);
    return null;
  }
  return access.capability;
}

export function captureGuestOrderAccess(orderId: string): string | null {
  if (typeof window === 'undefined') return null;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const capability = fragment.get('access');
  if (capability) {
    saveGuestOrderAccess(orderId, capability);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    return capability;
  }
  return readGuestOrderAccess(orderId);
}

export function guestOrderLink(orderId: string, capability: string): string {
  return `/order/${encodeURIComponent(orderId)}#access=${encodeURIComponent(capability)}`;
}

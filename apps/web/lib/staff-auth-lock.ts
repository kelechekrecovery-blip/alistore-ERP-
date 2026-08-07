import { ApiError } from './api/http';

const STAFF_AUTH_COOKIE_LOCK = 'alistore.staff.auth-cookie.v1';
declare const staffAuthCookieLockBrand: unique symbol;

/** Capability supplied only while the origin-wide cookie lock is held. */
export interface StaffAuthCookieLock {
  readonly [staffAuthCookieLockBrand]: true;
}

const LOCK_CAPABILITY = {} as StaffAuthCookieLock;

/**
 * Serialize every transition that can rotate or replace the shared HttpOnly
 * staff cookies. Callers that already hold this lock must use the explicitly
 * named `WithinLock` API helpers; Web Locks are not re-entrant.
 */
export async function withStaffAuthCookieLock<T>(
  operation: (lock: StaffAuthCookieLock) => Promise<T>,
): Promise<T> {
  if (typeof window === 'undefined') return operation(LOCK_CAPABILITY);
  if (typeof navigator === 'undefined' || !navigator.locks) {
    throw new ApiError(401, 'Браузер не поддерживает безопасное обновление staff-сессии');
  }
  return navigator.locks.request(
    STAFF_AUTH_COOKIE_LOCK,
    { mode: 'exclusive' },
    () => operation(LOCK_CAPABILITY),
  );
}

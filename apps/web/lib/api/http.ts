/**
 * Resolve the API base URL.
 *
 * Preference order:
 *  1. `NEXT_PUBLIC_API_BASE` when configured at build time (the intended path).
 *  2. Browser self-heal: if the bundle was deployed WITHOUT that env var to a
 *     real (non-localhost) host, use same-origin `/api`. This
 *     prevents a prod deploy that forgot the env var from calling
 *     `http://localhost:4000` (which is CORS-blocked from an https origin and
 *     also keeps web and native clients on the canonical ali.kg contract).
 *  3. Local dev default.
 */
function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE;
  if (configured && configured.trim().length > 0) return configured;

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    const isLocalHost =
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
    if (!isLocalHost) {
      return `${protocol}//${window.location.host}/api`;
    }
  }

  return 'http://localhost:4000/api';
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * True only when the caller genuinely lacks the permission for an optional
 * surface, so rendering it empty is the honest outcome.
 *
 * Optional panels (an assignee roster the viewer may not read, a widget behind
 * a narrower scope) legitimately degrade to empty. The trap is a catch handler
 * that resets the list to empty for every rejection alike: a timeout, a 500 and
 * a genuine 403 then produce the same silent empty state, and the surface
 * reports a broken backend as "you have no data". Swallow only what this
 * returns true for; surface the rest.
 */
export function isPermissionDenied(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/**
 * Domain errors (`apps/api/src/common/errors.ts` DomainError) reply with
 * `{ statusCode, code, message }`. The `code` is machine-readable and stable;
 * `message` is server prose that may change wording. Callers that need to
 * render specific Russian copy per failure reason (see `lib/auth-errors.ts`)
 * should switch on `code`, not parse `message`.
 */
async function responseError(res: Response): Promise<ApiError> {
  const detail = await res.json().catch(() => ({}));
  const parsed = detail as { message?: string; code?: string };
  return new ApiError(res.status, parsed.message ?? `request failed ${res.status}`, parsed.code);
}

/** POST JSON and unwrap the response, surfacing the API's error message on failure. */
export async function postJson<T>(path: string, body: unknown, headers?: Record<string, string>, credentials = false): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    ...(credentials ? { credentials: 'include' as const } : {}),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await responseError(res);
  return (await res.json()) as T;
}

/** Authenticated POST JSON (Bearer token). */
export async function postAuthJson<T>(
  path: string,
  body: unknown,
  accessToken: string,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await responseError(res);
  return (await res.json()) as T;
}

/**
 * Authenticated POST JSON (Bearer token) for endpoints that reply with no
 * body (e.g. `POST /auth/email/attach/confirm`). Never parses the response
 * as JSON on success — only `responseError` does, and only on failure.
 */
export async function postAuthVoid(
  path: string,
  body: unknown,
  accessToken: string,
  headers?: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await responseError(res);
}

/** Authenticated PATCH JSON (Bearer token). */
export async function patchAuthJson<T>(
  path: string,
  body: unknown,
  accessToken: string,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await responseError(res);
  return (await res.json()) as T;
}

/** Authenticated PUT JSON (Bearer token). */
export async function putAuthJson<T>(
  path: string,
  body: unknown,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await responseError(res);
  return (await res.json()) as T;
}

/** Authenticated DELETE JSON (Bearer token). */
export async function deleteAuthJson<T>(
  path: string,
  body: unknown,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await responseError(res);
  return (await res.json()) as T;
}

/** Authenticated GET (Bearer token). Throws on non-2xx. */
export async function getJson<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw await responseError(res);
  return (await res.json()) as T;
}

/**
 * GET без авторизации. Нужен для данных, которые читает ещё не вошедший
 * посетитель — например справочник живых способов входа на `/login`.
 */
export async function getPublicJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw await responseError(res);
  return (await res.json()) as T;
}

/** Authenticated binary download for server-generated documents. */
export async function getAuthBlob(path: string, accessToken: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw await responseError(res);
  return res.blob();
}

/** Save a Blob as a file in the browser via a temporary object URL. */
export function saveBlobAs(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Authenticated file download (Bearer): fetches the body and saves it under `filename`. */
export async function downloadAuthFile(path: string, accessToken: string, filename: string): Promise<void> {
  saveBlobAs(await getAuthBlob(path, accessToken), filename);
}

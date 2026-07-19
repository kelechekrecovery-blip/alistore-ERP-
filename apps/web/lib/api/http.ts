/**
 * Resolve the API base URL.
 *
 * Preference order:
 *  1. `NEXT_PUBLIC_API_BASE` when configured at build time (the intended path).
 *  2. Browser self-heal: if the bundle was deployed WITHOUT that env var to a
 *     real (non-localhost) host, derive `https://api.<apex>/api` from the current
 *     origin instead of silently falling back to the dev localhost API. This
 *     prevents a prod deploy that forgot the env var from calling
 *     `http://localhost:4000` (which is CORS-blocked from an https origin and
 *     leaves the storefront with no data).
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
      const apex = hostname.replace(/^www\./, '');
      return `${protocol}//api.${apex}/api`;
    }
  }

  return 'http://localhost:4000/api';
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function responseError(res: Response): Promise<ApiError> {
  const detail = await res.json().catch(() => ({}));
  return new ApiError(res.status, (detail as { message?: string }).message ?? `request failed ${res.status}`);
}

/** POST JSON and unwrap the response, surfacing the API's error message on failure. */
export async function postJson<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
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

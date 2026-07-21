import { API_BASE, ApiError } from './http';

/** Shape returned by `POST /media` (apps/api/src/media/media.service.ts). */
export interface UploadedImage {
  key: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  format: 'webp';
}

/** Same ceiling the API enforces — checked here so the user gets a message, not a 413. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Upload an image and get back a public URL.
 *
 * The endpoint has existed since the media module was added, but nothing in the
 * web app ever called it: every image field was a text input expecting an
 * already-hosted `https://…` URL, and the documented way to add a product photo
 * was to drop a file into `apps/web/public/products/` and edit the seed — i.e. a
 * code deploy for a picture. This client closes that gap.
 *
 * Staff-only (`media:upload` → marketer/admin/owner), 8 MB cap, 20 uploads/min.
 */
export async function uploadImage(file: File, accessToken: string): Promise<UploadedImage> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(413, `Файл ${(file.size / 1024 / 1024).toFixed(1)} МБ — максимум 8 МБ`);
  }
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!res.ok) {
    let message = `Загрузка не удалась (${res.status})`;
    try {
      const payload = (await res.json()) as { message?: string };
      if (payload.message) message = payload.message;
      // fixtures-allowed: внутренний catch лишь оставляет текст по умолчанию — ошибка всё равно бросается ApiError ниже
    } catch {
      // A non-JSON body (proxy error page, 413 from the body parser) keeps the default text.
    }
    if (res.status === 429) message = 'Слишком часто — не больше 20 загрузок в минуту';
    if (res.status === 403) message = 'Нет права на загрузку изображений';
    if (res.status === 401) message = 'Сессия истекла — войдите снова';
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as UploadedImage;
}

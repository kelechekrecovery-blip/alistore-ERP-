'use client';

import { ImageUp, Loader2, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api/http';
import { MAX_IMAGE_BYTES, uploadImage } from '@/lib/api/media';

/**
 * Local storage returns a root-relative key (`/uploads/media/…`) that is served by
 * the API, not by Next — so a bare `<img src>` would resolve it against the web
 * origin and render broken. S3 returns an absolute URL and passes through.
 */
function previewSrc(value: string): string {
  if (!value.startsWith('/')) return value;
  const apiOrigin = API_BASE.replace(/\/api\/?$/, '');
  return `${apiOrigin}${value}`;
}

const FIELD = 'w-full rounded-[8px] border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:border-coral';

interface ImageFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  accessToken: string;
  /** Storage prefix hint shown to the operator, e.g. «баннер витрины». */
  hint?: string;
}

/**
 * Image picker that actually uploads.
 *
 * Every image input in the ERP used to be a bare text box expecting an
 * `https://…` URL that somebody had already put in the bucket by hand — and no
 * screen in the app could put it there, so the documented way to add a product
 * photo was to commit the file and redeploy. `POST /media` existed the whole
 * time with zero callers.
 *
 * The text field stays: pasting a URL still works (external CDN, an image
 * already in the bucket), and it is the escape hatch when upload is unavailable.
 */
export function ImageField({ label, value, onChange, accessToken, hint }: ImageFieldProps) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const image = await uploadImage(file, accessToken);
      onChange(image.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить изображение');
    } finally {
      setBusy(false);
      // Allow re-picking the same file after a failure.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="grid gap-1.5 text-xs text-muted">
      <label htmlFor={inputId}>{label}</label>
      <div className="flex items-start gap-2">
        {value ? (
          <div className="relative shrink-0">
            {/* Operator-supplied URL from any origin — next/image would need a host allowlist. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc(value)}
              alt=""
              className="h-[42px] w-[62px] rounded-[7px] border border-surface-3 bg-night object-cover"
            />
            <button
              type="button"
              title="Убрать изображение"
              aria-label="Убрать изображение"
              onClick={() => onChange('')}
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-surface-3 bg-night text-muted hover:text-white"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <div className="grid h-[42px] w-[62px] shrink-0 place-items-center rounded-[7px] border border-dashed border-surface-3 bg-night text-subtle">
            <ImageUp size={15} />
          </div>
        )}

        <div className="grid flex-1 gap-1.5">
          <input
            id={inputId}
            className={FIELD}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="https://media… или загрузите файл"
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] border border-surface-3 bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:border-coral disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <ImageUp size={12} />}
              {busy ? 'Загружаем…' : 'Загрузить файл'}
            </button>
            <span className="min-w-0 text-[10px] leading-4 text-subtle">
              {hint ? `${hint} · ` : ''}до {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} МБ, конвертируется в WebP
            </span>
          </div>
        </div>
      </div>
      {error && <p role="alert" className="text-[11px] text-danger-soft">{error}</p>}
    </div>
  );
}

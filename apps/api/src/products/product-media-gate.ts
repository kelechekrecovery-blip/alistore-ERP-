export type ProductMediaReadiness = {
  ready: boolean;
  imageCount: number;
  mediaKeys: string[];
  reasons: string[];
};

function isProductMediaKey(value: unknown): value is string {
  return typeof value === 'string' && /^media\/[0-9a-f-]{36}\.webp$/i.test(value.trim());
}

/**
 * Pure publication check shared by the API and tests. A generic category icon
 * is a presentation fallback, never proof that a real SKU photo was approved.
 */
export function assessProductMedia(attrs: unknown): ProductMediaReadiness {
  const record = attrs && typeof attrs === 'object' && !Array.isArray(attrs)
    ? attrs as Record<string, unknown>
    : {};
  const extraKeys = Array.isArray(record.mediaKeys) ? record.mediaKeys : [];
  const mediaKeys = [record.imageKey, ...extraKeys]
    .filter(isProductMediaKey)
    .map((value) => value.trim());
  const keys = [...new Set(mediaKeys)];
  const imageCount = keys.length;
  return {
    ready: imageCount > 0,
    imageCount,
    mediaKeys: keys,
    reasons: imageCount > 0 ? [] : ['Загрузите фото через медиатеку AliStore'],
  };
}

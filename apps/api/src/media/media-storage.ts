export interface StoredObject {
  key: string;
  url: string;
  bytes: number;
}

/** Pluggable object store for media. LocalDiskStorage (dev) or S3Storage (MinIO). */
export interface MediaStorage {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

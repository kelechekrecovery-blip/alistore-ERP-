import { MediaStorage } from './media-storage';
export interface IngestedImage {
    key: string;
    url: string;
    width: number;
    height: number;
    bytes: number;
    format: 'webp';
}
export interface PreparedImage {
    data: Buffer;
    width: number;
    height: number;
}
export declare const MEDIA_UPLOAD_TIMEOUT_MS: number;
export declare class MediaService {
    private readonly storage;
    constructor(storage: MediaStorage);
    createImageKey(prefix?: string): string;
    ingestImage(input: Buffer, prefix?: string, objectKey?: string): Promise<IngestedImage>;
    prepareImage(input: Buffer): Promise<PreparedImage>;
    storePreparedImage(prepared: PreparedImage, prefix?: string, objectKey?: string): Promise<IngestedImage>;
    deleteImage(key: string): Promise<void>;
    getReadUrl(key: string): Promise<string>;
}

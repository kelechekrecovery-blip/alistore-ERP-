export interface StoredObject {
    key: string;
    url: string;
    bytes: number;
}
export interface MediaStorage {
    put(key: string, body: Buffer, contentType: string, signal?: AbortSignal): Promise<StoredObject>;
    delete(key: string): Promise<void>;
    getReadUrl(key: string): Promise<string>;
}
export declare const MEDIA_STORAGE: unique symbol;

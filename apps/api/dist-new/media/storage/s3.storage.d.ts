import { ConfigService } from '@nestjs/config';
import { MediaStorage, StoredObject } from '../media-storage';
export declare class S3Storage implements MediaStorage {
    private readonly client;
    private readonly bucket;
    private readonly publicBase;
    private readonly evidenceUrlTtl;
    constructor(config: ConfigService);
    put(key: string, body: Buffer, contentType: string, signal?: AbortSignal): Promise<StoredObject>;
    delete(key: string): Promise<void>;
    getReadUrl(key: string): Promise<string>;
}

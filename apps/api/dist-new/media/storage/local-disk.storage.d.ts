import { ConfigService } from '@nestjs/config';
import { MediaStorage, StoredObject } from '../media-storage';
export declare class LocalDiskStorage implements MediaStorage {
    private readonly dir;
    private readonly publicBase;
    constructor(config: ConfigService);
    put(key: string, body: Buffer, _contentType: string, signal?: AbortSignal): Promise<StoredObject>;
    delete(key: string): Promise<void>;
    getReadUrl(key: string): Promise<string>;
}

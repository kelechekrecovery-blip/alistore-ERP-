import type { LlmImageBlock } from './llm-client';
export interface PhotoRef {
    url?: string;
    label?: string;
}
export interface ResolvedPhoto extends LlmImageBlock {
    label?: string;
}
export declare function resolvePhotoImages(photos: PhotoRef[], opts?: {
    localDir?: string;
    publicBase?: string;
}): Promise<ResolvedPhoto[]>;

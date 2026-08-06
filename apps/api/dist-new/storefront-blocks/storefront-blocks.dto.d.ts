import { StorefrontBlockDevice, StorefrontBlockType } from '@prisma/client';
export declare class CreateStorefrontBlockDto {
    type: StorefrontBlockType;
    device?: StorefrontBlockDevice;
    title: string;
    eyebrow?: string;
    body?: string;
    ctaLabel?: string;
    ctaHref?: string;
    imageUrl?: string;
    tone?: string;
    productIds?: string[];
}
export declare class UpdateStorefrontBlockDto {
    type?: StorefrontBlockType;
    device?: StorefrontBlockDevice;
    title?: string;
    eyebrow?: string;
    body?: string;
    ctaLabel?: string;
    ctaHref?: string;
    imageUrl?: string;
    tone?: string;
    productIds?: string[];
}
export declare class ScheduleStorefrontBlockDto {
    startsAt: string;
    endsAt?: string;
}
export declare class ReorderStorefrontBlocksDto {
    ids: string[];
}

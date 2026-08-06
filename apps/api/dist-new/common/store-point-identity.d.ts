import { Prisma, StorePoint } from '@prisma/client';
type StorePointReader = {
    storePoint: {
        findFirst(args: Prisma.StorePointFindFirstArgs): Promise<StorePoint | null>;
    };
};
export declare function storePointIdentityWhere(rawReference: string): Prisma.StorePointWhereInput;
export declare function resolveActiveStorePoint(db: StorePointReader, rawReference: string | null | undefined, message?: string): Promise<StorePoint>;
export {};

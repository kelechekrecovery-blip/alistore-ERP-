import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare class UnitsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listAvailable(productId: string, limit: number): Prisma.PrismaPromise<{
        id: string;
        orderId: string | null;
        status: import(".prisma/client").$Enums.UnitStatus;
        updatedAt: Date;
        location: string;
        productId: string;
        imei: string;
        grade: import(".prisma/client").$Enums.Grade | null;
        acquisitionCost: number | null;
        supplyQuarantineResolutionId: string | null;
    }[]>;
    getByImei(imei: string): Promise<{
        imei: string;
        productId: string;
        status: import(".prisma/client").$Enums.UnitStatus;
        location: string;
        orderId: string | null;
        product: string;
        sku: string;
        price: number;
    }>;
    getForSaleByImei(imei: string): Promise<{
        imei: string;
        productId: string;
        status: import(".prisma/client").$Enums.UnitStatus;
        location: string;
        orderId: string | null;
        product: string;
        sku: string;
        price: number;
        acquisitionCost: number | null;
        productCost: number;
    }>;
    receive(input: {
        imei: string;
        productId: string;
        location: string;
        grade?: 'A' | 'B' | 'C';
    }): Promise<{
        id: string;
        orderId: string | null;
        status: import(".prisma/client").$Enums.UnitStatus;
        updatedAt: Date;
        location: string;
        productId: string;
        imei: string;
        grade: import(".prisma/client").$Enums.Grade | null;
        acquisitionCost: number | null;
        supplyQuarantineResolutionId: string | null;
    }>;
    reserveOnTx(tx: Prisma.TransactionClient, imei: string, orderId: string): Promise<void>;
    sellOnTx(tx: Prisma.TransactionClient, imei: string, orderId: string, actor?: string): Promise<{
        issue: {
            id: string;
            sourceType: string;
            sourceRef: string;
            orderId: string | null;
            createdAt: Date;
            location: string;
            unitCost: number;
            productId: string;
            quantity: number;
            reversedQty: number;
            totalCost: number;
            layerId: string | null;
            imei: string | null;
        };
        entry: {
            idempotent: boolean;
            id: string;
            idempotencyKey: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            point: string | null;
            currency: string;
            documentAmount: number | null;
            exchangeRateMicros: number;
            baseAmount: number | null;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            reversalOfId: string | null;
            lines: Array<{
                accountCode: string;
                debit: number;
                credit: number;
                memo: string | null;
            }>;
        } | null;
    } | null>;
    releaseOnTx(tx: Prisma.TransactionClient, imei: string, orderId: string): Promise<boolean>;
}

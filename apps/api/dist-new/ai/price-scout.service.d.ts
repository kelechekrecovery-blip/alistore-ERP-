import { PrismaService } from '../prisma/prisma.service';
import { PriceScoutResult } from './price-scout';
export declare class PriceScoutService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    scout(dto: {
        sku?: string;
        name?: string;
        category?: string;
        basePrice?: number;
        observedListings?: {
            title?: string;
            source?: string;
            condition?: string;
            price: number;
        }[];
    }): Promise<PriceScoutResult>;
    private resolve;
}

import { PrismaService } from '../prisma/prisma.service';
import { PriceRec } from './pricing';
export interface PricingReview extends PriceRec {
    sku: string;
    name: string;
    category: string;
    inStock: number;
    soldUnits: number;
}
export interface PricingReport {
    source: 'rules';
    generatedForCount: number;
    actionable: number;
    reviews: PricingReview[];
}
export declare class PricingService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    review(): Promise<PricingReport>;
}

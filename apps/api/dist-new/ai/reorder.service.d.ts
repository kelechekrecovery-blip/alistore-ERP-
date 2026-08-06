import { PrismaService } from '../prisma/prisma.service';
import { ReorderRec } from './reorder';
export interface ReorderReview extends ReorderRec {
    productId: string;
    sku: string;
    name: string;
    category: string;
    inStock: number;
    reserved: number;
    soldUnits: number;
}
export interface ReorderReport {
    source: 'rules';
    generatedForCount: number;
    needsReorder: number;
    reviews: ReorderReview[];
}
export declare class ReorderService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    review(): Promise<ReorderReport>;
}

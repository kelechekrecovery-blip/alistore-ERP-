import { PrismaService } from '../prisma/prisma.service';
import { DescribeInput, ProductDescription } from './describe';
export declare class DescribeService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    describe(dto: {
        sku?: string;
    } & Partial<DescribeInput>): Promise<ProductDescription>;
    private resolve;
}

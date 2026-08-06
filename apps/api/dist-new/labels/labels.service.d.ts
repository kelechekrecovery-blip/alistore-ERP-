import { PrismaService } from '../prisma/prisma.service';
export declare class LabelsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    unitLabel(imei: string): Promise<{
        imei: string;
        product: string;
        status: string;
        svg: string;
    }>;
    imeiBarcode(imei: string): string;
    qrLabel(text: string): string;
}

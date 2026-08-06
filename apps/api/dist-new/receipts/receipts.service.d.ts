import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptData } from './receipts.dto';
import { FiscalReceiptResult } from '../fiscal/fiscal-provider';
export interface RenderedReceipt {
    markup: string;
    svg: string;
    escposBase64: string;
    fiscal: FiscalReceiptResult;
}
export declare class ReceiptsService {
    private readonly prisma;
    private readonly config;
    constructor(prisma: PrismaService, config: ConfigService);
    renderOrder(orderId: string): Promise<RenderedReceipt>;
    buildMarkup(data: ReceiptData): string;
    render(data: ReceiptData): RenderedReceipt;
    private money;
    private formatDate;
}

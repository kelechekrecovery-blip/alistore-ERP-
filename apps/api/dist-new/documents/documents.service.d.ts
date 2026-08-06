import { PrismaService } from '../prisma/prisma.service';
export declare class DocumentsService {
    private readonly prisma;
    private readonly fontBytes;
    constructor(prisma: PrismaService);
    orderInvoice(orderId: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    tradeInContract(tradeInId: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    warrantyTalon(imei: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    writeOffAct(movementId: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    writeOffActByApproval(approvalId: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    returnAct(returnId: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    private renderLines;
    private lineWriter;
}

import { DocumentsService } from './documents.service';
export declare class DocumentsController {
    private readonly documents;
    constructor(documents: DocumentsService);
    orderInvoice(id: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    tradeInContract(id: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    warrantyTalon(imei: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    writeOffActByApproval(approvalId: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    writeOffAct(movementId: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
    returnAct(id: string): Promise<{
        pdfBase64: string;
        bytes: number;
    }>;
}

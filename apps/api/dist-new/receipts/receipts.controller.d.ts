import { ReceiptsService } from './receipts.service';
import { ReceiptData } from './receipts.dto';
export declare class ReceiptsController {
    private readonly receipts;
    constructor(receipts: ReceiptsService);
    render(data: ReceiptData): import("./receipts.service").RenderedReceipt;
    renderOrder(orderId: string): Promise<import("./receipts.service").RenderedReceipt>;
}

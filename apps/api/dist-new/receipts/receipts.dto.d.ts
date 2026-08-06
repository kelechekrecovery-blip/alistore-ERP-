export declare class ReceiptStoreDto {
    name: string;
    address?: string;
    phone?: string;
}
export declare class ReceiptItemDto {
    name: string;
    qty: number;
    price: number;
}
export declare class ReceiptPaymentDto {
    method: string;
    amount: number;
}
export declare class ReceiptData {
    store: ReceiptStoreDto;
    orderId: string;
    issuedAt: string;
    items: ReceiptItemDto[];
    total: number;
    payment: string;
    payments?: ReceiptPaymentDto[];
    cashier?: string;
}

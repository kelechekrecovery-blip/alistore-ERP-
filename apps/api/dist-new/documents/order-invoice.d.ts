export interface InvoiceLineItem {
    sku: string;
    name: string;
    qty: number;
    price: number;
    imei?: string | null;
}
export interface InvoicePayment {
    method: string;
    amount: number;
    status: string;
}
export interface OrderInvoiceData {
    id: string;
    status: string;
    channel: string;
    total: number;
    createdAt: Date;
    customer: {
        name: string;
        phone: string;
    };
    items: InvoiceLineItem[];
    payments: InvoicePayment[];
}
export declare function buildOrderInvoiceLines(order: OrderInvoiceData): string[];

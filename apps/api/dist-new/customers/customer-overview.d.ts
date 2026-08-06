import { Customer, DebtPlan, Order, Payment, SupportTicket, WarrantyCase } from '@prisma/client';
export interface CustomerOverview {
    customer: {
        id: string;
        name: string;
        phone: string;
        consent: boolean;
        segments: string[];
        ltv: number;
        createdAt: Date;
    };
    orders: {
        total: number;
        spent: number;
        recent: Array<Pick<Order, 'id' | 'status' | 'total' | 'createdAt'>>;
    };
    debts: {
        count: number;
        openBalance: number;
        items: Array<Pick<DebtPlan, 'id' | 'balance' | 'status' | 'dueDate'>>;
    };
    warranties: {
        open: number;
        items: Array<Pick<WarrantyCase, 'id' | 'imei' | 'status' | 'sla'>>;
    };
    tickets: {
        open: number;
        items: Array<Pick<SupportTicket, 'id' | 'subject' | 'status' | 'priority' | 'sla'>>;
    };
}
interface Inputs {
    customer: Customer;
    orders: Order[];
    payments: Pick<Payment, 'amount' | 'status'>[];
    debts: DebtPlan[];
    warranties: WarrantyCase[];
    tickets: SupportTicket[];
}
export declare function buildCustomerOverview(input: Inputs): CustomerOverview;
export {};

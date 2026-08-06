import { Approval, CashShift, CourierRun, DebtPlan, SupplierRma, SupportTicket, WarrantyCase } from '@prisma/client';
export type RiskSeverity = 'high' | 'medium' | 'low';
export interface RiskSignal {
    kind: 'cash_discrepancy' | 'cod_outstanding' | 'stale_reservations' | 'pending_approval' | 'warranty_sla_breach' | 'rma_sla_breach' | 'debt_overdue' | 'ticket_sla_breach' | 'margin_leak' | 'stock_money_mismatch' | 'imei_reuse' | 'repeat_returns' | 'discount_frequency' | 'write_off_spike';
    severity: RiskSeverity;
    ref: string;
    detail: string;
}
export interface MarginLeak {
    sku: string;
    name: string;
    price: number;
    cost: number;
}
export interface RepeatReturnRisk {
    customerId: string;
    customerName: string;
    count: number;
}
export interface DiscountFrequencyRisk {
    staffId: string;
    discountedSales: number;
    totalSales: number;
    sharePct: number;
}
export interface WriteOffSpike {
    currentQty: number;
    previousQty: number;
    currentCount: number;
}
export declare function computeRepeatReturns(orders: {
    customerId: string;
    customerName?: string | null;
}[], threshold?: number): RepeatReturnRisk[];
export declare function computeDiscountFrequency(sales: {
    staffId: string;
    gross: number;
    total: number;
}[], thresholdPct?: number): DiscountFrequencyRisk[];
export declare function computeWriteOffSpike(movements: {
    qty: number;
    createdAt: Date;
}[], now: Date, minimumCurrentQty?: number): WriteOffSpike | null;
export declare function computeMarginLeaks(paidItems: {
    sku: string;
    price: number;
}[], products: {
    sku: string;
    name: string;
    cost: number;
}[], cap?: number): MarginLeak[];
interface RiskInputs {
    cashDiscrepancies: CashShift[];
    codOutstanding: CourierRun[];
    staleReservations: number;
    pendingApprovals: Approval[];
    warrantyOverdue: WarrantyCase[];
    rmaOverdue: SupplierRma[];
    debtsOverdue: DebtPlan[];
    ticketsOverdue: SupportTicket[];
    marginLeaks: MarginLeak[];
    soldWithoutOrderImeis: string[];
    imeiReuse: string[];
    repeatReturns: RepeatReturnRisk[];
    discountFrequency: DiscountFrequencyRisk[];
    writeOffSpike: WriteOffSpike | null;
}
export declare function buildRiskSignals(input: RiskInputs, now: Date): RiskSignal[];
export {};

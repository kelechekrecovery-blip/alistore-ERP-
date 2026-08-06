import { CustomersService } from '../customers/customers.service';
import { ShiftsService } from '../shifts/shifts.service';
import { UnitsService } from '../units/units.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PosSaleDto } from './pos.dto';
export declare class PosService {
    private readonly prisma;
    private readonly customers;
    private readonly shifts;
    private readonly units;
    private readonly orders;
    private readonly payments;
    private readonly approvals;
    private readonly settings;
    constructor(prisma: PrismaService, customers: CustomersService, shifts: ShiftsService, units: UnitsService, orders: OrdersService, payments: PaymentsService, approvals: ApprovalsService, settings: SettingsService);
    private approvalThresholds;
    findCustomer(rawPhone: string | undefined, staffId: string, point: string, clientSaleId: string): Promise<{
        name: string;
        phone: string;
        loyaltyBalance: number;
        binding: string;
    } | null>;
    sale(dto: PosSaleDto): Promise<{
        pendingApproval: false;
        orderId: string;
        receiptNo: string;
        total: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        shiftId: string;
        imeis: string[];
        idempotent: boolean;
    } | {
        pendingApproval: false;
        orderId: string;
        receiptNo: string;
        total: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        shiftId: string;
        imeis: string[];
        resumed: true;
    } | {
        pendingApproval: true;
        approvalId: string;
        discountPct: number;
        reason: string;
        margin: {
            minMargin: number;
            worstMargin: number;
            breaches: import("./margin-control").MarginBreach[];
        };
        orderId?: undefined;
        receiptNo?: undefined;
        total?: undefined;
        status?: undefined;
        shiftId?: undefined;
        imeis?: undefined;
    } | {
        pendingApproval: false;
        orderId: string;
        receiptNo: string;
        total: number;
        status: string;
        shiftId: string;
        imeis: string[];
        approvalId?: undefined;
        discountPct?: undefined;
        reason?: undefined;
        margin?: undefined;
    }>;
    private deriveTxnId;
    private saleFingerprint;
    private replaySale;
    private saleRequestHash;
    private normalizePayments;
    private evaluateMargin;
    private resolveOrderLines;
    private assertDiscountApproved;
    private approvalReason;
    private defaultApprovalMessage;
    private completedFromExistingPayment;
    private resumeSale;
    private assertReplayCompatible;
}

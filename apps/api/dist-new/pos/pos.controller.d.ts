import { Response } from 'express';
import { PosService } from './pos.service';
import { PosCustomerLookupDto, PosSaleDto } from './pos.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
export declare class PosController {
    private readonly pos;
    private readonly staffAuth;
    constructor(pos: PosService, staffAuth: StaffAuthService);
    customer(user: AuthPrincipal, dto: PosCustomerLookupDto): Promise<{
        name: string;
        phone: string;
        loyaltyBalance: number;
        binding: string;
    } | null>;
    sale(user: AuthPrincipal, dto: PosSaleDto, res: Response): Promise<{
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
}

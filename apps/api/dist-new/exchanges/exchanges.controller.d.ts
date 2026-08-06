import { ExchangesService } from './exchanges.service';
import { ExchangeDto } from './exchanges.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class ExchangesController {
    private readonly exchanges;
    constructor(exchanges: ExchangesService);
    exchange(user: AuthPrincipal, idempotencyKey: string | undefined, dto: ExchangeDto): Promise<{
        exchangeRequestId: string;
        approvalId: string;
        status: string;
        oldImei: string;
        newImei: string;
        creditAmount: number;
        surchargeAmount: number;
        evidenceRequired: boolean;
        expiresAt: string;
        idempotent: boolean;
    }>;
}

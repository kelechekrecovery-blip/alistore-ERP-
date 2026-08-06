import { CreateTradeInDto, TradeInViewDto } from './tradeins.dto';
import { TradeInsService } from './tradeins.service';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class TradeInsController {
    private readonly tradeIns;
    constructor(tradeIns: TradeInsService);
    estimate(model?: string, grade?: string): Promise<{
        model: string;
        grade: string;
        priceSom: number;
    }>;
    create(dto: CreateTradeInDto, user?: AuthPrincipal, capability?: string, idempotencyKey?: string): Promise<TradeInViewDto>;
    mine(user: AuthPrincipal): Promise<TradeInViewDto[]>;
    mineOne(user: AuthPrincipal, id: string): Promise<TradeInViewDto>;
    intake(user: AuthPrincipal, dto: CreateTradeInDto, idempotencyKey?: string): Promise<TradeInViewDto>;
    get(id: string): Promise<TradeInViewDto>;
}

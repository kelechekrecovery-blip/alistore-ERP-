import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTradeInDto, TradeInViewDto } from './tradeins.dto';
import { SettingsService } from '../settings/settings.service';
import { type TradeInGrade } from './valuation';
type TradeInCreateInput = Omit<CreateTradeInDto, 'customerId'> & {
    customerId: string;
};
export declare class TradeInsService {
    private readonly prisma;
    private readonly audit;
    private readonly outbox?;
    private readonly settings?;
    constructor(prisma: PrismaService, audit: AuditService, outbox?: OutboxService | undefined, settings?: SettingsService | undefined);
    private valuation;
    estimate(model: string, grade: TradeInGrade): Promise<number>;
    get(id: string): Promise<TradeInViewDto | null>;
    getOwned(id: string, customerId: string): Promise<TradeInViewDto | null>;
    listByCustomer(customerId: string): Promise<TradeInViewDto[]>;
    create(dto: TradeInCreateInput, actor: string, idempotencyKey: string, payout?: boolean): Promise<TradeInViewDto>;
    private replay;
    private contractId;
    private view;
    private maskPassport;
    private cleanOptional;
    private refs;
}
export {};

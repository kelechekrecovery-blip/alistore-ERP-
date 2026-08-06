import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteServiceRepairDto, ReplaceServiceDeviceDto, ReserveServicePartDto } from './service-center.dto';
export declare class ServiceExecutionService {
    private readonly prisma;
    private readonly audit;
    private readonly outbox?;
    constructor(prisma: PrismaService, audit: AuditService, outbox?: OutboxService | undefined);
    reservePart(id: string, dto: ReserveServicePartDto, actor: string, rawKey?: string): Promise<unknown>;
    releasePart(id: string, partId: string, actor: string, rawKey?: string): Promise<unknown>;
    consumePart(id: string, partId: string, actor: string, rawKey?: string): Promise<unknown>;
    start(id: string, actor: string, rawKey?: string): Promise<unknown>;
    complete(id: string, dto: CompleteServiceRepairDto, actor: string, rawKey?: string): Promise<unknown>;
    replace(id: string, dto: ReplaceServiceDeviceDto, actor: string, rawKey?: string): Promise<unknown>;
    close(id: string, actor: string, rawKey?: string): Promise<unknown>;
    private transition;
    private replayAfterRace;
}

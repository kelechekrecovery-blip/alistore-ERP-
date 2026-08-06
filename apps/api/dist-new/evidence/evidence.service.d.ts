import { Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MediaService, type IngestedImage } from '../media/media.service';
import { MediaCleanupService } from '../media/media-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceEntityType, EvidenceImageDto } from './evidence.dto';
import { AuthzService } from '../authz/authz.service';
export interface EvidenceAttachment {
    entityType: EvidenceEntityType;
    entityId: string;
    asset: IngestedImage;
    label: string | null;
}
export declare class EvidenceService {
    private readonly prisma;
    private readonly audit;
    private readonly media;
    private readonly authz;
    private readonly mediaCleanup;
    constructor(prisma: PrismaService, audit: AuditService, media: MediaService, authz: AuthzService, mediaCleanup: MediaCleanupService);
    attachImage(input: Buffer, dto: EvidenceImageDto, trustedStaffEvidence?: boolean, idempotencyKey?: string): Promise<EvidenceAttachment>;
    findUpload(idempotencyKey: string): Promise<{
        id: string;
        actor: string;
        idempotencyKey: string;
        createdAt: Date;
        asset: Prisma.JsonValue;
        label: string | null;
        fingerprint: string;
        entityType: string;
        entityId: string;
        isPii: boolean;
        retentionUntil: Date | null;
        purgeRequestedAt: Date | null;
        purgeAttempts: number;
        nextPurgeAt: Date | null;
        purgedAt: Date | null;
        purgeReason: string | null;
    }>;
    assertStaffCanRead(role: string): Promise<void>;
    assertStaffCanAttachOrder(staffId: string, role: Role, orderId: string): Promise<void>;
    assertCourierOrderEvidence(idempotencyKey: string | undefined, courierId: string, orderId: string, label: string): Promise<void>;
    issueRead(idempotencyKey: string, actor: string): Promise<{
        entityType: EvidenceEntityType;
        entityId: string;
        asset: {
            url: string;
            key: string;
            width: number;
            height: number;
            bytes: number;
            format: "webp";
        };
        label: string | null;
    }>;
    assertStaffCanAttachLoanerCustody(staffId: string, loanId: string): Promise<void>;
    assertStaffCanAttachExchange(staffId: string, exchangeRequestId: string): Promise<void>;
    assertCustomerOwnsEntity(customerId: string, type: EvidenceEntityType, id: string): Promise<void>;
    assertStaffCanAttachShift(staffId: string, role: Role, shiftId: string): Promise<void>;
    private assertEntityExists;
    private lookup;
}

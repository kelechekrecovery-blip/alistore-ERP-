import type { AuthPrincipal } from '../auth/jwt.strategy';
import { EvidenceImageDto } from './evidence.dto';
import { EvidenceService } from './evidence.service';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
export declare class EvidenceController {
    private readonly evidence;
    private readonly staffAuth;
    constructor(evidence: EvidenceService, staffAuth: StaffAuthService);
    readImage(idempotencyKey: string, user?: AuthPrincipal, capability?: string): Promise<{
        entityType: import("./evidence.dto").EvidenceEntityType;
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
    uploadImage(file: Express.Multer.File | undefined, dto: EvidenceImageDto, user?: AuthPrincipal, capability?: string, idempotencyKey?: string): Promise<import("./evidence.service").EvidenceAttachment>;
}

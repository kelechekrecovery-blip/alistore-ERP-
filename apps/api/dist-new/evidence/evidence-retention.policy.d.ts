import { ConfigService } from '@nestjs/config';
import { EvidenceEntityType } from './evidence.dto';
export interface EvidenceRetentionDecision {
    isPii: boolean;
    retentionUntil: Date | null;
    policyVersion: string;
}
export declare function decideEvidenceRetention(config: ConfigService | undefined, entityType: EvidenceEntityType | string, label: string | null | undefined, createdAt?: Date): EvidenceRetentionDecision;

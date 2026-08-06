export declare const EVIDENCE_ENTITY_TYPES: readonly ["tradein", "return", "warranty", "inventory", "order", "support", "shift", "loaner", "quarantine", "exchange"];
export type EvidenceEntityType = (typeof EVIDENCE_ENTITY_TYPES)[number];
export declare class EvidenceImageDto {
    entityType: EvidenceEntityType;
    entityId: string;
    label?: string;
    actor?: string;
}

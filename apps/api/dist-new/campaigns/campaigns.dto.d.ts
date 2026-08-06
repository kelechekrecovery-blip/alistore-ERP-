export declare const CAMPAIGN_CHANNELS: readonly ["sms", "push", "telegram", "whatsapp"];
export declare const CAMPAIGN_CREATIVE_TYPES: readonly ["text", "image", "video"];
export declare class SegmentRulesDto {
    level?: string;
    city?: string;
    tags?: string[];
    minSpent?: number;
    maxSpent?: number;
    minLtv?: number;
    maxLtv?: number;
    limit?: number;
}
export declare class CreateCampaignDto extends SegmentRulesDto {
    name?: string;
    channel: (typeof CAMPAIGN_CHANNELS)[number];
    budget: number;
    creativeHeadline: string;
    creativeType?: (typeof CAMPAIGN_CREATIVE_TYPES)[number];
    creativeBody?: string;
    creativeAssetUrl?: string;
    creativeCtaLabel?: string;
    destinationUrl?: string;
    source?: string;
    medium?: string;
    promotionCode?: string;
    template?: string;
}
export declare class UpdateCampaignDto extends SegmentRulesDto {
    name?: string;
    channel?: (typeof CAMPAIGN_CHANNELS)[number];
    budget?: number;
    creativeHeadline?: string;
    creativeType?: (typeof CAMPAIGN_CREATIVE_TYPES)[number];
    creativeBody?: string;
    creativeAssetUrl?: string;
    creativeCtaLabel?: string;
    destinationUrl?: string;
    source?: string;
    medium?: string;
    promotionCode?: string;
    template?: string;
}
export declare class RecordCampaignSpendDto {
    idempotencyKey: string;
    provider: string;
    externalRef: string;
    amount: number;
    occurredAt: string;
}
export declare class CampaignConversionDto {
    orderId: string;
}

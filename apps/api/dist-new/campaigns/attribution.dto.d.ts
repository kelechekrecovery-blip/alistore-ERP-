export declare class AttributionTouchDto {
    source: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
    landing?: string;
}
export declare class OrderAttributionDto {
    journeyId?: string;
    first: AttributionTouchDto;
    last: AttributionTouchDto;
}
export declare class CampaignFunnelDto {
    trackingCode: string;
    journeyId: string;
    stage: 'click' | 'visit';
}

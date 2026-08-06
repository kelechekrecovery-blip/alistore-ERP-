export interface SegmentRules {
    level?: string;
    city?: string;
    tags?: string[];
    minSpent?: number;
    maxSpent?: number;
    minLtv?: number;
    maxLtv?: number;
    limit?: number;
}
export interface AudienceCustomer {
    id: string;
    name: string;
    phone: string;
    consent: boolean;
    segments: string[];
    ltv: number;
    spent: number;
}
export interface SegmentMatch {
    customer: AudienceCustomer;
    eligible: boolean;
}
export declare function normalizeSegmentRules(input: SegmentRules): Required<Pick<SegmentRules, 'tags' | 'limit'>> & SegmentRules;
export declare function segmentLabel(rules: SegmentRules): string;
export declare function parseSegmentLabel(label: string): SegmentRules;
export declare function describeSegment(rules: SegmentRules): string;
export declare function buildSegmentAudience(customers: AudienceCustomer[], input: SegmentRules): SegmentMatch[];

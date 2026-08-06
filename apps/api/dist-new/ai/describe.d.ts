export interface DescribeInput {
    name: string;
    category?: string;
    attrs?: Record<string, unknown>;
}
export type DescriptionSource = 'template' | string;
export interface ProductDescription {
    description: string;
    source: DescriptionSource;
    highlights: string[];
}
export declare function buildDescriptionMessages(input: DescribeInput): {
    role: 'system' | 'user';
    content: string;
}[];
export declare function buildDescription(input: DescribeInput): ProductDescription;

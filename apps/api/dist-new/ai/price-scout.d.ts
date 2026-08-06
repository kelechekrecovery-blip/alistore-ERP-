import { ChatMessage } from './openrouter-provider';
export interface MarketListing {
    title?: string;
    source?: string;
    condition?: string;
    price: number;
}
export interface PriceScoutInput {
    sku?: string;
    name: string;
    category?: string;
    basePrice: number;
    observedListings?: MarketListing[];
}
export interface PriceScoutResult {
    source: string;
    marketLow: number;
    marketMedian: number;
    marketHigh: number;
    recommendedPrice: number;
    confidence: number;
    signals: string[];
    notes: string[];
}
export declare function scoutPriceByRules(input: PriceScoutInput): PriceScoutResult;
export declare function buildPriceScoutMessages(input: PriceScoutInput): ChatMessage[];
export declare function parsePriceScoutResponse(content: string): Omit<PriceScoutResult, 'source'>;
export declare const PRICE_SCOUT_SCHEMA: Record<string, unknown>;

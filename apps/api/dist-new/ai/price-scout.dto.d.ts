export declare class MarketListingDto {
    title?: string;
    source?: string;
    condition?: string;
    price: number;
}
export declare class PriceScoutDto {
    sku?: string;
    name?: string;
    category?: string;
    basePrice?: number;
    observedListings?: MarketListingDto[];
}

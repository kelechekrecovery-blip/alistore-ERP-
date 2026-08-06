export declare const GIFT_CARD_PAYMENT_METHODS: readonly ["cash", "card", "qr_mbank", "qr_odengi"];
export declare class IssueGiftCardDto {
    method?: (typeof GIFT_CARD_PAYMENT_METHODS)[number];
    amount: number;
    code?: string;
    customerId?: string;
    note?: string;
    expiresAt?: string;
}

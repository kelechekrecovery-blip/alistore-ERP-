export interface TradeInContractData {
    id: string;
    contractId: string | null;
    issuedAt: Date;
    customer: {
        name: string;
        phone: string;
    };
    sellerPassport: string;
    model: string;
    imei?: string | null;
    grade: string;
    price: number;
}
export declare function buildTradeInContractLines(trade: TradeInContractData): string[];

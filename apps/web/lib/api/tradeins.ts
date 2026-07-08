import { postAuthJson, postJson } from './http';

export type TradeInGrade = 'A' | 'B' | 'C';

export interface TradeIn {
  id: string;
  customerId: string;
  model: string;
  imei: string | null;
  grade: TradeInGrade;
  price: number;
  contractId: string | null;
  sellerPassportMasked: string;
}

export function createTradeIn(input: {
  customerId: string;
  model: string;
  imei?: string;
  grade: TradeInGrade;
  price: number;
  sellerPassport: string;
  actor?: string;
}, accessToken?: string): Promise<TradeIn> {
  if (accessToken) {
    return postAuthJson('/tradeins/intake', input, accessToken);
  }
  return postJson('/tradeins', input);
}

import { postJson } from './http';

export type TradeInGrade = 'A' | 'B' | 'C';

export interface TradeIn {
  id: string;
  customerId: string;
  model: string;
  grade: TradeInGrade;
  price: number;
  contractId: string | null;
  sellerPassportMasked: string;
}

export function createTradeIn(input: {
  customerId: string;
  model: string;
  grade: TradeInGrade;
  price: number;
  sellerPassport: string;
  actor?: string;
}): Promise<TradeIn> {
  return postJson('/tradeins', input);
}

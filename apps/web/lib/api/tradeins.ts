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
}, credential: { accessToken?: string; guestCapability?: string; staffIntake?: boolean }): Promise<TradeIn> {
  if (credential.staffIntake && credential.accessToken) {
    return postAuthJson('/tradeins/intake', input, credential.accessToken);
  }
  return postJson('/tradeins', input, {
    ...(credential.accessToken ? { authorization: `Bearer ${credential.accessToken}` } : {}),
    ...(credential.guestCapability ? { 'x-guest-capability': credential.guestCapability } : {}),
  });
}

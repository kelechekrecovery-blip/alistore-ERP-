import { getJson, postAuthJson, postJson } from './http';

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
  customerId?: string;
  model: string;
  imei?: string;
  grade: TradeInGrade;
  price: number;
  sellerPassport: string;
}, credential: { accessToken?: string; guestCapability?: string; staffIntake?: boolean; idempotencyKey?: string }): Promise<TradeIn> {
  const idempotencyKey = credential.idempotencyKey ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const headers = { 'idempotency-key': idempotencyKey };
  if (credential.staffIntake && credential.accessToken) {
    return postAuthJson('/tradeins/intake', input, credential.accessToken, headers);
  }
  return postJson('/tradeins', input, {
    ...headers,
    ...(credential.accessToken ? { authorization: `Bearer ${credential.accessToken}` } : {}),
    ...(credential.guestCapability ? { 'x-guest-capability': credential.guestCapability } : {}),
  });
}

export function listMyTradeIns(accessToken: string): Promise<TradeIn[]> {
  return getJson<TradeIn[]>('/tradeins/mine', accessToken);
}

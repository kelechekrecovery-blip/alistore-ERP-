import { getJson, getPublicJson, postAuthJson, postJson } from './http';

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
  /** Только для приёмки сотрудником: на публичном пути цену считает сервер. */
  price?: number;
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

export interface TradeInEstimate {
  model: string;
  grade: TradeInGrade;
  priceSom: number;
}

/**
 * Предварительная оценка выкупа — считает сервер.
 *
 * Страница считала её сама по таблице моделей, зашитой во фронт, и присылала
 * получившееся число в `POST /tradeins`. Показанное и записанное в договор
 * могли разойтись, а на публичном эндпоинте сумму фактически назначал тот,
 * кто её получает. Теперь обе цифры приходят из одной функции на сервере.
 */
export function fetchTradeInEstimate(model: string, grade: TradeInGrade): Promise<TradeInEstimate> {
  const params = new URLSearchParams({ model, grade });
  return getPublicJson<TradeInEstimate>(`/tradeins/estimate?${params.toString()}`);
}

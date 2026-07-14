import { API_BASE, getJson, postAuthJson } from './http';

export type DeliverySlot = { id: string; zoneId: string; startsAt: string; endsAt: string; capacity: number; reserved: number; remaining: number; available: boolean };
export type DeliveryZone = { id: string; code: string; name: string; fee: number; etaMinMinutes: number; etaMaxMinutes: number; active: boolean; slots: DeliverySlot[] };
export type DispatchOrder = { id: string; total: number; deliveryAddress: string | null; deliverySlot: string | null; customer: { name: string; phone: string }; payments: { amount: number; status: string }[]; logisticsSlot: DeliverySlot | null };
export type CourierRun = { id: string; courierId: string; codTotal: number; collectedTotal: number; handedOver: boolean; orders: Array<{ id: string; deliveryAddress: string | null; status: string; customer: { name: string }; logisticsSlot: DeliverySlot | null }> };
export type LogisticsOverview = { zones: DeliveryZone[]; couriers: { id: string; username: string; role: string }[]; pendingOrders: DispatchOrder[]; runs: CourierRun[]; pickupPoints: { name: string; type: string; waiting: number; status: string }[] };

export async function fetchDeliveryAvailability(date: string): Promise<DeliveryZone[]> {
  const response = await fetch(`${API_BASE}/logistics/availability?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`delivery availability responded ${response.status}`);
  return (await response.json()) as DeliveryZone[];
}

export function fetchLogisticsOverview(date: string, token: string) { return getJson<LogisticsOverview>(`/logistics/overview?date=${encodeURIComponent(date)}`, token); }
export function createDeliveryZone(input: { code: string; name: string; fee: number; etaMinMinutes: number; etaMaxMinutes: number }, token: string) { return postAuthJson<DeliveryZone>('/logistics/zones', input, token, { 'idempotency-key': crypto.randomUUID() }); }
export function createDeliverySlot(input: { zoneId: string; startsAt: string; endsAt: string; capacity: number }, token: string) { return postAuthJson<DeliverySlot>('/logistics/slots', input, token, { 'idempotency-key': crypto.randomUUID() }); }
export function createCourierRun(input: { courierId: string; orderIds: string[]; codTotal: number }, token: string) { return postAuthJson<CourierRun>('/courier/runs', input, token); }

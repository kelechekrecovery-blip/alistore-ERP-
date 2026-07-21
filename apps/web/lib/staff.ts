import { API_BASE } from './api';

export interface Shift {
  id: string;
  staffId: string;
  point: string;
  openCash: number;
  closeCash?: number | null;
  diff?: number | null;
  openedAt: string;
  closedAt?: string | null;
  expected?: number;
  payments?: { amount: number; method: string }[];
}

export interface ClosedShift extends Shift {
  closeCash: number;
  diff: number;
  expected: number;
  closedAt: string;
}

/**
 * Пустой ответ (200 без тела) означает «смены нет». Всё остальное — сбой, и он
 * обязан быть виден.
 *
 * Здесь стояло `if (!res.ok) return null`, то есть 401, 403 и 500 приходили в
 * интерфейс как «смена не открыта». Кассир, проработавший день, видел экран
 * «Откройте смену»: форма слепого пересчёта и кнопка «Закрыть» исчезали
 * целиком — они внутри ветки `shift ? …`. Нажатие «Открыть смену» давало 409 и
 * односложный тост.
 *
 * Закрытие смены — единственная точка, где наличные в ящике встречаются с
 * системой. Молчаливый отказ в ней означает день без сверки кассы.
 */
export async function currentShift(accessToken: string): Promise<Shift | null> {
  const res = await fetch(`${API_BASE}/shifts/current`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'Сессия истекла — войдите заново, чтобы закрыть смену'
        : `Не удалось получить смену (${res.status})`,
    );
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as Shift) : null;
}

export async function fetchShift(id: string, accessToken: string): Promise<Shift | null> {
  const res = await fetch(`${API_BASE}/shifts/${id}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as Shift;
}

export async function openShift(
  input: { staffId: string; point: string; openCash: number },
  accessToken: string,
): Promise<Shift> {
  const res = await fetch(`${API_BASE}/shifts/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`open shift ${res.status}`);
  return (await res.json()) as Shift;
}

export async function closeShift(
  id: string,
  closeCash: number,
  accessToken: string,
  idempotencyKey: string,
  reason?: string,
): Promise<ClosedShift> {
  const res = await fetch(`${API_BASE}/shifts/${id}/close`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ closeCash, reason }),
  });
  if (!res.ok) throw new Error(`close shift ${res.status}`);
  const value = await res.json() as Partial<ClosedShift>;
  if (
    typeof value.id !== 'string'
    || typeof value.staffId !== 'string'
    || typeof value.point !== 'string'
    || !Number.isInteger(value.openCash)
    || typeof value.openedAt !== 'string'
    || !Number.isInteger(value.closeCash)
    || !Number.isInteger(value.diff)
    || !Number.isInteger(value.expected)
    || typeof value.closedAt !== 'string'
  ) {
    throw new Error('close shift returned an invalid reconciliation');
  }
  return value as ClosedShift;
}

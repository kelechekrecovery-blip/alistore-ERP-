/**
 * Часовой пояс бизнеса. Магазин один и стоит в Бишкеке.
 *
 * До этого отчёты и payroll резали сутки по UTC, а логистика уже считала их по
 * `Asia/Bishkek` — рассинхрон внутри одной системы (TZ-001). UTC-сутки для UTC+6
 * это фактически 06:00 → 06:00 по местному, поэтому всё, что происходило между
 * полуночью и шестью утра — поздняя инкассация, ночная смена, ночной заказ —
 * попадало в отчёт за ПРЕДЫДУЩИЙ день.
 *
 * Смещение задано константой, а не вычисляется через `Intl`: в Кыргызстане нет
 * перехода на летнее время (фиксированный UTC+6 с 2005 года), так что константа
 * точна и не зависит от базы часовых поясов рантайма. Если страна когда-нибудь
 * введёт DST, менять придётся здесь — одно место на всю систему.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Bishkek';
export const BUSINESS_UTC_OFFSET = '+06:00';

const OFFSET_MS = 6 * 60 * 60 * 1000;

/** Строгий `YYYY-MM-DD` → миллисекунды местной полуночи, либо `null`. */
export function parseBusinessDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d) - OFFSET_MS;
  // Отсекаем переносы вроде 2026-13-01 / 2026-02-30: Date.UTC их нормализует,
  // а не падает, поэтому сверяем результат обратно.
  const back = new Date(ms + OFFSET_MS);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ms;
}

/** Календарный день по местным часам — метка для бакетов и отчётов. */
export function businessDayIso(at: Date): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Начало местных суток, в которые попадает момент `at`. */
export function businessDayStartMs(at: Date): number {
  return parseBusinessDay(businessDayIso(at))!;
}

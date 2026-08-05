import { getJson, patchAuthJson } from './http';

export interface BusinessSetting {
  key: string;
  label: string;
  group: 'discounts' | 'payroll' | 'warranty' | 'tradein' | 'loyalty' | 'credit';
  kind: 'int' | 'percent' | 'bps' | 'url';
  /**
   * The literal this parameter replaces — the value in force before any edit.
   * Строка у ссылочных параметров (`kind: 'url'`), пустая — «не задано».
   */
  fallback: number | string;
  min: number;
  max: number;
  unit: string;
  hint: string;
  source: string;
  value: number | string;
  /** False while the parameter still runs on its original hardcoded default. */
  overridden: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

export function fetchSettings(token: string): Promise<BusinessSetting[]> {
  return getJson('/settings', token);
}

export function saveSetting(key: string, value: string, token: string): Promise<BusinessSetting> {
  return patchAuthJson(`/settings/${encodeURIComponent(key)}`, { value }, token);
}

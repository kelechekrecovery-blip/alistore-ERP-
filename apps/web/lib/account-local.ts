'use client';

export interface SavedAddress {
  id: string;
  title: string;
  text: string;
  comment?: string;
  main: boolean;
}

export interface NotificationPrefs {
  push: boolean;
  whatsapp: boolean;
  service: boolean;
  promos: boolean;
}

const ADDRESSES_KEY = 'alistore.addresses.v1';
const NOTIFICATION_PREFS_KEY = 'alistore.notification-prefs.v1';

export const DEFAULT_ADDRESSES: SavedAddress[] = [
  { id: 'home', title: 'Дом', text: 'г. Бишкек, ул. Чуй 154, кв. 12', comment: 'Домофон 12', main: true },
  { id: 'work', title: 'Работа', text: 'г. Бишкек, ул. Киевская 44, офис 3', main: false },
];

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: true,
  whatsapp: true,
  service: true,
  promos: false,
};

export function loadAddresses(): SavedAddress[] {
  try {
    const raw = localStorage.getItem(ADDRESSES_KEY);
    if (!raw) return DEFAULT_ADDRESSES;
    const parsed = JSON.parse(raw) as SavedAddress[];
    return parsed.length ? parsed : DEFAULT_ADDRESSES;
  } catch {
    return DEFAULT_ADDRESSES;
  }
}

export function saveAddresses(addresses: SavedAddress[]) {
  localStorage.setItem(ADDRESSES_KEY, JSON.stringify(addresses));
}

export function mainAddress(addresses: SavedAddress[]): SavedAddress | null {
  return addresses.find((a) => a.main) ?? addresses[0] ?? null;
}

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    return raw ? { ...DEFAULT_NOTIFICATION_PREFS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) } : DEFAULT_NOTIFICATION_PREFS;
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs) {
  localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
}

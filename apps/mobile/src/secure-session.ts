import * as SecureStore from 'expo-secure-store';

import type { CustomerSession, StaffLoginResult } from '@mobile/types';

const STAFF_SESSION_KEY = 'alistore.staffSession.v1';
const CUSTOMER_SESSION_KEY = 'alistore.customerSession.v1';

export async function getStoredStaffSession(): Promise<StaffLoginResult | null> {
  const raw = await SecureStore.getItemAsync(STAFF_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StaffLoginResult;
  } catch {
    await SecureStore.deleteItemAsync(STAFF_SESSION_KEY);
    return null;
  }
}

export async function saveStaffSession(session: StaffLoginResult): Promise<void> {
  await SecureStore.setItemAsync(STAFF_SESSION_KEY, JSON.stringify(session));
}

export async function clearStaffSession(): Promise<void> {
  await SecureStore.deleteItemAsync(STAFF_SESSION_KEY);
}

export async function getStoredCustomerSession(): Promise<CustomerSession | null> {
  const raw = await SecureStore.getItemAsync(CUSTOMER_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CustomerSession;
  } catch {
    await SecureStore.deleteItemAsync(CUSTOMER_SESSION_KEY);
    return null;
  }
}

export async function saveCustomerSession(session: CustomerSession): Promise<void> {
  await SecureStore.setItemAsync(CUSTOMER_SESSION_KEY, JSON.stringify(session));
}

export async function clearCustomerSession(): Promise<void> {
  await SecureStore.deleteItemAsync(CUSTOMER_SESSION_KEY);
}

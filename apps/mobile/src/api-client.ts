import type {
  AuthPrincipal,
  CatalogResponse,
  CreatedOrder,
  CustomerAuthTokens,
  CustomerOrder,
  CustomerProfile,
  MyDevice,
  OnlinePaymentMethod,
  OtpRequestResult,
  PaymentConfirmResult,
  PaymentIntent,
  PaymentMethod,
  PosLine,
  PosSaleOutcome,
  PosPayment,
  QueueOrder,
  RegisteredPushToken,
  ReturnRequest,
  StaffLoginResult,
  SupportPriority,
  SupportTicket,
  WarrantyCase,
} from '@mobile/types';

const configuredBase = process.env.EXPO_PUBLIC_API_BASE?.trim();

export const API_BASE = configuredBase && configuredBase.length > 0
  ? configuredBase.replace(/\/$/, '')
  : 'http://127.0.0.1:4000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends RequestInit {
  token?: string;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...init } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const text = await response.text();
  const payload = text.length > 0 ? safeJson(text) : null;

  if (!response.ok) {
    const detail = payload as { message?: string; code?: string } | null;
    throw new ApiError(detail?.message ?? `Request failed ${response.status}`, response.status, detail?.code);
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    qs.set(key, String(value));
  }
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export const api = {
  catalog(input: { q?: string; category?: string; limit?: number; offset?: number } = {}) {
    return requestJson<CatalogResponse>(
      `/catalog/products${query({ limit: input.limit ?? 80, offset: input.offset ?? 0, q: input.q, category: input.category })}`,
    );
  },

  createCustomer(input: { phone: string; name?: string }) {
    return requestJson<{ id: string }>('/customers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  requestOtp(phone: string) {
    return requestJson<OtpRequestResult>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  verifyOtp(input: { phone: string; code: string }) {
    return requestJson<CustomerAuthTokens>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  authMe(token: string) {
    return requestJson<AuthPrincipal>('/auth/me', { token });
  },

  getCustomer(id: string, token: string) {
    return requestJson<CustomerProfile>(`/customers/${id}`, { token });
  },

  setCustomerConsent(input: { customerId: string; consent: boolean }, token: string) {
    return requestJson<CustomerProfile>(`/customers/${input.customerId}/consent`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ consent: input.consent, actor: 'mobile_customer' }),
    });
  },

  fetchMyOrders(token: string) {
    return requestJson<CustomerOrder[]>('/orders/mine', { token });
  },

  fetchMyDevices(token: string) {
    return requestJson<MyDevice[]>('/customers/me/devices', { token });
  },

  fetchSupportTickets(input: { customerId: string }, token: string) {
    return requestJson<SupportTicket[]>(`/support/tickets${query({ customerId: input.customerId })}`, { token });
  },

  openSupportTicket(input: {
    customerId: string;
    subject: string;
    body?: string;
    priority?: SupportPriority;
  }, token: string) {
    return requestJson<SupportTicket>('/support/tickets', {
      method: 'POST',
      token,
      body: JSON.stringify({ ...input, channel: 'app' }),
    });
  },

  openWarranty(input: { imei: string; customerId: string; problem: string }, token: string) {
    return requestJson<WarrantyCase>('/warranty', {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    });
  },

  openReturnRequest(input: { orderId: string; reason: string }, token: string) {
    return requestJson<ReturnRequest>('/returns', {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    });
  },

  refreshCustomerSession(refreshToken: string) {
    return requestJson<CustomerAuthTokens>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },

  logoutCustomer(refreshToken: string) {
    return requestJson<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },

  createOrder(input: {
    customerId: string;
    channel: 'mobile' | 'staff_mobile';
    fulfillmentType?: 'pickup' | 'courier' | 'express' | 'store';
    pickupPoint?: string;
    deliveryAddress?: string;
    deliverySlot?: string;
    total: number;
    items: Array<{ sku: string; qty: number; price: number }>;
  }) {
    return requestJson<CreatedOrder>('/orders', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  createPaymentIntent(input: {
    orderId: string;
    method: OnlinePaymentMethod;
    amount: number;
    actor?: string;
    returnUrl?: string;
  }) {
    return requestJson<PaymentIntent>('/payments/intents', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  confirmSandboxPayment(input: {
    orderId: string;
    method: OnlinePaymentMethod;
    amount: number;
    txnId: string;
  }) {
    return requestJson<PaymentConfirmResult>('/payments/webhooks/sandbox', {
      method: 'POST',
      body: JSON.stringify({ ...input, status: 'succeeded', actor: 'mobile_sandbox' }),
    });
  },

  staffLogin(username: string, password: string) {
    return requestJson<StaffLoginResult>('/staff-auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  registerPushToken(input: {
    token: string;
    platform: 'ios' | 'android' | 'web' | 'unknown';
    deviceId: string;
    scope?: 'anonymous' | 'customer' | 'staff';
  }, accessToken?: string) {
    return requestJson<RegisteredPushToken>('/notifications/push-tokens', {
      method: 'POST',
      token: accessToken,
      body: JSON.stringify(input),
    });
  },

  fetchOrders(status: string, token: string) {
    return requestJson<QueueOrder[]>(`/orders${query({ status })}`, { token });
  },

  posSale(input: {
    staffId: string;
    point: string;
    method?: PaymentMethod;
    payments?: PosPayment[];
    discountPct?: number;
    approvalId?: string;
    reason?: string;
    clientSaleId?: string;
    lines: PosLine[];
  }, token: string) {
    return requestJson<PosSaleOutcome>('/pos/sale', {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    });
  },
};

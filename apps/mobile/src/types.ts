export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  price: number;
  category: string;
  attrs: Record<string, unknown> | null;
  availableUnits: number;
  updatedAt?: string;
}

export interface CatalogResponse {
  source: string;
  warning?: string;
  total: number;
  limit: number;
  offset: number;
  items: CatalogProduct[];
}

export interface CartLine {
  product: CatalogProduct;
  qty: number;
}

export interface CreatedOrder {
  id: string;
  status: string;
  total: number;
}

export interface CustomerOrder {
  id: string;
  channel: string;
  status: string;
  total: number;
  createdAt: string;
  items: Array<{ sku: string; qty: number; price: number; imei?: string | null }>;
}

export interface MyDevice {
  imei: string;
  product: string;
  status: string;
  warrantyUntil: string | null;
  daysLeft: number | null;
  warranty: { id: string; status: string; sla: string } | null;
}

export interface WarrantyCase {
  id: string;
  imei: string;
  customerId: string;
  problem: string;
  status: string;
  sla: string;
  assignee?: string | null;
}

export type SupportPriority = 'normal' | 'high' | 'urgent';

export interface SupportTicket {
  id: string;
  customerId: string;
  channel: string;
  subject: string;
  body: string | null;
  priority: SupportPriority;
  status: string;
  sla: string;
  assignee: string | null;
  createdAt: string;
}

export type OnlinePaymentMethod = 'card' | 'qr_mbank' | 'qr_odengi' | 'installment';
export type PaymentMethod = OnlinePaymentMethod | 'cash' | 'bakai_pos' | 'obank';

export interface PaymentIntent {
  intentId: string;
  provider: 'card' | 'mbank' | 'odengi' | 'installment';
  orderId: string;
  orderStatus: string;
  method: OnlinePaymentMethod;
  amount: number;
  txnId: string;
  status: 'requires_action';
  expiresAt: string;
  paymentUrl: string;
  qrPayload: string | null;
}

export interface PaymentConfirmResult {
  order: { id: string; status: string; total: number } | null;
  payment: { id: string; amount: number; method: string; status: string; txnId?: string | null };
  idempotent: boolean;
}

export interface StaffLoginResult {
  accessToken: string;
  staffId: string;
  username: string;
  role: string;
  totpEnabled: boolean;
}

export interface CustomerAuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

export interface AuthPrincipal {
  customerId: string;
  phone?: string;
  typ: string;
  role?: string;
}

export interface CustomerSession extends CustomerAuthTokens {
  customerId: string;
  phone: string;
}

export interface CustomerProfile {
  id: string;
  phone: string;
  name: string;
  consent: boolean;
  segments?: string[];
  ltv?: number;
  createdAt?: string;
}

export interface OtpRequestResult {
  challengeId: string;
  devCode?: string;
}

export interface RegisteredPushToken {
  id: string;
  token: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  deviceId: string;
  scope: 'anonymous' | 'customer' | 'staff';
  customerId: string | null;
  staffId: string | null;
  enabled: boolean;
  lastSeenAt: string;
}

export interface PosLine {
  productId: string;
  sku: string;
  price: number;
  qty: number;
}

export interface PosPayment {
  method: PaymentMethod;
  amount: number;
}

export interface PosSaleResult {
  pendingApproval?: false;
  orderId: string;
  receiptNo: string;
  total: number;
  status: string;
  shiftId: string;
  imeis: string[];
  idempotent?: boolean;
}

export interface PosPendingApproval {
  pendingApproval: true;
  approvalId: string;
  discountPct: number;
  reason?: 'discount' | 'margin' | 'discount_and_margin';
  margin?: {
    minMargin: number;
    worstMargin: number;
    breaches: Array<{ sku: string; margin: number; minMargin: number }>;
  };
}

export type PosSaleOutcome = PosSaleResult | PosPendingApproval;

export interface QueueOrder {
  id: string;
  channel: string;
  status: string;
  total: number;
  createdAt: string;
  customer?: { phone: string; name: string };
  items: { sku: string; qty: number; price: number; imei?: string | null }[];
}

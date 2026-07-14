/**
 * Event Ledger types — the full catalogue from reference/api-and-events.md.
 * These strings are the `AuditEvent.type` written on every meaningful mutation.
 * The ledger is append-only: reports, Risk and Command Center read from here so
 * numbers never diverge.
 */
export const EventType = {
  // orders
  OrderCreated: 'order.created',
  OrderConfirmed: 'order.confirmed',
  OrderReserved: 'order.reserved',
  OrderPaid: 'order.paid',
  OrderPicking: 'order.picking',
  OrderPacked: 'order.packed',
  OrderCompleted: 'order.completed',
  OrderCancelled: 'order.cancelled',
  OrderExchanged: 'order.exchanged',
  // payments
  PaymentReceived: 'payment.received',
  PaymentRefunded: 'payment.refunded',
  PaymentReconciled: 'payment.reconciled',
  // stock
  StockReceived: 'stock.received',
  StockReserved: 'stock.reserved',
  StockSold: 'stock.sold',
  StockReleased: 'stock.released', // compensating: expired reservation returns a held unit to stock
  StockMoved: 'stock.moved',
  StockAdjusted: 'stock.adjusted',
  StockWrittenOff: 'stock.written_off',
  InventoryCounted: 'inventory.counted',
  // reservations
  ReservationExpired: 'reservation.expired', // invariant #7: expired hold released by the sweep
  // units (IMEI/SN)
  UnitReceived: 'unit.received',
  UnitSold: 'unit.sold',
  UnitReturned: 'unit.returned',
  UnitWrittenOff: 'unit.written_off',
  // cash / shifts
  ShiftOpened: 'shift.opened',
  ShiftClosed: 'shift.closed',
  CashHandover: 'cash.handover',
  CashShortage: 'cash.shortage',
  ExpenseSubmitted: 'expense.submitted',
  ExpenseApproved: 'expense.approved',
  ExpenseRejected: 'expense.rejected',
  ExpensePaid: 'expense.paid',
  FinanceBudgetSet: 'finance.budget_set',
  // delivery
  DeliveryAssigned: 'delivery.assigned',
  DeliveryOut: 'delivery.out',
  DeliveryDelivered: 'delivery.delivered',
  DeliveryFailed: 'delivery.failed',
  // returns / refunds
  ReturnRequested: 'return.requested',
  ReturnCompleted: 'return.completed',
  RefundRequested: 'refund.requested',
  // warranty
  WarrantyCreated: 'warranty.created',
  WarrantyClosed: 'warranty.closed',
  // supplier RMA
  RmaOpened: 'rma.opened',
  RmaShipped: 'rma.shipped',
  RmaResolved: 'rma.resolved',
  RmaRejected: 'rma.rejected',
  RmaClosed: 'rma.closed',
  // procurement
  PurchaseOrderCreated: 'purchase_order.created',
  PurchaseOrderSent: 'purchase_order.sent',
  PurchaseOrderReceiving: 'purchase_order.receiving',
  PurchaseOrderReceived: 'purchase_order.received',
  PurchaseOrderCancelled: 'purchase_order.cancelled',
  // approvals
  ApprovalRequested: 'approval.requested',
  ApprovalApproved: 'approval.approved',
  ApprovalRejected: 'approval.rejected',
  // misc
  ProductCreated: 'product.created',
  ProductUpdated: 'product.updated',
  PriceChanged: 'price.changed',
  ProductArchived: 'product.archived',
  DebtCreated: 'debt.created',
  DebtPaid: 'debt.payment',
  DebtSettled: 'debt.settled',
  DebtReminderQueued: 'debt.reminder_queued',
  GiftCardIssued: 'giftcard.issued',
  GiftCardRedeemed: 'giftcard.redeemed',
  LoyaltyRedeemed: 'loyalty.redeemed',
  LoyaltyEarned: 'loyalty.earned',
  LoyaltyRefundRestored: 'loyalty.refund_restored',
  LoyaltyRefundClawedBack: 'loyalty.refund_clawed_back',
  TradeInAssessed: 'tradein.assessed',
  TradeInContracted: 'tradein.contracted',
  EvidenceAttached: 'evidence.attached',
  ConsentChanged: 'customer.consent_changed',
  CustomerProfileUpdated: 'customer.profile_updated',
  CustomerPreferencesChanged: 'customer.preferences_changed',
  CustomerAddressCreated: 'customer.address_created',
  CustomerAddressUpdated: 'customer.address_updated',
  CustomerAddressDeleted: 'customer.address_deleted',
  CampaignSent: 'campaign.sent',
  CampaignConverted: 'campaign.converted',
  TicketCreated: 'ticket.created',
  TicketEscalated: 'ticket.escalated',
  B2BQuoteRequested: 'b2b.quote_requested',
  B2BQuoteUpdated: 'b2b.quote_updated',
  ProtectionRequested: 'protection.requested',
  ProtectionUpdated: 'protection.updated',
  StaffTaskCreated: 'staff_task.created',
  StaffTaskUpdated: 'staff_task.updated',
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

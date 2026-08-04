import { Customer, DebtPlan, Order, Payment, SupportTicket, WarrantyCase } from '@prisma/client';

const WARRANTY_CLOSED = new Set(['repaired', 'replaced', 'closed', 'rejected']);
const TICKET_OPEN = new Set(['new', 'in_progress', 'waiting']);

export interface CustomerOverview {
  customer: {
    id: string;
    name: string;
    phone: string;
    consent: boolean;
    segments: string[];
    ltv: number;
    createdAt: Date;
  };
  orders: { total: number; spent: number; recent: Array<Pick<Order, 'id' | 'status' | 'total' | 'createdAt'>> };
  debts: { count: number; openBalance: number; items: Array<Pick<DebtPlan, 'id' | 'balance' | 'status' | 'dueDate'>> };
  warranties: { open: number; items: Array<Pick<WarrantyCase, 'id' | 'imei' | 'status' | 'sla'>> };
  tickets: { open: number; items: Array<Pick<SupportTicket, 'id' | 'subject' | 'status' | 'priority' | 'sla'>> };
}

interface Inputs {
  customer: Customer;
  orders: Order[];
  payments: Pick<Payment, 'amount' | 'status'>[];
  debts: DebtPlan[];
  warranties: WarrantyCase[];
  tickets: SupportTicket[];
}

/**
 * Fold a customer's records into a single 360° read. `spent` is derived from
 * received/reconciled payments (Event-Ledger-first — never a stored running total).
 * Pure: all rows are supplied by the caller.
 */
export function buildCustomerOverview(input: Inputs): CustomerOverview {
  const { customer, orders, payments, debts, warranties, tickets } = input;

  const spent = payments
    .filter((p) => p.amount > 0 && (p.status === 'received' || p.status === 'reconciled'))
    .reduce((sum, p) => sum + p.amount, 0);

  const openBalance = debts
    .filter((d) => d.status === 'open')
    .reduce((sum, d) => sum + d.balance, 0);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      consent: customer.consent,
      segments: customer.segments,
      ltv: customer.ltv,
      createdAt: customer.createdAt,
    },
    orders: {
      total: orders.length,
      spent,
      recent: orders
        .slice(0, 10)
        .map((o) => ({ id: o.id, status: o.status, total: o.total, createdAt: o.createdAt })),
    },
    debts: {
      count: debts.length,
      openBalance,
      items: debts.map((d) => ({ id: d.id, balance: d.balance, status: d.status, dueDate: d.dueDate })),
    },
    warranties: {
      open: warranties.filter((w) => !WARRANTY_CLOSED.has(w.status)).length,
      items: warranties.map((w) => ({ id: w.id, imei: w.imei, status: w.status, sla: w.sla })),
    },
    tickets: {
      open: tickets.filter((t) => TICKET_OPEN.has(t.status)).length,
      items: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority, sla: t.sla })),
    },
  };
}

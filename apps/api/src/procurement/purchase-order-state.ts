import { PurchaseOrderStatus } from '@prisma/client';
import { ConflictError } from '../common/errors';

export function assertCanSend(status: PurchaseOrderStatus): void {
  if (status !== 'draft') {
    throw new ConflictError('purchase_order_not_draft', `PO нельзя отправить из статуса ${status}`);
  }
}

export function assertCanReceive(status: PurchaseOrderStatus): void {
  if (status !== 'sent' && status !== 'receiving') {
    throw new ConflictError('purchase_order_not_receivable', `PO нельзя принять из статуса ${status}`);
  }
}

export function assertCanCancel(status: PurchaseOrderStatus): void {
  if (status !== 'draft' && status !== 'sent') {
    throw new ConflictError('purchase_order_not_cancellable', `PO нельзя отменить из статуса ${status}`);
  }
}

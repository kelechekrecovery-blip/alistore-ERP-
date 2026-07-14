import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';

/** Accrue the immutable owner liability when a serialized consignment unit is sold. */
export async function accrueConsignmentSalesOnTx(
  tx: Prisma.TransactionClient,
  input: { orderId: string; imeis: string[]; actor: string; events: AuditInput[] },
): Promise<void> {
  if (input.imeis.length === 0) return;
  const [consignments, lines] = await Promise.all([
    tx.consignmentItem.findMany({
      where: { status: 'active', unit: { imei: { in: input.imeis } } },
      include: { unit: { select: { imei: true } } },
    }),
    tx.orderItem.findMany({
      where: { orderId: input.orderId, imei: { in: input.imeis } },
      select: { imei: true, price: true },
    }),
  ]);
  const priceByImei = new Map(lines.flatMap((line) => line.imei ? [[line.imei, line.price] as const] : []));

  for (const item of consignments) {
    const salePrice = priceByImei.get(item.unit.imei);
    if (salePrice === undefined) continue;
    const commissionAmount = Math.floor((salePrice * item.commissionBps) / 10_000);
    const ownerAmount = salePrice - commissionAmount;
    const accrued = await tx.consignmentItem.updateMany({
      where: { id: item.id, status: 'active' },
      data: {
        status: 'sold',
        saleOrderId: input.orderId,
        salePrice,
        commissionAmount,
        ownerAmount,
        soldAt: new Date(),
      },
    });
    if (accrued.count === 1) {
      input.events.push({
        type: EventType.ConsignmentSold,
        actor: input.actor,
        payload: {
          consignmentItemId: item.id,
          orderId: input.orderId,
          imei: item.unit.imei,
          salePrice,
          commissionAmount,
          ownerAmount,
        },
        refs: [item.id, input.orderId, item.unit.imei, item.productId],
      });
    }
  }
}

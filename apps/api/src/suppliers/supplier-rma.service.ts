import { Injectable } from '@nestjs/common';
import { RmaStatus, UnitStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { assertRmaTransition, RMA_RESOLUTIONS } from './rma-state';
import { buildScorecard, SupplierScore } from './scorecard';

/** Supplier turnaround SLA — overdue open RMAs surface in the Risk Center. */
export const RMA_SLA_DAYS = 30;

/** How a resolution moves the physical unit: back to stock, or written off. */
const UNIT_EFFECT: Partial<Record<RmaStatus, UnitStatus>> = {
  repaired: 'in_stock',
  replaced: 'in_stock',
  refunded: 'written_off',
  rejected: 'written_off',
};

/**
 * Supplier RMAs: return a defective device to its supplier and track it through a
 * guarded status machine. Opening a case sends the unit `in_repair`; a resolution
 * either returns it to stock or writes it off. Every step writes an rma.* ledger
 * event, and the supplier scorecard is derived entirely from these records.
 */
@Injectable()
export class SupplierRmaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  createSupplier(input: { name: string; contact?: string }) {
    return this.prisma.supplier.create({
      data: { name: input.name, contact: input.contact ?? null },
    });
  }

  listSuppliers() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' }, take: 100 });
  }

  listRmas(filter: { supplierId?: string; status?: string }) {
    return this.prisma.supplierRma.findMany({
      where: {
        ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
        ...(filter.status ? { status: filter.status as RmaStatus } : {}),
      },
      orderBy: { sla: 'asc' },
      take: 100,
    });
  }

  /** Open an RMA for a defective unit and take it out of sellable stock. */
  async open(input: { supplierId: string; imei: string; defect: string }, actor: string) {
    const [supplier, unit] = await Promise.all([
      this.prisma.supplier.findUnique({ where: { id: input.supplierId } }),
      this.prisma.deviceUnit.findUnique({ where: { imei: input.imei } }),
    ]);
    if (!supplier) {
      throw new ValidationError('supplier_not_found', `Поставщик ${input.supplierId} не найден`);
    }
    if (!unit) {
      throw new ValidationError('unit_not_found', `Устройство ${input.imei} не найдено`);
    }
    const sla = new Date(Date.now() + RMA_SLA_DAYS * 24 * 60 * 60 * 1000);
    return this.audit.transaction(async (tx) => {
      const rma = await tx.supplierRma.create({
        data: {
          supplierId: input.supplierId,
          imei: input.imei,
          defect: input.defect,
          status: 'created',
          sla,
        },
      });
      await tx.deviceUnit.update({ where: { imei: input.imei }, data: { status: 'in_repair' } });
      return {
        result: rma,
        events: [
          {
            type: EventType.RmaOpened,
            actor,
            payload: { rmaId: rma.id, supplierId: input.supplierId, imei: input.imei, sla: sla.toISOString() },
            refs: [rma.id, input.imei, input.supplierId],
          },
        ],
      };
    });
  }

  /** Advance an RMA through its guarded machine, applying unit effects on resolution. */
  async transition(id: string, to: RmaStatus, actor: string) {
    return this.audit.transaction(async (tx) => {
      const rma = await tx.supplierRma.findUnique({ where: { id } });
      if (!rma) {
        throw new ValidationError('rma_not_found', `RMA ${id} не найдена`);
      }
      assertRmaTransition(rma.status, to);
      const isResolution = RMA_RESOLUTIONS.includes(to);
      const updated = await tx.supplierRma.update({
        where: { id },
        data: { status: to, ...(isResolution ? { resolution: to } : {}) },
      });
      const unitEffect = UNIT_EFFECT[to];
      if (unitEffect) {
        await tx.deviceUnit.update({ where: { imei: rma.imei }, data: { status: unitEffect } });
      }
      return {
        result: updated,
        events: [
          {
            type: eventForTarget(to),
            actor,
            payload: { rmaId: id, from: rma.status, to },
            refs: [id, rma.imei, rma.supplierId],
          },
        ],
      };
    });
  }

  /** Per-supplier scorecard: volume, resolution rate, open backlog. */
  async scorecard(): Promise<SupplierScore[]> {
    const [suppliers, rmas] = await Promise.all([
      this.prisma.supplier.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.supplierRma.findMany({ select: { supplierId: true, status: true, resolution: true } }),
    ]);
    return buildScorecard(suppliers, rmas);
  }
}

function eventForTarget(to: RmaStatus): string {
  if (to === 'shipped') return EventType.RmaShipped;
  if (to === 'rejected') return EventType.RmaRejected;
  if (to === 'closed') return EventType.RmaClosed;
  if (RMA_RESOLUTIONS.includes(to)) return EventType.RmaResolved;
  return `rma.${to}`;
}

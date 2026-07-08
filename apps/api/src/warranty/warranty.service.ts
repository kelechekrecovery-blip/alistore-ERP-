import { Injectable, Optional } from '@nestjs/common';
import { WarrantyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { assertWarrantyTransition } from './warranty-state';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';

/** SLA window for a warranty case (Risk Center flags overdue open cases). */
export const WARRANTY_SLA_DAYS = 14;
const CLOSED_STATUSES: WarrantyStatus[] = ['repaired', 'replaced', 'closed', 'rejected'];

/**
 * Warranty cases tied to a device (IMEI). Each case has an SLA deadline; the Risk
 * Center surfaces open cases past SLA. Status moves through a guarded machine and
 * every step writes a warranty.* ledger event.
 */
@Injectable()
export class WarrantyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  get(id: string) {
    return this.prisma.warrantyCase.findUnique({ where: { id } });
  }

  list(filter: { customerId?: string; imei?: string; status?: string }) {
    return this.prisma.warrantyCase.findMany({
      where: {
        ...(filter.customerId ? { customerId: filter.customerId } : {}),
        ...(filter.imei ? { imei: filter.imei } : {}),
        ...(filter.status ? { status: filter.status as WarrantyStatus } : {}),
      },
      orderBy: { sla: 'asc' },
      take: 100,
    });
  }

  /** Open a warranty case for a sold device. */
  async open(input: { imei: string; customerId: string; problem: string }, actor: string) {
    const unit = await this.prisma.deviceUnit.findUnique({ where: { imei: input.imei } });
    if (!unit) {
      throw new ValidationError('unit_not_found', `Устройство ${input.imei} не найдено`);
    }
    const sla = new Date(Date.now() + WARRANTY_SLA_DAYS * 24 * 60 * 60 * 1000);
    return this.audit.transaction(async (tx) => {
      const wc = await tx.warrantyCase.create({
        data: {
          imei: input.imei,
          customerId: input.customerId,
          problem: input.problem,
          status: 'created',
          sla,
        },
      });
      if (this.outbox) {
        await enqueueConsentedCustomerNotice(tx, this.outbox, {
          customerId: wc.customerId,
          template: 'warranty_created',
          payload: { warrantyId: wc.id, imei: input.imei, sla: sla.toISOString() },
        });
      }
      return {
        result: wc,
        events: [
          {
            type: EventType.WarrantyCreated,
            actor,
            payload: { warrantyId: wc.id, imei: input.imei, sla: sla.toISOString() },
            refs: [wc.id, input.imei],
          },
        ],
      };
    });
  }

  /** Advance a warranty case through its guarded state machine. */
  async transition(id: string, to: WarrantyStatus, actor: string) {
    return this.audit.transaction(async (tx) => {
      const wc = await tx.warrantyCase.findUnique({ where: { id } });
      if (!wc) {
        throw new ValidationError('warranty_not_found', `Гарантия ${id} не найдена`);
      }
      assertWarrantyTransition(wc.status, to);
      const updated = await tx.warrantyCase.update({ where: { id }, data: { status: to } });
      const type = CLOSED_STATUSES.includes(to) ? EventType.WarrantyClosed : `warranty.${to}`;
      if (this.outbox && CLOSED_STATUSES.includes(to)) {
        await enqueueConsentedCustomerNotice(tx, this.outbox, {
          customerId: wc.customerId,
          template: 'warranty_closed',
          payload: { warrantyId: id, imei: wc.imei, from: wc.status, to },
        });
      }
      return {
        result: updated,
        events: [
          {
            type,
            actor,
            payload: { warrantyId: id, from: wc.status, to },
            refs: [id, wc.imei],
          },
        ],
      };
    });
  }
}

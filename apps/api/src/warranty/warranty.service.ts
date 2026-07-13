import { Injectable, Optional } from '@nestjs/common';
import { Prisma, WarrantyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { assertWarrantyTransition } from './warranty-state';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';

/** SLA window for a warranty case (Risk Center flags overdue open cases). */
export const WARRANTY_SLA_DAYS = 14;
const CLOSED_STATUSES: WarrantyStatus[] = ['repaired', 'replaced', 'closed', 'rejected'];
const ACTIVE_STATUSES: WarrantyStatus[] = ['created', 'received', 'diagnostics', 'waiting_supplier', 'approved'];

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
  async open(
    input: { imei: string; customerId: string; problem: string },
    actor: string,
    idempotencyKey?: string,
  ) {
    const unit = await this.prisma.deviceUnit.findUnique({ where: { imei: input.imei } });
    if (!unit) {
      throw new ValidationError('unit_not_found', `Устройство ${input.imei} не найдено`);
    }
    const order = unit.orderId
      ? await this.prisma.order.findUnique({ where: { id: unit.orderId }, select: { customerId: true } })
      : null;
    if (!order || order.customerId !== input.customerId) {
      throw new ValidationError('device_not_owned', 'Устройство не принадлежит этому клиенту');
    }

    const key = idempotencyKey?.trim();
    if (key && key.length > 128) {
      throw new ValidationError('invalid_idempotency_key', 'Idempotency key слишком длинный');
    }
    if (key) {
      const existing = await this.prisma.warrantyOpenCommand.findUnique({ where: { idempotencyKey: key } });
      if (existing) return this.replayOpen(existing, input);
    }

    const sla = new Date(Date.now() + WARRANTY_SLA_DAYS * 24 * 60 * 60 * 1000);
    try {
      return await this.audit.transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.imei}))::text AS locked`;
        if (key) {
          const replay = await tx.warrantyOpenCommand.findUnique({ where: { idempotencyKey: key } });
          if (replay) return { result: await this.replayOpen(replay, input), events: [] };
        }
        const active = await tx.warrantyCase.findFirst({
          where: { imei: input.imei, customerId: input.customerId, status: { in: ACTIVE_STATUSES } },
          orderBy: { sla: 'asc' },
        });
        if (active) throw new ConflictError('warranty_already_open', 'По устройству уже есть активное обращение');
        if (key) {
          await tx.warrantyOpenCommand.create({
            data: { idempotencyKey: key, customerId: input.customerId, imei: input.imei, problem: input.problem },
          });
        }
        const wc = await tx.warrantyCase.create({
          data: {
            imei: input.imei,
            customerId: input.customerId,
            problem: input.problem,
            status: 'created',
            sla,
          },
        });
        if (key) {
          await tx.warrantyOpenCommand.update({ where: { idempotencyKey: key }, data: { warrantyCaseId: wc.id } });
        }
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
    } catch (error) {
      if (key && isUniqueViolation(error)) {
        const raced = await this.prisma.warrantyOpenCommand.findUniqueOrThrow({ where: { idempotencyKey: key } });
        return this.replayOpen(raced, input);
      }
      throw error;
    }
  }

  private async replayOpen(
    command: { customerId: string; imei: string; problem: string; warrantyCaseId: string | null },
    input: { imei: string; customerId: string; problem: string },
  ) {
    const matches = command.customerId === input.customerId && command.imei === input.imei && command.problem === input.problem;
    if (!matches) throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим обращением');
    if (!command.warrantyCaseId) throw new ConflictError('warranty_open_in_progress', 'Гарантийное обращение ещё создаётся');
    const warranty = await this.prisma.warrantyCase.findUnique({ where: { id: command.warrantyCaseId } });
    if (!warranty) throw new ValidationError('warranty_not_found', 'Гарантийное обращение не найдено');
    return warranty;
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

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

import { ConflictException, Injectable, Optional } from '@nestjs/common';
import { Customer, SupportTicket, TicketStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { OpenGuestTicketDto, OpenTicketDto, TicketTransitionDto } from './support.dto';
import { isUniqueConstraintViolation } from '../common/prisma-errors';
import { normalizePhone } from '../auth/phone-normalization';
import {
  assertTicketTransition,
  escalatedPriority,
  normalizePriority,
  slaFor,
} from './ticket-state';

/**
 * Support Inbox. Tickets arrive from any channel, carry an SLA derived from their
 * priority, and move through a guarded status machine. Escalation bumps the priority
 * one step (and tightens the SLA). Every step writes a ticket.* ledger event; overdue
 * open tickets surface in the Risk Center.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  get(id: string) {
    return this.prisma.supportTicket.findUnique({ where: { id } });
  }

  list(filter: { customerId?: string; status?: string }) {
    return this.prisma.supportTicket.findMany({
      where: {
        ...(filter.customerId ? { customerId: filter.customerId } : {}),
        ...(filter.status ? { status: filter.status as TicketStatus } : {}),
      },
      orderBy: { sla: 'asc' },
      take: 100,
    });
  }

  /** Open a ticket for a customer, with an SLA set from its priority. */
  async open(dto: OpenTicketDto, actor: string, idempotencyKey?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) {
      throw new ValidationError('customer_not_found', `Клиент ${dto.customerId} не найден`);
    }
    const priority = normalizePriority(dto.priority);
    const key = idempotencyKey?.trim() || undefined;
    if (key) {
      const existing = await this.prisma.supportTicket.findUnique({ where: { idempotencyKey: key } });
      if (existing) return replayTicket(existing, dto, priority);
    }
    const sla = slaFor(priority, Date.now());
    return this.audit.transaction(async (tx) => {
      if (key) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'support:' + key}))::text AS locked`;
        const replay = await tx.supportTicket.findUnique({ where: { idempotencyKey: key } });
        if (replay) return { result: replayTicket(replay, dto, priority), events: [] };
      }
      const ticket = await tx.supportTicket.create({
        data: {
          customerId: dto.customerId,
          channel: dto.channel,
          subject: dto.subject,
          body: dto.body ?? null,
          priority,
          sla,
          status: 'new',
          idempotencyKey: key,
        },
      });
      return {
        result: ticket,
        events: [
          {
            type: EventType.TicketCreated,
            actor,
            payload: { ticketId: ticket.id, channel: dto.channel, priority, sla: sla.toISOString() },
            refs: [ticket.id, dto.customerId],
          },
        ],
      };
    });
  }

  async openGuest(dto: OpenGuestTicketDto, idempotencyKey: string) {
    const phone = normalizePhone(dto.phone);
    const name = dto.name?.trim() || 'Клиент';
    const priority = normalizePriority(dto.priority);
    const persistedKey = `guest-support:${createHash('sha256').update(idempotencyKey).digest('hex')}`;
    const ticketDto: OpenTicketDto = {
      customerId: '',
      channel: dto.channel,
      subject: dto.subject,
      body: dto.body,
      priority: dto.priority,
    };

    try {
      return await this.audit.transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'support:' + persistedKey}))::text AS locked`;
        const replay = await tx.supportTicket.findUnique({ where: { idempotencyKey: persistedKey } });
        if (replay) {
          const customer = await tx.customer.findUnique({ where: { id: replay.customerId } });
          if (!customer) throw new ConflictError('guest_support_customer_missing', 'Клиент обращения не найден');
          assertGuestReplay(replay, customer, { ...ticketDto, customerId: customer.id }, phone, name, priority);
          return { result: { ticket: replay, customerId: customer.id }, events: [] };
        }

        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'guest-customer:' + phone}))::text AS locked`;
        const existingCustomer = await tx.customer.findFirst({
          where: { phone: { in: [phone, phone.slice(1)] } },
        });
        if (existingCustomer) throw guestCustomerRequiresAuth();
        const customer = await tx.customer.create({ data: { phone, name } });
        const sla = slaFor(priority, Date.now());
        const ticket = await tx.supportTicket.create({
          data: {
            customerId: customer.id,
            channel: dto.channel,
            subject: dto.subject,
            body: dto.body ?? null,
            priority,
            sla,
            status: 'new',
            idempotencyKey: persistedKey,
          },
        });
        return {
          result: { ticket, customerId: customer.id },
          events: [{
            type: EventType.TicketCreated,
            actor: customer.id,
            payload: { ticketId: ticket.id, channel: dto.channel, priority, sla: sla.toISOString() },
            refs: [ticket.id, customer.id],
          }],
        };
      });
    } catch (error) {
      // Other guest-entry points do not share this advisory lock. A concurrent
      // customer creation can therefore win after our lookup; map the database
      // uniqueness race to the same fail-closed authentication response.
      if (isUniqueConstraintViolation(error)) throw guestCustomerRequiresAuth();
      throw error;
    }
  }

  /** Advance a ticket through its guarded status machine. */
  async transition(id: string, to: TicketStatus, dto: TicketTransitionDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      // Serialize every support writer with Telegram approval execution. Reading
      // only before update allows a waiter to overwrite a state committed while
      // it was blocked; lock first, then reread the authoritative row.
      const [ticket] = await tx.$queryRaw<SupportTicket[]>`
        SELECT * FROM "SupportTicket" WHERE id = ${id} FOR UPDATE
      `;
      if (!ticket) {
        throw new ValidationError('ticket_not_found', `Тикет ${id} не найден`);
      }
      assertTicketTransition(ticket.status, to);
      const claimed = await tx.supportTicket.updateMany({
        where: {
          id,
          revision: ticket.revision,
          status: ticket.status,
          assignee: ticket.assignee,
          priority: ticket.priority,
          sla: ticket.sla,
        },
        data: { status: to, ...(dto.assignee ? { assignee: dto.assignee } : {}) },
      });
      if (claimed.count !== 1) {
        throw new ConflictError('support_ticket_stale', `Тикет ${id} изменён конкурентной операцией`);
      }
      const updated = await tx.supportTicket.findUniqueOrThrow({ where: { id } });
      if (this.outbox && to === 'resolved') {
        await enqueueConsentedCustomerNotice(tx, this.outbox, {
          customerId: ticket.customerId,
          template: 'ticket_resolved',
          payload: { ticketId: id, subject: ticket.subject },
          transactional: true,
        });
      }
      return {
        result: updated,
        events: [
          {
            type: `ticket.${to}`,
            actor,
            payload: { ticketId: id, from: ticket.status, to, assignee: updated.assignee },
            refs: [id, ticket.customerId],
          },
        ],
      };
    });
  }

  /** Escalate a ticket one priority step up (tightening its SLA). */
  async escalate(id: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      const [ticket] = await tx.$queryRaw<SupportTicket[]>`
        SELECT * FROM "SupportTicket" WHERE id = ${id} FOR UPDATE
      `;
      if (!ticket) {
        throw new ValidationError('ticket_not_found', `Тикет ${id} не найден`);
      }
      if (ticket.status === 'closed' || ticket.status === 'resolved') {
        throw new ConflictError('ticket_not_escalatable', `Тикет ${id} уже ${ticket.status}`);
      }
      const next = escalatedPriority(ticket.priority);
      if (!next) {
        throw new ConflictError('ticket_max_priority', `Тикет ${id} уже на максимальном приоритете`);
      }
      const sla = slaFor(next, Date.now());
      const claimed = await tx.supportTicket.updateMany({
        where: {
          id,
          revision: ticket.revision,
          status: ticket.status,
          assignee: ticket.assignee,
          priority: ticket.priority,
          sla: ticket.sla,
        },
        data: { priority: next, sla },
      });
      if (claimed.count !== 1) {
        throw new ConflictError('support_ticket_stale', `Тикет ${id} изменён конкурентной операцией`);
      }
      const updated = await tx.supportTicket.findUniqueOrThrow({ where: { id } });
      return {
        result: updated,
        events: [
          {
            type: EventType.TicketEscalated,
            actor,
            payload: { ticketId: id, from: ticket.priority, to: next, sla: sla.toISOString() },
            refs: [id, ticket.customerId],
          },
        ],
      };
    });
  }
}

function guestCustomerRequiresAuth() {
  return new ConflictException({
    code: 'guest_customer_requires_auth',
    message: 'Для этого номера войдите в аккаунт перед созданием обращения',
  });
}

function replayTicket(
  ticket: SupportTicket,
  dto: OpenTicketDto,
  priority: string,
) {
  const same = ticket.customerId === dto.customerId && ticket.channel === dto.channel &&
    ticket.subject === dto.subject && ticket.body === (dto.body ?? null) && ticket.priority === priority;
  if (!same) throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим обращением');
  return ticket;
}

function assertGuestReplay(
  ticket: SupportTicket,
  customer: Customer,
  dto: OpenTicketDto,
  phone: string,
  name: string,
  priority: string,
) {
  if (Date.now() - ticket.createdAt.getTime() > 30 * 60 * 1000) {
    throw new ConflictError('guest_support_replay_expired', 'Повтор гостевого обращения истёк; войдите в аккаунт');
  }
  if (customer.phone !== phone || customer.name !== name) {
    throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим обращением');
  }
  replayTicket(ticket, dto, priority);
}

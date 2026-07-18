import { Injectable, Optional } from '@nestjs/common';
import { SupportTicket, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { OpenTicketDto, TicketTransitionDto } from './support.dto';
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

  /** Advance a ticket through its guarded status machine. */
  async transition(id: string, to: TicketStatus, dto: TicketTransitionDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id } });
      if (!ticket) {
        throw new ValidationError('ticket_not_found', `Тикет ${id} не найден`);
      }
      assertTicketTransition(ticket.status, to);
      const updated = await tx.supportTicket.update({
        where: { id },
        data: { status: to, ...(dto.assignee ? { assignee: dto.assignee } : {}) },
      });
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
      const ticket = await tx.supportTicket.findUnique({ where: { id } });
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
      const updated = await tx.supportTicket.update({
        where: { id },
        data: { priority: next, sla },
      });
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

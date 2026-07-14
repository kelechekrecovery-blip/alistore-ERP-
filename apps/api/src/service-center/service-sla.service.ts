import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { PrismaService } from '../prisma/prisma.service';

const TERMINAL_STATUSES = ['repaired', 'replaced', 'rejected', 'closed'] as const;

@Injectable()
export class ServiceSlaService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async escalateOverdue(now = new Date()): Promise<{ escalated: number }> {
    const candidates = await this.prisma.warrantyCase.findMany({
      where: {
        sla: { lt: now },
        slaEscalatedAt: null,
        status: { notIn: [...TERMINAL_STATUSES] },
      },
      select: { id: true },
      take: 100,
    });
    let escalated = 0;
    for (const candidate of candidates) {
      const applied = await this.audit.transaction<boolean>(async (tx) => {
        const updated = await tx.warrantyCase.updateMany({
          where: {
            id: candidate.id,
            sla: { lt: now },
            slaEscalatedAt: null,
            status: { notIn: [...TERMINAL_STATUSES] },
          },
          data: { slaEscalatedAt: now },
        });
        if (updated.count !== 1) return { result: false, events: [] };
        const current = await tx.warrantyCase.findUniqueOrThrow({
          where: { id: candidate.id },
          include: { workOrder: { select: { point: true } } },
        });
        const recipients = current.workOrder
          ? await tx.staffUser.findMany({
              where: { active: true, point: current.workOrder.point, role: { in: ['service', 'admin', 'owner'] } },
              select: { id: true },
            })
          : [];
        await tx.outboxMessage.createMany({
          data: [current.customerId, ...recipients.map((recipient) => recipient.id)].map((recipient) => ({
            channel: 'push',
            recipient,
            template: 'service_sla_breached',
            payload: { warrantyCaseId: current.id, status: current.status, sla: current.sla.toISOString() },
          })),
        });
        return {
          result: true,
          events: [{
            type: EventType.ServiceSlaBreached,
            actor: 'system',
            payload: { warrantyCaseId: current.id, status: current.status, sla: current.sla.toISOString() },
            refs: [current.id, current.imei, current.customerId],
          }],
        };
      });
      if (applied) escalated += 1;
    }
    return { escalated };
  }
}

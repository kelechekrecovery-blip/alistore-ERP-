import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventType } from '../audit/event-types';

/** Outbox template shared by every owner business alert (dedup anchor). */
export const OWNER_ALERT_TEMPLATE = 'owner_alert';

export interface OwnerAlertSweepResult {
  alerted: number;
  skipped: number;
}

interface AlertPayload extends Record<string, Prisma.InputJsonValue | undefined> {
  eventId: string;
  kind: 'cash_variance' | 'approval_requested';
}

/**
 * Owner business alerts: the ledger already records everything the owner
 * worries about (cash variance on shift close, dangerous actions parked for
 * approval), but those signals sat in Risk Center waiting to be looked at.
 * This sweep turns them into push notifications through the transactional
 * Outbox — same channel/recipient pattern as service-sla (push to active
 * staff by role; channel adapters deliver).
 *
 * Idempotency: one Outbox message per ledger event per owner, keyed by
 * `payload.eventId` under the `owner_alert` template. Re-running never
 * duplicates. The ledger itself is never written — an alert is delivery
 * state, not domain state.
 */
@Injectable()
export class OwnerAlertsService {
  private readonly logger = new Logger(OwnerAlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sweep(windowHours = 24): Promise<OwnerAlertSweepResult> {
    const since = new Date(Date.now() - windowHours * 3_600_000);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        ts: { gte: since },
        type: { in: [EventType.ShiftClosed, EventType.ApprovalRequested] },
      },
      orderBy: { ts: 'asc' },
    });
    const candidates = events
      .map((event) => this.toAlert(event.id, event.type, event.payload))
      .filter((alert): alert is AlertPayload => alert !== null);
    if (candidates.length === 0) return { alerted: 0, skipped: 0 };

    // Alerts for events in the window were necessarily enqueued after `since`,
    // so bounding the dedup scan by createdAt keeps it cheap and complete.
    const sent = await this.prisma.outboxMessage.findMany({
      where: { template: OWNER_ALERT_TEMPLATE, createdAt: { gte: since } },
      select: { payload: true },
    });
    const seen = new Set(
      sent
        .map((row) => (row.payload as { eventId?: string } | null)?.eventId)
        .filter((id): id is string => Boolean(id)),
    );
    const fresh = candidates.filter((alert) => !seen.has(alert.eventId));
    const skipped = candidates.length - fresh.length;
    if (fresh.length === 0) return { alerted: 0, skipped };

    const owners = await this.prisma.staffUser.findMany({
      where: { role: 'owner', active: true },
      select: { id: true },
    });
    if (owners.length === 0) {
      this.logger.warn(`No active owner accounts — ${fresh.length} alert(s) dropped`);
      return { alerted: 0, skipped: candidates.length };
    }

    await this.prisma.outboxMessage.createMany({
      data: fresh.flatMap((alert) =>
        owners.map((owner) => ({
          channel: 'push',
          recipient: owner.id,
          template: OWNER_ALERT_TEMPLATE,
          payload: alert as Prisma.InputJsonValue,
        })),
      ),
    });
    this.logger.log(`Owner alerts: ${fresh.length} event(s) → ${owners.length} owner(s)`);
    return { alerted: fresh.length, skipped };
  }

  /** Map a ledger event to an alert payload, or null when it is not alertable. */
  private toAlert(eventId: string, type: string, raw: Prisma.JsonValue): AlertPayload | null {
    const payload = (raw ?? {}) as Record<string, unknown>;
    if (type === EventType.ShiftClosed) {
      const diff = Number(payload['diff'] ?? 0);
      if (!Number.isFinite(diff) || diff === 0) return null;
      return {
        eventId,
        kind: 'cash_variance',
        diff,
        shiftId: String(payload['shiftId'] ?? ''),
        expected: Number(payload['expected'] ?? 0),
        closeCash: Number(payload['closeCash'] ?? 0),
      };
    }
    if (type === EventType.ApprovalRequested) {
      return {
        eventId,
        kind: 'approval_requested',
        action: String(payload['action'] ?? ''),
        approvalId: String(payload['approvalId'] ?? ''),
      };
    }
    return null;
  }
}

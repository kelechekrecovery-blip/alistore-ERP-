import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { canApprove, Role } from '../rbac/permissions';
import { ACTION_EXECUTORS } from './action-executors';

/** A dangerous action captured for approval (Approval Rules Matrix). */
export interface ApprovalRequest {
  action: string; // refund | discount | write_off | price | debt | stock_adjust | delete | pii
  requester: string;
  reason: string;
  payload?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
}

export interface DecideInput {
  status: 'approved' | 'rejected';
  approver: string;
  approverRole: Role;
  reason?: string;
}

/**
 * Approval cycle for dangerous actions (start → action → approval → event → final).
 * A gated action is NOT executed on request — it is parked as an Approval and
 * returns an approvalId (HTTP 202). On approve, the parked action is executed here,
 * in the same transaction as the approval.approved event, so money/stock/status and
 * the ledger move together (invariant #10). The Approval row is append-only in
 * spirit: it only moves requested → approved/rejected once.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get(id: string) {
    return this.prisma.approval.findUnique({ where: { id } });
  }

  list(status?: string) {
    return this.prisma.approval.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Park a dangerous action for approval; returns the approvalId (caller → 202). */
  async request(req: ApprovalRequest): Promise<{ approvalId: string; status: 'requested' }> {
    return this.audit.transaction(async (tx) => {
      const approval = await tx.approval.create({
        data: {
          action: req.action,
          requester: req.requester,
          reason: req.reason,
          status: 'requested',
          evidence: {
            payload: req.payload ?? null,
            evidence: req.evidence ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      return {
        result: { approvalId: approval.id, status: 'requested' as const },
        events: [
          {
            type: EventType.ApprovalRequested,
            actor: req.requester,
            payload: { approvalId: approval.id, action: req.action, reason: req.reason },
            refs: [approval.id],
          },
        ],
      };
    });
  }

  /** Approve (executes the parked action) or reject an approval. */
  async decide(id: string, input: DecideInput) {
    return this.audit.transaction(async (tx) => {
      const approval = await tx.approval.findUnique({ where: { id } });
      if (!approval) {
        throw new ValidationError('approval_not_found', `Approval ${id} не найден`);
      }
      if (approval.status !== 'requested') {
        throw new ConflictError(
          'approval_already_decided',
          `Approval ${id} уже ${approval.status}`,
        );
      }
      // Role Permission Matrix: only an authorized role may decide this action.
      if (!canApprove(approval.action, input.approverRole)) {
        throw new ForbiddenError(
          'approver_not_authorized',
          `Роль ${input.approverRole} не может решать действие «${approval.action}»`,
        );
      }

      if (input.status === 'rejected') {
        const updated = await tx.approval.update({
          where: { id },
          data: { status: 'rejected', approver: input.approver },
        });
        return {
          result: updated,
          events: [
            {
              type: EventType.ApprovalRejected,
              actor: input.approver,
              payload: { approvalId: id, action: approval.action, reason: input.reason ?? null },
              refs: [id],
            },
          ],
        };
      }

      const updated = await tx.approval.update({
        where: { id },
        data: { status: 'approved', approver: input.approver },
      });
      const events: AuditInput[] = [
        {
          type: EventType.ApprovalApproved,
          actor: input.approver,
          payload: { approvalId: id, action: approval.action },
          refs: [id],
        },
      ];

      // Execute the parked action via its registered executor.
      const payload = (approval.evidence as { payload?: Record<string, unknown> } | null)
        ?.payload;
      const execute = ACTION_EXECUTORS[approval.action];
      if (execute && payload) {
        await execute(tx, payload, input.approver, id, events);
      }

      return { result: updated, events };
    });
  }
}

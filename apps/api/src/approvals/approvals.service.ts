import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { canApprove, Role } from '../rbac/permissions';
import { ACTION_EXECUTORS, ACTION_REJECTION_EXECUTORS } from './action-executors';
import { ExchangesService } from '../exchanges/exchanges.service';
import { StaffAuthService } from '../staff-auth/staff-auth.service';

/** A dangerous action captured for approval (Approval Rules Matrix). */
export interface ApprovalRequest {
  action: string; // refund | discount | write_off | quarantine_write_off | price | debt | stock_adjust | delete | pii
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
    @Optional() private readonly exchanges?: ExchangesService,
    @Optional() private readonly staffAuth?: StaffAuthService,
  ) {}

  get(id: string) {
    return this.prisma.approval.findUnique({ where: { id }, include: { exchangeRequest: true } });
  }

  list(status?: string) {
    return this.prisma.approval.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { exchangeRequest: true },
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
    return this.audit.transaction((tx) => this.decideOnTx(tx, id, input));
  }

  async decideWithStepUp(id: string, input: DecideInput, totpToken?: string) {
    return this.audit.transaction(async (tx) => {
      if (!this.staffAuth) throw new ConflictError('staff_auth_missing', 'Step-up executor не подключён');
      await this.staffAuth.verifyStepUpOnTx(tx, input.approver, totpToken);
      return this.decideOnTx(tx, id, input);
    });
  }

  private async decideOnTx(tx: Prisma.TransactionClient, id: string, input: DecideInput) {
      await tx.$queryRaw`SELECT id FROM "Approval" WHERE id = ${id} FOR UPDATE`;
      const approval = await tx.approval.findUnique({ where: { id }, include: { exchangeRequest: true } });
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
      if (['campaign_budget', 'refund', 'quarantine_write_off', 'exchange', 'manual_adjustment'].includes(approval.action)
        && approval.requester === input.approver) {
        throw new ForbiddenError(
          'four_eye_approval_required',
          'Инициатор не может согласовать собственное материальное действие',
        );
      }
      if (approval.action === 'exchange') {
        if (!this.exchanges) throw new ConflictError('exchange_executor_missing', 'Exchange executor не подключён');
        if (!approval.exchangeRequest) {
          throw new ConflictError('exchange_request_missing', 'Approval не связан с заявкой обмена');
        }
        const expiryEvents: AuditInput[] = [];
        const expired = await this.exchanges.expireIfPastDeadlineOnTx(
          tx,
          approval.exchangeRequest.id,
          id,
          new Date(),
          expiryEvents,
        );
        if (expired) {
          return {
            result: await tx.approval.findUnique({ where: { id } }),
            events: expiryEvents,
          };
        }
      }

      // Atomically claim the decision — two concurrent decides cannot both flip
      // requested→(approved|rejected). count===0 ⇒ another decider won the race
      // (prevents a double refund / double price change from one approval).
      const decidedStatus = input.status === 'rejected' ? 'rejected' : 'approved';
      const claim = await tx.approval.updateMany({
        where: { id, status: 'requested' },
        data: { status: decidedStatus, approver: input.approver },
      });
      if (claim.count === 0) {
        throw new ConflictError(
          'approval_already_decided',
          `Approval ${id} уже решён другим аппрувером`,
        );
      }
      const updated = await tx.approval.findUnique({ where: { id } });

      if (input.status === 'rejected') {
        const events: AuditInput[] = [
          {
            type: EventType.ApprovalRejected,
            actor: input.approver,
            payload: { approvalId: id, action: approval.action, reason: input.reason ?? null },
            refs: [id],
          },
        ];
        const payload = (approval.evidence as { payload?: Record<string, unknown> } | null)
          ?.payload;
        const reject = ACTION_REJECTION_EXECUTORS[approval.action];
        if (reject && payload) {
          await reject(tx, payload, input.approver, id, input.reason ?? null, events);
        }
        if (approval.action === 'exchange' && approval.exchangeRequest) {
          if (!this.exchanges) throw new ConflictError('exchange_executor_missing', 'Exchange executor не подключён');
          await this.exchanges.rejectApprovedOnTx(
            tx,
            approval.exchangeRequest.id,
            id,
            input.approver,
            input.reason ?? null,
            events,
          );
        }
        return {
          result: updated,
          events,
        };
      }
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
      if (approval.action === 'exchange') {
        if (!this.exchanges) throw new ConflictError('exchange_executor_missing', 'Exchange executor не подключён');
        if (!approval.exchangeRequest) {
          throw new ConflictError('exchange_request_missing', 'Approval не связан с заявкой обмена');
        }
        const exchange = await this.exchanges.executeApprovedOnTx(
          tx,
          approval.exchangeRequest.id,
          input.approver,
          id,
        );
        events.push(...exchange.events);
      }

      return { result: updated, events };
  }
}

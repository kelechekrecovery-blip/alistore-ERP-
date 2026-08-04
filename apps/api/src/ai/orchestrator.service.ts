import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditInput, AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { InsightsService } from './insights.service';
import { PricingService } from './pricing.service';
import { ReorderService } from './reorder.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AiReadTool, CreateAiRunDto } from './orchestrator.dto';

type Actor = { customerId: string; typ: string; role?: string };

/**
 * Single durable boundary for AI work. Tools are an explicit allow-list and
 * currently read-only; write intent must be implemented by a domain service
 * through ApprovalService, never by this orchestrator or Prisma directly.
 */
@Injectable()
export class AiOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly insights: InsightsService,
    private readonly pricing: PricingService,
    private readonly reorder: ReorderService,
    private readonly reports: ReportsService,
    private readonly approvals: ApprovalsService,
  ) {}

  async run(dto: CreateAiRunDto, actor: Actor) {
    if (envFlag('AI_KILL_SWITCH')) {
      throw new ForbiddenException('AI temporarily disabled by safety kill switch');
    }
    assertGlobalReadRole(actor);
    const actorId = actor.customerId;
    const run = await this.audit.transaction(async (tx) => {
      const created = await tx.aiRun.create({
        data: {
          actorType: actor.typ,
          actorId,
          surface: dto.surface?.trim() || 'erp',
          intent: dto.intent.trim(),
          status: 'started',
        },
      });
      return {
        result: created,
        events: [{
          type: 'ai.run_started',
          actor: actorId,
          payload: { runId: created.id, tool: dto.tool, surface: created.surface },
          refs: [created.id],
        }],
      };
    });

    try {
      const output = boundToolOutput(await withTimeout(this.executeReadTool(dto.tool, dto.ticketId), 30_000));
      const summary = summarize(output);
      const decision = await this.audit.transaction(async (tx) => {
        await tx.aiRunStep.create({
          data: {
            runId: run.id,
            kind: 'tool_call',
            toolName: dto.tool,
            inputHash: hash({ tool: dto.tool, intent: dto.intent, ticketId: dto.ticketId ?? null }),
            outputSummary: summary,
            status: 'completed',
          },
        });
        const created = await tx.aiDecision.create({
          data: {
            runId: run.id,
            summary,
            confidence: 1,
            status: 'draft',
            // Support triage creates a customer-facing draft and therefore
            // must remain explicitly human-approved. The other current tools
            // are read-only reports/recommendations with no executable action.
            requiresApproval: dto.tool === 'support_triage',
            sourceRefs: [run.id],
            recommendation: output as object,
          },
        });
        let approvalId: string | undefined;
        const events: AuditInput[] = [{
          type: 'ai.run_completed',
          actor: actorId,
          payload: { runId: run.id, tool: dto.tool, decisionId: created.id },
          refs: [run.id, created.id],
        }];
        if (dto.tool === 'support_triage') {
          const approval = await this.approvals.requestOnTx(tx, {
            action: 'ai_support_triage',
            requester: actorId,
            reason: dto.intent.trim(),
            sourceRef: created.id,
            idempotencyKey: `ai-support-triage:${run.id}`,
            payload: { decisionId: created.id, runId: run.id, ticketId: dto.ticketId ?? null },
          });
          approvalId = approval.result.approvalId;
          events.push(...approval.events);
        }
        await tx.aiRun.update({
          where: { id: run.id },
          data: { status: 'completed', completedAt: new Date() },
        });
        return {
          result: { ...created, approvalId },
          events,
        };
      });
      return { runId: run.id, status: 'completed', decision, output };
    } catch (error) {
      const errorCode = error instanceof Error ? error.name : 'ai_tool_failed';
      await this.audit.transaction(async (tx) => {
        await tx.aiRun.update({ where: { id: run.id }, data: { status: 'failed', errorCode, completedAt: new Date() } });
        await tx.aiRunStep.create({ data: { runId: run.id, kind: 'guardrail', status: 'failed', outputSummary: errorCode } });
        return {
          result: undefined,
          events: [{
            type: 'ai.guardrail_blocked',
            actor: actorId,
            payload: { runId: run.id, tool: dto.tool, errorCode },
            refs: [run.id],
          }],
        };
      });
      throw error;
    }
  }

  async getRun(id: string, actor: Actor) {
    assertGlobalReadRole(actor);
    const run = await this.prisma.aiRun.findFirst({ where: { id, actorId: actor.customerId }, include: { steps: true, decisions: true } });
    if (!run) throw new NotFoundException('AI run not found');
    return run;
  }

  private async executeReadTool(tool: AiReadTool, ticketId?: string): Promise<unknown> {
    switch (tool) {
      case 'insights': return this.insights.insights();
      case 'pricing_review': return this.pricing.review();
      case 'reorder_review': return this.reorder.review();
      case 'risk_signals': return this.reports.risks();
      case 'support_triage': return this.supportTriage(ticketId);
    }
  }

  private async supportTriage(ticketId?: string) {
    if (!ticketId?.trim()) throw new Error('support_triage_requires_ticket_id');
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId.trim() } });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    const text = `${ticket.subject} ${ticket.body ?? ''}`.toLowerCase();
    const category = /возврат|refund|обмен|exchange/.test(text) ? 'returns'
      : /гарант|ремонт|слом|warranty|repair/.test(text) ? 'warranty'
      : /оплат|платеж|касс|payment/.test(text) ? 'payment'
      : /достав|курьер|delivery/.test(text) ? 'delivery' : 'general';
    const suggestedPriority = ticket.priority === 'urgent' || /срочно|urgent|не работает/.test(text) ? 'urgent' : ticket.priority;
    return {
      source: 'rules', ticketId: ticket.id, category, suggestedPriority,
      status: ticket.status, sla: ticket.sla,
      draft: `Здравствуйте! Мы получили обращение «${ticket.subject}». Специалист проверит его и вернётся с ответом в рамках SLA.`,
      requiresHumanReview: true,
    };
  }

}

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function assertGlobalReadRole(actor: Actor): void {
  // The first tools read global reports/catalog data. Point-scoped roles must
  // use a future store-scoped registry instead of receiving cross-store data.
  if (actor.typ !== 'staff' || (actor.role !== 'owner' && actor.role !== 'admin')) {
    throw new ForbiddenException('AI control plane доступен только owner/admin');
  }
}

function boundToolOutput(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 50).map(boundToolOutput);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, boundToolOutput(item)]));
  }
  return value;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('ai_tool_timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function summarize(value: unknown): string {
  if (Array.isArray(value)) return `array:${value.length}`;
  if (value && typeof value === 'object') return `object:${Object.keys(value).slice(0, 12).join(',')}`;
  return typeof value;
}

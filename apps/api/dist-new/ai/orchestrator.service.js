"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../audit/audit.service");
const prisma_service_1 = require("../prisma/prisma.service");
const reports_service_1 = require("../reports/reports.service");
const insights_service_1 = require("./insights.service");
const pricing_service_1 = require("./pricing.service");
const reorder_service_1 = require("./reorder.service");
const approvals_service_1 = require("../approvals/approvals.service");
let AiOrchestratorService = class AiOrchestratorService {
    constructor(prisma, audit, insights, pricing, reorder, reports, approvals) {
        this.prisma = prisma;
        this.audit = audit;
        this.insights = insights;
        this.pricing = pricing;
        this.reorder = reorder;
        this.reports = reports;
        this.approvals = approvals;
    }
    async run(dto, actor) {
        if (envFlag('AI_KILL_SWITCH')) {
            throw new common_1.ForbiddenException('AI temporarily disabled by safety kill switch');
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
                        requiresApproval: dto.tool === 'support_triage',
                        sourceRefs: [run.id],
                        recommendation: output,
                    },
                });
                let approvalId;
                const events = [{
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
        }
        catch (error) {
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
    async getRun(id, actor) {
        assertGlobalReadRole(actor);
        const run = await this.prisma.aiRun.findFirst({ where: { id, actorId: actor.customerId }, include: { steps: true, decisions: true } });
        if (!run)
            throw new common_1.NotFoundException('AI run not found');
        const decisionIds = run.decisions.map((decision) => decision.id);
        const approvals = decisionIds.length === 0
            ? []
            : await this.prisma.approval.findMany({
                where: { sourceRef: { in: decisionIds } },
                select: { id: true, sourceRef: true, status: true },
            });
        const approvalByDecision = new Map(approvals.map((approval) => [approval.sourceRef, approval]));
        return {
            ...run,
            decisions: run.decisions.map((decision) => ({
                ...decision,
                approvalId: approvalByDecision.get(decision.id)?.id,
                approvalStatus: approvalByDecision.get(decision.id)?.status,
            })),
        };
    }
    async executeReadTool(tool, ticketId) {
        switch (tool) {
            case 'insights': return this.insights.insights();
            case 'pricing_review': return this.pricing.review();
            case 'reorder_review': return this.reorder.review();
            case 'risk_signals': return this.reports.risks();
            case 'support_triage': return this.supportTriage(ticketId);
        }
    }
    async supportTriage(ticketId) {
        if (!ticketId?.trim())
            throw new Error('support_triage_requires_ticket_id');
        const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId.trim() } });
        if (!ticket)
            throw new common_1.NotFoundException('Support ticket not found');
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
};
exports.AiOrchestratorService = AiOrchestratorService;
exports.AiOrchestratorService = AiOrchestratorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        insights_service_1.InsightsService,
        pricing_service_1.PricingService,
        reorder_service_1.ReorderService,
        reports_service_1.ReportsService,
        approvals_service_1.ApprovalsService])
], AiOrchestratorService);
function envFlag(name) {
    const value = process.env[name]?.trim().toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
}
function assertGlobalReadRole(actor) {
    if (actor.typ !== 'staff' || (actor.role !== 'owner' && actor.role !== 'admin')) {
        throw new common_1.ForbiddenException('AI control plane доступен только owner/admin');
    }
}
function boundToolOutput(value) {
    if (Array.isArray(value))
        return value.slice(0, 50).map(boundToolOutput);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, boundToolOutput(item)]));
    }
    return value;
}
async function withTimeout(promise, timeoutMs) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('ai_tool_timeout')), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
function hash(value) {
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(value)).digest('hex');
}
function summarize(value) {
    if (Array.isArray(value))
        return `array:${value.length}`;
    if (value && typeof value === 'object')
        return `object:${Object.keys(value).slice(0, 12).join(',')}`;
    return typeof value;
}
//# sourceMappingURL=orchestrator.service.js.map
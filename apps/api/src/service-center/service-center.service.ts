import { Injectable, Optional } from '@nestjs/common';
import { PaymentMethod, Prisma, WarrantyStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { PrismaService } from '../prisma/prisma.service';
import { assertWarrantyTransition } from '../warranty/warranty-state';
import { AssignServiceTechnicianDto, CreatePaidRepairDto, CreateServiceWorkOrderDto, DiagnoseServiceWorkOrderDto, PayServiceWorkOrderDto } from './service-center.dto';
import {
  isServiceCommandUniqueViolation,
  replayServiceCommand,
  requiredServiceKey,
  serviceJson,
  ServiceCommandInput,
} from './service-command';
import { paymentAccountCode, postPaymentEntryOnTx } from '../finance/accounting-journal';
import { cumulativeTaxDelta, includedTax, outputTaxMetadata } from '../finance/sales-tax';

const ACTIVE_SERVICE_STATUSES: WarrantyStatus[] = ['created', 'received', 'diagnostics', 'waiting_supplier', 'approved', 'repairing', 'repaired', 'replaced'];
const PAID_REPAIR_SLA_MS = 3 * 24 * 60 * 60 * 1000;
const SERVICE_PAYMENT_METHODS = new Set<PaymentMethod>(['cash', 'card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank']);

@Injectable()
export class ServiceCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  async queue(actor: string) {
    const staff = await this.prisma.staffUser.findUnique({
      where: { id: actor },
      select: { active: true, role: true, point: true },
    });
    if (!staff?.active) throw new ValidationError('service_queue_staff_inactive', 'Сотрудник не найден или отключён');
    const localImeis = staff.role === 'service'
      ? (await this.prisma.deviceUnit.findMany({ where: { location: staff.point }, select: { imei: true } })).map((unit) => unit.imei)
      : [];
    const scope: Prisma.WarrantyCaseWhereInput = staff.role === 'technician'
      ? { workOrder: { technicianId: actor, point: staff.point } }
      : staff.role === 'service'
        ? {
            OR: [
              { workOrder: { point: staff.point } },
              { workOrder: null, imei: { in: localImeis } },
            ],
          }
        : {};
    const cases = await this.prisma.warrantyCase.findMany({
      where: scope,
      include: {
        workOrder: {
          include: {
            payments: { orderBy: { createdAt: 'asc' } },
            parts: {
              include: { product: { select: { id: true, sku: true, name: true, cost: true } } },
              orderBy: { reservedAt: 'asc' },
            },
          },
        },
      },
      orderBy: { sla: 'asc' },
      take: 100,
    });
    const units = await this.prisma.deviceUnit.findMany({
      where: { imei: { in: cases.map((item) => item.imei) } },
      include: { product: { select: { name: true } } },
    });
    const unitByImei = new Map(units.map((unit) => [unit.imei, unit]));
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: cases.map((item) => item.customerId) } },
      select: { id: true, name: true, phone: true },
    });
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const now = Date.now();
    return cases.map((warrantyCase) => {
      const terminal = ['closed', 'repaired', 'replaced', 'rejected'].includes(warrantyCase.status);
      const completedAt = warrantyCase.workOrder?.repairCompletedAt?.getTime();
      const remainingMs = warrantyCase.sla.getTime() - now;
      const slaState = completedAt
        ? (completedAt <= warrantyCase.sla.getTime() ? 'met' : 'missed')
        : terminal
          ? 'closed'
          : remainingMs < 0
            ? 'overdue'
            : remainingMs <= 6 * 60 * 60 * 1000 ? 'warning' : 'on_track';
      return {
        ...warrantyCase,
        slaState,
        productName: warrantyCase.deviceName ?? unitByImei.get(warrantyCase.imei)?.product.name ?? 'Устройство',
        customer: customerById.get(warrantyCase.customerId) ?? null,
      };
    });
  }

  mine(customerId: string) {
    return this.prisma.serviceWorkOrder.findMany({
      where: { warrantyCase: { customerId } },
      include: {
        warrantyCase: true,
        payments: { orderBy: { createdAt: 'asc' } },
        parts: {
          include: { product: { select: { id: true, sku: true, name: true } } },
          orderBy: { reservedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async paymentContext(id: string, actor: string) {
    const workOrder = await this.prisma.serviceWorkOrder.findUnique({
      where: { id },
      include: {
        warrantyCase: true,
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!workOrder) throw new ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
    if (workOrder.warrantyCase.serviceType !== 'paid') {
      throw new ConflictError('service_payment_not_required', 'Гарантийный ремонт не оплачивается на кассе');
    }
    const shift = await this.prisma.cashShift.findFirst({ where: { staffId: actor, closedAt: null } });
    if (!shift) throw new ConflictError('cash_shift_not_open', 'Сначала откройте кассовую смену');
    if (shift.point !== workOrder.point) throw new ConflictError('service_payment_wrong_point', 'Ремонт относится к другой точке');
    const customer = await this.prisma.customer.findUnique({
      where: { id: workOrder.warrantyCase.customerId },
      select: { id: true, name: true, phone: true },
    });
    const paidTotal = workOrder.payments.reduce((sum, payment) => sum + payment.amount, 0);
    return {
      id: workOrder.id,
      warrantyCaseId: workOrder.warrantyCaseId,
      diagnosticSummary: workOrder.diagnosticSummary,
      estimateAmount: workOrder.estimateAmount,
      estimateApprovedAt: workOrder.estimateApprovedAt,
      point: workOrder.point,
      warrantyCase: {
        id: workOrder.warrantyCase.id,
        imei: workOrder.warrantyCase.imei,
        customerId: workOrder.warrantyCase.customerId,
        status: workOrder.warrantyCase.status,
        serviceType: workOrder.warrantyCase.serviceType,
        deviceName: workOrder.warrantyCase.deviceName,
      },
      customer,
      paidTotal,
    };
  }

  async pay(id: string, dto: PayServiceWorkOrderDto, actor: string, rawKey?: string) {
    const key = requiredServiceKey(rawKey);
    const payments = dto.payments.map((payment) => ({ method: payment.method, amount: payment.amount }));
    const request: ServiceCommandInput = { workOrderId: id, payments };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replayServiceCommand(existing, 'pay', request);
    if (payments.some((payment) => !SERVICE_PAYMENT_METHODS.has(payment.method))) {
      throw new ValidationError('service_payment_method_unsupported', 'Этот способ оплаты недоступен для ремонта');
    }

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'service-payment:' + id}))::text AS locked`;
        const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (raced) return { result: replayServiceCommand(raced, 'pay', request), events: [] };
        const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id }, include: { warrantyCase: true } });
        if (!workOrder) throw new ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
        if (workOrder.warrantyCase.serviceType !== 'paid') {
          throw new ConflictError('service_payment_not_required', 'Гарантийный ремонт не оплачивается на кассе');
        }
        if (!workOrder.estimateApprovedAt || workOrder.warrantyCase.status !== 'approved' || !workOrder.estimateAmount || workOrder.estimateAmount < 1) {
          throw new ConflictError('service_estimate_not_payable', 'Сначала клиент должен подтвердить ненулевую смету');
        }
        const existingPaid = await tx.payment.aggregate({
          where: { serviceWorkOrderId: id },
          _sum: { amount: true },
        });
        if ((existingPaid._sum.amount ?? 0) > 0) {
          throw new ConflictError('service_payment_already_completed', 'Ремонт уже оплачен');
        }
        const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
        if (paidTotal !== workOrder.estimateAmount) {
          throw new ValidationError('service_payment_total_mismatch', 'Сумма оплат должна точно совпадать со сметой');
        }
        const shift = await tx.cashShift.findFirst({ where: { staffId: actor, closedAt: null } });
        if (!shift) throw new ConflictError('cash_shift_not_open', 'Сначала откройте кассовую смену');
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-close:' + shift.id}))::text AS locked`;
        await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${shift.id} FOR UPDATE`;
        const activeShift = await tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } });
        if (activeShift.closedAt) throw new ConflictError('cash_shift_closed', 'Кассовая смена уже закрыта');
        if (activeShift.point !== workOrder.point) throw new ConflictError('service_payment_wrong_point', 'Ремонт относится к другой точке');

        const createdPayments = [];
        const accountingEntries = [];
        const taxMetadata = outputTaxMetadata([workOrder]);
        let processedAmount = 0;
        for (const [index, payment] of payments.entries()) {
          const createdPayment = await tx.payment.create({
            data: {
              serviceWorkOrderId: id,
              amount: payment.amount,
              method: payment.method,
              status: 'received',
              shiftId: shift.id,
              txnId: `service:${key}:${index}`,
              accountCode: paymentAccountCode(payment.method),
              idempotencyKey: `service:${key}:${index}`,
              receivedBy: actor,
              point: workOrder.point,
            },
          });
          const accountingEntry = await postPaymentEntryOnTx(tx, {
            payment: createdPayment,
            idempotencyKey: `service:${key}:${index}`,
            point: workOrder.point,
            actor,
            tax: {
              ...taxMetadata,
              taxAmount: cumulativeTaxDelta(
                workOrder.taxAmount,
                workOrder.estimateAmount,
                processedAmount,
                payment.amount,
              ),
            },
          });
          processedAmount += payment.amount;
          createdPayments.push(await tx.payment.findUniqueOrThrow({ where: { id: createdPayment.id } }));
          accountingEntries.push(accountingEntry);
        }
        const updated = await tx.serviceWorkOrder.findUniqueOrThrow({
          where: { id },
          include: { warrantyCase: true, payments: { orderBy: { createdAt: 'asc' } } },
        });
        const result = { ...updated, paidTotal, shiftId: shift.id };
        await tx.serviceWorkOrderCommand.create({
          data: { idempotencyKey: key, workOrderId: id, action: 'pay', request: serviceJson(request), response: serviceJson(result) },
        });
        return {
          result,
          events: [
            ...createdPayments.map((payment) => ({
              type: EventType.PaymentReceived,
              actor,
              payload: { paymentId: payment.id, serviceWorkOrderId: id, shiftId: shift.id, amount: payment.amount, method: payment.method },
              refs: [payment.id, id, workOrder.warrantyCaseId, shift.id, workOrder.warrantyCase.customerId],
            })),
            ...accountingEntries.map((entry) => ({
              type: EventType.AccountingEntryPosted,
              actor,
              payload: { accountingEntryId: entry.id, sourceType: 'payment.receipt', sourceRef: entry.sourceRef },
              refs: [entry.id, entry.sourceRef, id, workOrder.warrantyCaseId],
            })),
            {
              type: EventType.ServicePaymentCompleted,
              actor,
              payload: { workOrderId: id, serviceCaseId: workOrder.warrantyCaseId, shiftId: shift.id, paidTotal },
              refs: [id, workOrder.warrantyCaseId, shift.id, workOrder.warrantyCase.customerId],
            },
          ],
        };
      });
    } catch (error) {
      if (isServiceCommandUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replayServiceCommand(command, 'pay', request);
      }
      throw error;
    }
  }

  async create(dto: CreateServiceWorkOrderDto, actor: string, rawKey?: string) {
    const key = requiredServiceKey(rawKey);
    const request: ServiceCommandInput = {
      warrantyCaseId: dto.warrantyCaseId,
      technicianId: dto.technicianId?.trim() || null,
    };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replayServiceCommand(existing, 'create', request);

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
        const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (raced) return { result: replayServiceCommand(raced, 'create', request), events: [] };
        const warrantyCase = await tx.warrantyCase.findUnique({
          where: { id: dto.warrantyCaseId },
          include: { workOrder: true },
        });
        if (!warrantyCase) throw new ValidationError('warranty_not_found', 'Гарантийное обращение не найдено');
        if (warrantyCase.workOrder) throw new ConflictError('service_work_order_exists', 'Заказ-наряд уже создан');
        if (!['created', 'received'].includes(warrantyCase.status)) {
          throw new ConflictError('service_intake_closed', 'Приём доступен только для нового обращения');
        }
        const point = await resolveStaffPoint(tx, actor);
        await assertActiveTechnician(tx, dto.technicianId, point);
        const workOrder = await tx.serviceWorkOrder.create({
          data: {
            warrantyCaseId: warrantyCase.id,
            technicianId: dto.technicianId?.trim() || null,
            createdBy: actor,
            point,
          },
        });
        if (warrantyCase.status === 'created') {
          assertWarrantyTransition(warrantyCase.status, 'received');
          await tx.warrantyCase.update({ where: { id: warrantyCase.id }, data: { status: 'received' } });
        }
        const result = await tx.serviceWorkOrder.findUniqueOrThrow({
          where: { id: workOrder.id },
          include: { warrantyCase: true, payments: true },
        });
        await tx.serviceWorkOrderCommand.create({
          data: { idempotencyKey: key, workOrderId: workOrder.id, action: 'create', request, response: serviceJson(result) },
        });
        return {
          result,
          events: [
            ...(warrantyCase.status === 'created' ? [{
              type: 'warranty.received', actor,
              payload: { warrantyId: warrantyCase.id, from: 'created', to: 'received' },
              refs: [warrantyCase.id, warrantyCase.imei],
            }] : []),
            {
              type: EventType.ServiceWorkOrderCreated, actor,
              payload: { workOrderId: workOrder.id, warrantyId: warrantyCase.id, technicianId: workOrder.technicianId },
              refs: [workOrder.id, warrantyCase.id, warrantyCase.imei],
            },
          ],
        };
      });
    } catch (error) {
      if (isServiceCommandUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replayServiceCommand(command, 'create', request);
      }
      throw error;
    }
  }

  async createPaidRepair(dto: CreatePaidRepairDto, actor: string, rawKey?: string) {
    const key = requiredServiceKey(rawKey);
    const request: ServiceCommandInput = {
      phone: dto.phone.trim(),
      customerName: dto.customerName.trim(),
      deviceName: dto.deviceName.trim(),
      serial: dto.serial.trim().toUpperCase(),
      problem: dto.problem.trim(),
      technicianId: dto.technicianId?.trim() || null,
    };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replayServiceCommand(existing, 'create_paid', request);

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'service-paid:' + request.serial}))::text AS locked`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'service-customer:' + request.phone}))::text AS locked`;
        const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (raced) return { result: replayServiceCommand(raced, 'create_paid', request), events: [] };
        const active = await tx.warrantyCase.findFirst({
          where: { imei: request.serial as string, serviceType: 'paid', status: { in: ACTIVE_SERVICE_STATUSES } },
        });
        if (active) throw new ConflictError('paid_repair_already_open', 'По устройству уже открыт платный ремонт');
        const point = await resolveStaffPoint(tx, actor);
        await assertActiveTechnician(tx, dto.technicianId, point);

        let customer = await tx.customer.findUnique({ where: { phone: request.phone as string } });
        if (!customer) {
          customer = await tx.customer.create({ data: { phone: request.phone as string, name: request.customerName as string } });
        } else if (!customer.name.trim()) {
          customer = await tx.customer.update({ where: { id: customer.id }, data: { name: request.customerName as string } });
        }
        const warrantyCase = await tx.warrantyCase.create({
          data: {
            imei: request.serial as string,
            customerId: customer.id,
            problem: request.problem as string,
            status: 'received',
            serviceType: 'paid',
            deviceName: request.deviceName as string,
            sla: new Date(Date.now() + PAID_REPAIR_SLA_MS),
            assignee: dto.technicianId?.trim() || null,
          },
        });
        const workOrder = await tx.serviceWorkOrder.create({
          data: {
            warrantyCaseId: warrantyCase.id,
            technicianId: dto.technicianId?.trim() || null,
            createdBy: actor,
            point,
          },
        });
        const result = await tx.serviceWorkOrder.findUniqueOrThrow({
          where: { id: workOrder.id },
          include: { warrantyCase: true, payments: true },
        });
        await tx.serviceWorkOrderCommand.create({
          data: { idempotencyKey: key, workOrderId: workOrder.id, action: 'create_paid', request, response: serviceJson(result) },
        });
        return {
          result,
          events: [
            {
              type: EventType.ServicePaidRepairReceived,
              actor,
              payload: {
                workOrderId: workOrder.id,
                serviceCaseId: warrantyCase.id,
                customerId: customer.id,
                deviceName: warrantyCase.deviceName,
                serial: warrantyCase.imei,
                technicianId: workOrder.technicianId,
              },
              refs: [workOrder.id, warrantyCase.id, customer.id, warrantyCase.imei],
            },
            {
              type: EventType.ServiceWorkOrderCreated,
              actor,
              payload: { workOrderId: workOrder.id, warrantyId: warrantyCase.id, serviceType: 'paid' },
              refs: [workOrder.id, warrantyCase.id, customer.id, warrantyCase.imei],
            },
          ],
        };
      });
    } catch (error) {
      if (isServiceCommandUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replayServiceCommand(command, 'create_paid', request);
      }
      throw error;
    }
  }

  async diagnose(id: string, dto: DiagnoseServiceWorkOrderDto, actor: string, rawKey?: string) {
    const key = requiredServiceKey(rawKey);
    if (dto.diagnosticFee !== undefined && dto.diagnosticFee > dto.estimateAmount) {
      throw new ValidationError('invalid_service_estimate', 'Диагностика не может быть дороже полной сметы');
    }
    const request: ServiceCommandInput = {
      workOrderId: id,
      summary: dto.summary.trim(),
      estimateAmount: dto.estimateAmount,
      diagnosticFee: dto.diagnosticFee ?? 0,
    };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replayServiceCommand(existing, 'diagnose', request);

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
        await lockServiceWorkOrder(tx, id);
        const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (raced) return { result: replayServiceCommand(raced, 'diagnose', request), events: [] };
        const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id }, include: { warrantyCase: true } });
        if (!workOrder) throw new ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
        await assertDiagnosisActor(tx, actor, workOrder.technicianId, workOrder.point);
        if (!['received', 'diagnostics'].includes(workOrder.warrantyCase.status)) {
          throw new ConflictError('service_diagnostics_closed', 'Диагностика недоступна в текущем статусе');
        }
        const moved = workOrder.warrantyCase.status === 'received';
        const taxAmount = includedTax(dto.estimateAmount, workOrder.taxRateBps);
        if (moved) {
          assertWarrantyTransition(workOrder.warrantyCase.status, 'diagnostics');
          await tx.warrantyCase.update({ where: { id: workOrder.warrantyCaseId }, data: { status: 'diagnostics' } });
        }
        const updated = await tx.serviceWorkOrder.update({
          where: { id },
          data: {
            diagnosticSummary: dto.summary.trim(),
            diagnosticFee: dto.diagnosticFee ?? 0,
            estimateAmount: dto.estimateAmount,
            taxBaseAmount: dto.estimateAmount - taxAmount,
            taxAmount,
            estimatePreparedAt: new Date(),
            estimateApprovedAt: null,
            estimateApprovedBy: null,
          },
          include: { warrantyCase: true, payments: true },
        });
        await tx.serviceWorkOrderCommand.create({
          data: { idempotencyKey: key, workOrderId: id, action: 'diagnose', request, response: serviceJson(updated) },
        });
        if (this.outbox) {
          await enqueueConsentedCustomerNotice(tx, this.outbox, {
            customerId: workOrder.warrantyCase.customerId,
            template: 'service_estimate_ready',
            payload: { workOrderId: id, warrantyId: workOrder.warrantyCaseId, imei: workOrder.warrantyCase.imei, estimateAmount: dto.estimateAmount },
            transactional: true,
          });
        }
        return {
          result: updated,
          events: [
            ...(moved && workOrder.warrantyCase.serviceType === 'warranty' ? [{
              type: 'warranty.diagnostics', actor,
              payload: { warrantyId: workOrder.warrantyCaseId, from: 'received', to: 'diagnostics' },
              refs: [workOrder.warrantyCaseId, workOrder.warrantyCase.imei],
            }] : []),
            {
              type: EventType.ServiceDiagnosticsCompleted, actor,
              payload: { workOrderId: id, serviceType: workOrder.warrantyCase.serviceType, estimateAmount: dto.estimateAmount, diagnosticFee: dto.diagnosticFee ?? 0 },
              refs: [id, workOrder.warrantyCaseId, workOrder.warrantyCase.imei],
            },
          ],
        };
      });
    } catch (error) {
      if (isServiceCommandUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replayServiceCommand(command, 'diagnose', request);
      }
      throw error;
    }
  }

  async approveEstimate(id: string, customerId: string, rawKey?: string) {
    const key = requiredServiceKey(rawKey);
    const request: ServiceCommandInput = { workOrderId: id, customerId };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replayServiceCommand(existing, 'approve_estimate', request);

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
        await lockServiceWorkOrder(tx, id);
        const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (raced) return { result: replayServiceCommand(raced, 'approve_estimate', request), events: [] };
        const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id }, include: { warrantyCase: true } });
        if (!workOrder) throw new ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
        if (workOrder.warrantyCase.customerId !== customerId) {
          throw new ValidationError('service_work_order_not_owned', 'Заказ-наряд принадлежит другому клиенту');
        }
        if (!workOrder.estimatePreparedAt || workOrder.estimateAmount === null) {
          throw new ConflictError('service_estimate_missing', 'Смета ещё не подготовлена');
        }
        if (workOrder.warrantyCase.status !== 'diagnostics') {
          throw new ConflictError('service_estimate_closed', 'Смету нельзя подтвердить в текущем статусе');
        }
        assertWarrantyTransition(workOrder.warrantyCase.status, 'approved');
        await tx.warrantyCase.update({ where: { id: workOrder.warrantyCaseId }, data: { status: 'approved' } });
        const approvedAt = new Date();
        const updated = await tx.serviceWorkOrder.update({
          where: { id },
          data: { estimateApprovedAt: approvedAt, estimateApprovedBy: customerId },
          include: { warrantyCase: true, payments: true },
        });
        await tx.serviceWorkOrderCommand.create({
          data: { idempotencyKey: key, workOrderId: id, action: 'approve_estimate', request, response: serviceJson(updated) },
        });
        return {
          result: updated,
          events: [
            {
              type: EventType.ServiceEstimateApproved, actor: customerId,
              payload: { workOrderId: id, warrantyId: workOrder.warrantyCaseId, serviceType: workOrder.warrantyCase.serviceType, estimateAmount: workOrder.estimateAmount },
              refs: [id, workOrder.warrantyCaseId, workOrder.warrantyCase.imei],
            },
            ...(workOrder.warrantyCase.serviceType === 'warranty' ? [{
              type: 'warranty.approved', actor: customerId,
              payload: { warrantyId: workOrder.warrantyCaseId, from: 'diagnostics', to: 'approved', source: 'customer_estimate' },
              refs: [workOrder.warrantyCaseId, workOrder.warrantyCase.imei],
            }] : []),
          ],
        };
      });
    } catch (error) {
      if (isServiceCommandUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replayServiceCommand(command, 'approve_estimate', request);
      }
      throw error;
    }
  }

  async assign(id: string, dto: AssignServiceTechnicianDto, actor: string, rawKey?: string) {
    const key = requiredServiceKey(rawKey);
    const request: ServiceCommandInput = { workOrderId: id, technicianId: dto.technicianId.trim() };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replayServiceCommand(existing, 'assign_technician', request);

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
        await lockServiceWorkOrder(tx, id);
        const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (raced) return { result: replayServiceCommand(raced, 'assign_technician', request), events: [] };
        const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id }, include: { warrantyCase: true } });
        if (!workOrder) throw new ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
        await assertAssignmentActor(tx, actor, workOrder.point);
        if (['repairing', 'repaired', 'replaced', 'closed', 'rejected'].includes(workOrder.warrantyCase.status)) {
          throw new ConflictError('service_assignment_closed', 'Мастера нельзя менять после начала или закрытия ремонта');
        }
        await assertActiveTechnician(tx, dto.technicianId, workOrder.point, true);
        const updated = await tx.serviceWorkOrder.update({
          where: { id },
          data: { technicianId: dto.technicianId.trim(), warrantyCase: { update: { assignee: dto.technicianId.trim() } } },
          include: { warrantyCase: true, payments: true, parts: { include: { product: true }, orderBy: { reservedAt: 'asc' } } },
        });
        await tx.serviceWorkOrderCommand.create({
          data: { idempotencyKey: key, workOrderId: id, action: 'assign_technician', request, response: serviceJson(updated) },
        });
        return {
          result: updated,
          events: [{
            type: EventType.ServiceTechnicianAssigned,
            actor,
            payload: { workOrderId: id, from: workOrder.technicianId, to: updated.technicianId, point: workOrder.point },
            refs: [id, workOrder.warrantyCaseId, updated.technicianId!],
          }],
        };
      });
    } catch (error) {
      if (isServiceCommandUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replayServiceCommand(command, 'assign_technician', request);
      }
      throw error;
    }
  }
}

async function assertActiveTechnician(tx: Prisma.TransactionClient, technicianId: string | undefined, point: string, required = false) {
  const id = technicianId?.trim();
  if (!id) {
    if (required) throw new ValidationError('service_technician_required', 'Выберите мастера');
    return;
  }
  const technician = await tx.staffUser.findUnique({ where: { id }, select: { active: true, role: true, point: true } });
  if (!technician?.active || !['service', 'technician', 'admin', 'owner'].includes(technician.role) || technician.point !== point) {
    throw new ValidationError('service_technician_ineligible', 'Мастер неактивен, не имеет сервисной роли или относится к другой точке');
  }
}

async function resolveStaffPoint(tx: Prisma.TransactionClient, actor: string) {
  const activeShift = await tx.cashShift.findFirst({
    where: { staffId: actor, closedAt: null },
    orderBy: { openedAt: 'desc' },
    select: { point: true },
  });
  if (activeShift) return activeShift.point;
  const staff = await tx.staffUser.findUnique({ where: { id: actor }, select: { active: true, point: true } });
  if (!staff?.active) throw new ValidationError('service_intake_staff_inactive', 'Сотрудник не найден или отключён');
  return staff.point;
}

async function assertDiagnosisActor(tx: Prisma.TransactionClient, actor: string, technicianId: string | null, point: string) {
  const staff = await tx.staffUser.findUnique({ where: { id: actor }, select: { active: true, role: true, point: true } });
  if (!staff?.active) throw new ValidationError('service_diagnosis_staff_inactive', 'Сотрудник не найден или отключён');
  if (staff.role === 'admin' || staff.role === 'owner') return;
  const allowed = staff.point === point && (staff.role === 'service' || (staff.role === 'technician' && actor === technicianId));
  if (!allowed) throw new ConflictError('service_diagnosis_forbidden', 'Диагностика доступна назначенному мастеру этой точки');
}

async function assertAssignmentActor(tx: Prisma.TransactionClient, actor: string, point: string) {
  const staff = await tx.staffUser.findUnique({ where: { id: actor }, select: { active: true, role: true, point: true } });
  if (!staff?.active) throw new ValidationError('service_assignment_staff_inactive', 'Сотрудник не найден или отключён');
  if (staff.role === 'admin' || staff.role === 'owner') return;
  if (staff.role !== 'service' || staff.point !== point) {
    throw new ConflictError('service_assignment_forbidden', 'Назначение мастера доступно сервис-менеджеру этой точки');
  }
}

async function lockServiceWorkOrder(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "ServiceWorkOrder" WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw new ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
}

import { Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma, WarrantyStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { assertWarrantyTransition } from '../warranty/warranty-state';
import { CreatePaidRepairDto, CreateServiceWorkOrderDto, DiagnoseServiceWorkOrderDto, PayServiceWorkOrderDto } from './service-center.dto';

type CommandInput = Prisma.InputJsonObject;
const ACTIVE_SERVICE_STATUSES: WarrantyStatus[] = ['created', 'received', 'diagnostics', 'waiting_supplier', 'approved'];
const PAID_REPAIR_SLA_MS = 3 * 24 * 60 * 60 * 1000;
const SERVICE_PAYMENT_METHODS = new Set<PaymentMethod>(['cash', 'card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank']);

@Injectable()
export class ServiceCenterService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async queue() {
    const cases = await this.prisma.warrantyCase.findMany({
      include: { workOrder: { include: { payments: { orderBy: { createdAt: 'asc' } } } } },
      orderBy: { sla: 'asc' },
      take: 100,
    });
    const [units, customers] = await Promise.all([
      this.prisma.deviceUnit.findMany({
        where: { imei: { in: cases.map((item) => item.imei) } },
        include: { product: { select: { name: true } } },
      }),
      this.prisma.customer.findMany({
        where: { id: { in: cases.map((item) => item.customerId) } },
        select: { id: true, name: true, phone: true },
      }),
    ]);
    const unitByImei = new Map(units.map((unit) => [unit.imei, unit]));
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    return cases.map((warrantyCase) => ({
      ...warrantyCase,
      productName: warrantyCase.deviceName ?? unitByImei.get(warrantyCase.imei)?.product.name ?? 'Устройство',
      customer: customerById.get(warrantyCase.customerId) ?? null,
    }));
  }

  mine(customerId: string) {
    return this.prisma.serviceWorkOrder.findMany({
      where: { warrantyCase: { customerId } },
      include: { warrantyCase: true, payments: { orderBy: { createdAt: 'asc' } } },
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
    const key = requiredKey(rawKey);
    const payments = dto.payments.map((payment) => ({ method: payment.method, amount: payment.amount }));
    const request: CommandInput = { workOrderId: id, payments };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replay(existing, 'pay', request);
    if (payments.some((payment) => !SERVICE_PAYMENT_METHODS.has(payment.method))) {
      throw new ValidationError('service_payment_method_unsupported', 'Этот способ оплаты недоступен для ремонта');
    }

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'service-payment:' + id}))::text AS locked`;
        const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (raced) return { result: replay(raced, 'pay', request), events: [] };
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
        for (const [index, payment] of payments.entries()) {
          createdPayments.push(await tx.payment.create({
            data: {
            serviceWorkOrderId: id,
            amount: payment.amount,
            method: payment.method,
            status: 'received',
            shiftId: shift.id,
            txnId: `service:${key}:${index}`,
            },
          }));
        }
        const updated = await tx.serviceWorkOrder.findUniqueOrThrow({
          where: { id },
          include: { warrantyCase: true, payments: { orderBy: { createdAt: 'asc' } } },
        });
        const result = { ...updated, paidTotal, shiftId: shift.id };
        await tx.serviceWorkOrderCommand.create({
          data: { idempotencyKey: key, workOrderId: id, action: 'pay', request: json(request), response: json(result) },
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
      if (isUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replay(command, 'pay', request);
      }
      throw error;
    }
  }

  async create(dto: CreateServiceWorkOrderDto, actor: string, rawKey?: string) {
    const key = requiredKey(rawKey);
    const request: CommandInput = {
      warrantyCaseId: dto.warrantyCaseId,
      technicianId: dto.technicianId?.trim() || null,
    };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replay(existing, 'create', request);

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
        const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (raced) return { result: replay(raced, 'create', request), events: [] };
        const warrantyCase = await tx.warrantyCase.findUnique({
          where: { id: dto.warrantyCaseId },
          include: { workOrder: true },
        });
        if (!warrantyCase) throw new ValidationError('warranty_not_found', 'Гарантийное обращение не найдено');
        if (warrantyCase.workOrder) throw new ConflictError('service_work_order_exists', 'Заказ-наряд уже создан');
        if (!['created', 'received'].includes(warrantyCase.status)) {
          throw new ConflictError('service_intake_closed', 'Приём доступен только для нового обращения');
        }
        await assertActiveTechnician(tx, dto.technicianId);
        const point = await resolveStaffPoint(tx, actor);
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
          data: { idempotencyKey: key, workOrderId: workOrder.id, action: 'create', request, response: json(result) },
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
      if (isUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replay(command, 'create', request);
      }
      throw error;
    }
  }

  async createPaidRepair(dto: CreatePaidRepairDto, actor: string, rawKey?: string) {
    const key = requiredKey(rawKey);
    const request: CommandInput = {
      phone: dto.phone.trim(),
      customerName: dto.customerName.trim(),
      deviceName: dto.deviceName.trim(),
      serial: dto.serial.trim().toUpperCase(),
      problem: dto.problem.trim(),
      technicianId: dto.technicianId?.trim() || null,
    };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replay(existing, 'create_paid', request);

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'service-paid:' + request.serial}))::text AS locked`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'service-customer:' + request.phone}))::text AS locked`;
        const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (raced) return { result: replay(raced, 'create_paid', request), events: [] };
        const active = await tx.warrantyCase.findFirst({
          where: { imei: request.serial as string, serviceType: 'paid', status: { in: ACTIVE_SERVICE_STATUSES } },
        });
        if (active) throw new ConflictError('paid_repair_already_open', 'По устройству уже открыт платный ремонт');
        await assertActiveTechnician(tx, dto.technicianId);
        const point = await resolveStaffPoint(tx, actor);

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
          data: { idempotencyKey: key, workOrderId: workOrder.id, action: 'create_paid', request, response: json(result) },
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
      if (isUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replay(command, 'create_paid', request);
      }
      throw error;
    }
  }

  async diagnose(id: string, dto: DiagnoseServiceWorkOrderDto, actor: string, rawKey?: string) {
    const key = requiredKey(rawKey);
    if (dto.diagnosticFee !== undefined && dto.diagnosticFee > dto.estimateAmount) {
      throw new ValidationError('invalid_service_estimate', 'Диагностика не может быть дороже полной сметы');
    }
    const request: CommandInput = {
      workOrderId: id,
      summary: dto.summary.trim(),
      estimateAmount: dto.estimateAmount,
      diagnosticFee: dto.diagnosticFee ?? 0,
    };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replay(existing, 'diagnose', request);

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
      const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
      if (raced) return { result: replay(raced, 'diagnose', request), events: [] };
      const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id }, include: { warrantyCase: true } });
      if (!workOrder) throw new ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
      if (!['received', 'diagnostics'].includes(workOrder.warrantyCase.status)) {
        throw new ConflictError('service_diagnostics_closed', 'Диагностика недоступна в текущем статусе');
      }
      const moved = workOrder.warrantyCase.status === 'received';
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
          estimatePreparedAt: new Date(),
          estimateApprovedAt: null,
          estimateApprovedBy: null,
        },
        include: { warrantyCase: true, payments: true },
      });
      await tx.serviceWorkOrderCommand.create({
        data: { idempotencyKey: key, workOrderId: id, action: 'diagnose', request, response: json(updated) },
      });
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
      if (isUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replay(command, 'diagnose', request);
      }
      throw error;
    }
  }

  async approveEstimate(id: string, customerId: string, rawKey?: string) {
    const key = requiredKey(rawKey);
    const request: CommandInput = { workOrderId: id, customerId };
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replay(existing, 'approve_estimate', request);

    try {
      return await this.audit.transaction<unknown>(async (tx) => {
      const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
      if (raced) return { result: replay(raced, 'approve_estimate', request), events: [] };
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
        data: { idempotencyKey: key, workOrderId: id, action: 'approve_estimate', request, response: json(updated) },
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
      if (isUniqueViolation(error)) {
        const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (command) return replay(command, 'approve_estimate', request);
      }
      throw error;
    }
  }
}

function requiredKey(value?: string) {
  const key = value?.trim();
  if (!key || key.length > 128) throw new ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
  return key;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function replay(command: { action: string; request: Prisma.JsonValue; response: Prisma.JsonValue }, action: string, request: CommandInput) {
  if (command.action !== action || canonical(command.request) !== canonical(request)) {
    throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой service-командой');
  }
  return command.response;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function assertActiveTechnician(tx: Prisma.TransactionClient, technicianId?: string) {
  const id = technicianId?.trim();
  if (!id) return;
  const technician = await tx.staffUser.findUnique({ where: { id }, select: { active: true } });
  if (!technician?.active) {
    throw new ValidationError('service_technician_inactive', 'Мастер не найден или отключён');
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

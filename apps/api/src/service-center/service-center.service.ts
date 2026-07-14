import { Injectable } from '@nestjs/common';
import { Prisma, WarrantyStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { assertWarrantyTransition } from '../warranty/warranty-state';
import { CreatePaidRepairDto, CreateServiceWorkOrderDto, DiagnoseServiceWorkOrderDto } from './service-center.dto';

type CommandInput = Record<string, string | number | null>;
const ACTIVE_SERVICE_STATUSES: WarrantyStatus[] = ['created', 'received', 'diagnostics', 'waiting_supplier', 'approved'];
const PAID_REPAIR_SLA_MS = 3 * 24 * 60 * 60 * 1000;

@Injectable()
export class ServiceCenterService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async queue() {
    const cases = await this.prisma.warrantyCase.findMany({
      include: { workOrder: true },
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
      include: { warrantyCase: true },
      orderBy: { createdAt: 'desc' },
    });
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
        const workOrder = await tx.serviceWorkOrder.create({
          data: {
            warrantyCaseId: warrantyCase.id,
            technicianId: dto.technicianId?.trim() || null,
            createdBy: actor,
          },
        });
        if (warrantyCase.status === 'created') {
          assertWarrantyTransition(warrantyCase.status, 'received');
          await tx.warrantyCase.update({ where: { id: warrantyCase.id }, data: { status: 'received' } });
        }
        const result = await tx.serviceWorkOrder.findUniqueOrThrow({
          where: { id: workOrder.id },
          include: { warrantyCase: true },
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
          },
        });
        const result = await tx.serviceWorkOrder.findUniqueOrThrow({
          where: { id: workOrder.id },
          include: { warrantyCase: true },
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
        include: { warrantyCase: true },
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
        include: { warrantyCase: true },
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

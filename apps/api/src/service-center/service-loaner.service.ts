import { Injectable, Optional } from '@nestjs/common';
import { LoanerLoanStatus, Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { PrismaService } from '../prisma/prisma.service';
import { postAccountingEntryOnTx } from '../finance/accounting-journal';
import { recordCashDrawerMovementOnTx } from '../shifts/cash-drawer';
import { PrepareLoanerLoanDto, RegisterLoanerDeviceDto, ReturnLoanerLoanDto } from './service-center.dto';
import { isServiceCommandUniqueViolation, replayServiceCommand, requiredServiceKey, serviceJson, ServiceCommandInput } from './service-command';

const ACTIVE_LOAN_STATUSES: LoanerLoanStatus[] = ['prepared', 'issued', 'overdue'];
const MANAGER_ROLES = new Set<Role>(['admin', 'owner']);
const loanInclude = {
  device: { include: { unit: { include: { product: { select: { id: true, name: true, sku: true } } } } } },
  workOrder: { include: { warrantyCase: true } },
} satisfies Prisma.LoanerLoanInclude;

@Injectable()
export class ServiceLoanerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  async list(actor: string) {
    const staff = await this.activeStaff(this.prisma, actor);
    const where: Prisma.LoanerDeviceWhereInput = MANAGER_ROLES.has(staff.role)
      ? { active: true }
      : { active: true, unit: { location: staff.point } };
    return this.prisma.loanerDevice.findMany({
      where,
      include: {
        unit: { include: { product: { select: { id: true, name: true, sku: true } } } },
        loans: { where: { status: { in: [...ACTIVE_LOAN_STATUSES, 'disputed'] } }, include: { workOrder: { include: { warrantyCase: true } } }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  mine(customerId: string) {
    return this.prisma.loanerLoan.findMany({ where: { customerId }, include: loanInclude, orderBy: { createdAt: 'desc' } });
  }

  async register(dto: RegisterLoanerDeviceDto, actor: string, rawKey?: string) {
    const key = requiredServiceKey(rawKey);
    const imei = dto.imei.trim().toUpperCase();
    const condition = dto.condition.trim();
    const existing = await this.prisma.loanerDevice.findUnique({ where: { registrationIdempotencyKey: key }, include: { unit: true } });
    if (existing) {
      if (existing.unit.imei !== imei || existing.condition !== condition) throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой регистрацией');
      await this.assertRegistrationAccess(this.prisma, actor, existing.unit.location);
      return existing;
    }
    try {
      return await this.audit.transaction(async (tx) => {
        const staff = await this.activeStaff(tx, actor);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'loaner-register:' + imei}))::text AS locked`;
        const replay = await tx.loanerDevice.findUnique({ where: { registrationIdempotencyKey: key }, include: { unit: true } });
        if (replay) {
          this.assertRegistrationReplay(replay, imei, condition);
          this.assertRegistrationStaffAccess(staff, replay.unit.location);
          return { result: replay, events: [] };
        }
        const unit = await tx.deviceUnit.findUnique({ where: { imei } });
        if (!unit) throw new ValidationError('loaner_unit_not_found', 'IMEI не найден на складе');
        if (unit.status !== 'in_stock') throw new ConflictError('loaner_unit_unavailable', 'В подменный фонд можно добавить только свободное устройство');
        if (!MANAGER_ROLES.has(staff.role) && unit.location !== staff.point) throw new ConflictError('loaner_point_forbidden', 'Устройство относится к другой точке');
        // Здесь был безусловный `update` после чтения: классический lost update
        // под Read Committed. Advisory-lock взят по ключу `loaner-register:*`,
        // которого не берёт больше никто, поэтому параллельный резерв заказа
        // (`units.reserveOnTx`) проскакивал между проверкой и записью —
        // регистрация затирала свежий резерв клиента. Дальше клиент не мог
        // оплатить (`order_reservation_incomplete`), а `releaseOnTx` молчал:
        // он условен по `reserved`, поэтому события `stock.released` не было, и
        // резерв исчезал из леджера бесследно.
        const claimed = await tx.deviceUnit.updateMany({
          where: { id: unit.id, status: 'in_stock' },
          data: { status: 'loaner_available' },
        });
        if (claimed.count !== 1) {
          throw new ConflictError('loaner_unit_unavailable', 'Устройство перестало быть свободным — регистрация отменена');
        }
        const result = await tx.loanerDevice.create({ data: { unitId: unit.id, condition, registeredBy: actor, registrationIdempotencyKey: key }, include: { unit: true } });
        return { result, events: [{ type: EventType.ServiceLoanerRegistered, actor, payload: { loanerDeviceId: result.id, imei, location: unit.location, condition }, refs: [result.id, unit.id, imei] }] };
      });
    } catch (error) {
      if (isServiceCommandUniqueViolation(error)) {
        const replay = await this.prisma.loanerDevice.findUnique({ where: { registrationIdempotencyKey: key }, include: { unit: true } });
        if (replay) {
          this.assertRegistrationReplay(replay, imei, condition);
          await this.assertRegistrationAccess(this.prisma, actor, replay.unit.location);
          return replay;
        }
      }
      throw error;
    }
  }

  async prepare(workOrderId: string, dto: PrepareLoanerLoanDto, actor: string, rawKey?: string) {
    const key = requiredServiceKey(rawKey);
    const request: ServiceCommandInput = { workOrderId, loanerDeviceId: dto.loanerDeviceId, dueAt: dto.dueAt, issueCondition: dto.issueCondition.trim(), depositAmount: dto.depositAmount ?? 0, agreementRef: dto.agreementRef?.trim() ?? null };
    return this.command(workOrderId, key, 'prepare_loaner', request, actor, async (tx) => {
      await this.lockWorkOrder(tx, workOrderId);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'loaner-device:' + dto.loanerDeviceId}))::text AS locked`;
      const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id: workOrderId }, include: { warrantyCase: true } });
      if (!workOrder) throw new ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
      await this.assertPointAccess(tx, actor, workOrder.point);
      if (['closed', 'rejected'].includes(workOrder.warrantyCase.status)) throw new ConflictError('loaner_work_order_closed', 'Ремонт уже закрыт');
      const dueAt = new Date(dto.dueAt);
      if (dueAt.getTime() <= Date.now()) throw new ValidationError('loaner_due_at_invalid', 'Срок возврата должен быть в будущем');
      const device = await tx.loanerDevice.findUnique({ where: { id: dto.loanerDeviceId }, include: { unit: true } });
      if (!device?.active || device.unit.status !== 'loaner_available') throw new ConflictError('loaner_device_unavailable', 'Подменное устройство недоступно');
      if (device.unit.location !== workOrder.point) throw new ConflictError('loaner_point_mismatch', 'Устройство и ремонт должны быть на одной точке');
      const active = await tx.loanerLoan.findFirst({ where: { OR: [{ deviceId: device.id }, { workOrderId }], status: { in: ACTIVE_LOAN_STATUSES } } });
      if (active) throw new ConflictError('loaner_active_loan_exists', 'Устройство или ремонт уже имеют активную выдачу');
      const loan = await tx.loanerLoan.create({ data: { deviceId: device.id, workOrderId, customerId: workOrder.warrantyCase.customerId, dueAt, issueCondition: dto.issueCondition.trim(), depositAmount: dto.depositAmount ?? 0, agreementRef: dto.agreementRef?.trim() || null, preparedBy: actor }, include: loanInclude });
      // Залог принимается наличными и не проводился нигде: `depositAmount` жил
      // только в строке выдачи. Деньги ложились в ящик, ожидаемый остаток о них
      // не знал, и вечером кассир получал излишек ровно на сумму принятых
      // залогов — а при возврате аппарата ту же сумму как недостачу.
      if (loan.depositAmount > 0) {
        const entry = await postAccountingEntryOnTx(tx, {
          idempotencyKey: `accounting:loaner.deposit:${loan.id}`,
          sourceType: 'loaner.deposit',
          sourceRef: loan.id,
          description: `Залог за подменное устройство по ремонту ${workOrderId}`,
          documentAmount: loan.depositAmount,
          baseAmount: loan.depositAmount,
          point: workOrder.point,
          occurredAt: new Date(),
          createdBy: actor,
          lines: [
            { accountCode: '1000', debit: loan.depositAmount, credit: 0, memo: 'Получен залог за подменное устройство' },
            { accountCode: '2400', debit: 0, credit: loan.depositAmount, memo: 'Обязательство по залогу' },
          ],
        });
        await recordCashDrawerMovementOnTx(tx, {
          idempotencyKey: `drawer:loaner.deposit:${loan.id}`,
          staffId: actor,
          amount: loan.depositAmount,
          kind: 'loaner_deposit',
          sourceType: 'loaner.deposit',
          sourceRef: loan.id,
          reason: 'Залог за подменное устройство',
          createdBy: actor,
          accountingEntryId: entry.id,
        });
      }
      return { result: loan, event: { type: EventType.ServiceLoanerPrepared, actor, payload: { loanId: loan.id, workOrderId, deviceId: device.id, dueAt: dueAt.toISOString(), depositAmount: loan.depositAmount }, refs: [loan.id, device.id, workOrderId, workOrder.warrantyCaseId, workOrder.warrantyCase.customerId] } };
    });
  }

  issue(loanId: string, actor: string, rawKey?: string) {
    return this.loanCommand(loanId, actor, rawKey, 'issue_loaner', ['prepared'], async (tx, loan) => {
      await this.requireEvidence(tx, loan.id, 'loaner_issue');
      await tx.deviceUnit.update({ where: { id: loan.device.unitId }, data: { status: 'loaner_issued' } });
      const result = await tx.loanerLoan.update({ where: { id: loan.id }, data: { status: 'issued', issuedBy: actor, issuedAt: new Date() }, include: loanInclude });
      if (this.outbox) {
        await enqueueConsentedCustomerNotice(tx, this.outbox, {
          customerId: loan.customerId,
          template: 'service_loaner_issued',
          payload: { loanId, workOrderId: loan.workOrderId, dueAt: loan.dueAt.toISOString() },
          transactional: true,
        });
      }
      return { result, type: EventType.ServiceLoanerIssued, payload: { loanId, workOrderId: loan.workOrderId, deviceId: loan.deviceId, dueAt: loan.dueAt.toISOString() } };
    });
  }

  cancel(loanId: string, actor: string, rawKey?: string) {
    return this.loanCommand(loanId, actor, rawKey, 'cancel_loaner', ['prepared'], async (tx, loan) => {
      const result = await tx.loanerLoan.update({ where: { id: loan.id }, data: { status: 'cancelled', returnedBy: actor }, include: loanInclude });
      return { result, type: EventType.ServiceLoanerCancelled, payload: { loanId, workOrderId: loan.workOrderId, deviceId: loan.deviceId } };
    });
  }

  returnLoan(loanId: string, dto: ReturnLoanerLoanDto, actor: string, rawKey?: string) {
    return this.loanCommand(loanId, actor, rawKey, 'return_loaner', ['issued', 'overdue'], async (tx, loan) => {
      await this.requireEvidence(tx, loan.id, 'loaner_return');
      const disputed = Boolean(dto.damageNote?.trim());
      await tx.deviceUnit.update({ where: { id: loan.device.unitId }, data: { status: disputed ? 'in_repair' : 'loaner_available' } });
      const result = await tx.loanerLoan.update({ where: { id: loan.id }, data: { status: disputed ? 'disputed' : 'returned', returnCondition: dto.returnCondition.trim(), damageNote: dto.damageNote?.trim() || null, returnedBy: actor, returnedAt: new Date() }, include: loanInclude });
      // Залог возвращается вместе с аппаратом, если претензий нет. При споре
      // деньги остаются у магазина до решения — обязательство не гасится здесь.
      if (!disputed && result.depositAmount > 0) {
        const refundEntry = await postAccountingEntryOnTx(tx, {
          idempotencyKey: `accounting:loaner.deposit_refund:${loan.id}`,
          sourceType: 'loaner.deposit_refund',
          sourceRef: loan.id,
          description: `Возврат залога по ремонту ${loan.workOrderId}`,
          documentAmount: result.depositAmount,
          baseAmount: result.depositAmount,
          occurredAt: new Date(),
          createdBy: actor,
          lines: [
            { accountCode: '2400', debit: result.depositAmount, credit: 0, memo: 'Погашение обязательства по залогу' },
            { accountCode: '1000', debit: 0, credit: result.depositAmount, memo: 'Возврат залога клиенту' },
          ],
        });
        await recordCashDrawerMovementOnTx(tx, {
          idempotencyKey: `drawer:loaner.deposit_refund:${loan.id}`,
          staffId: actor,
          amount: -result.depositAmount,
          kind: 'loaner_deposit',
          sourceType: 'loaner.deposit_refund',
          sourceRef: loan.id,
          reason: 'Возврат залога клиенту',
          createdBy: actor,
          accountingEntryId: refundEntry.id,
        });
      }
      return { result, type: disputed ? EventType.ServiceLoanerDisputed : EventType.ServiceLoanerReturned, payload: { loanId, workOrderId: loan.workOrderId, deviceId: loan.deviceId, disputed, damageNote: result.damageNote } };
    }, { returnCondition: dto.returnCondition.trim(), damageNote: dto.damageNote?.trim() ?? null });
  }

  resolveDispute(loanId: string, disposition: 'available' | 'written_off', actor: string, rawKey?: string) {
    return this.loanCommand(loanId, actor, rawKey, 'resolve_loaner_dispute', ['disputed'], async (tx, loan) => {
      const writtenOff = disposition === 'written_off';
      if (writtenOff && (await this.activeStaff(tx, actor)).role !== 'owner') {
        throw new ForbiddenError('loaner_write_off_owner_required', 'Списание подменного IMEI подтверждает только владелец');
      }
      await tx.deviceUnit.update({ where: { id: loan.device.unitId }, data: { status: writtenOff ? 'written_off' : 'loaner_available' } });
      await tx.loanerDevice.update({ where: { id: loan.deviceId }, data: { active: !writtenOff } });
      const result = await tx.loanerLoan.update({ where: { id: loan.id }, data: { status: 'returned' }, include: loanInclude });
      return { result, type: EventType.ServiceLoanerDisputeResolved, payload: { loanId, workOrderId: loan.workOrderId, deviceId: loan.deviceId, disposition } };
    }, { disposition });
  }

  private async loanCommand(loanId: string, actor: string, rawKey: string | undefined, action: string, allowed: LoanerLoanStatus[], mutate: (tx: Prisma.TransactionClient, loan: Prisma.LoanerLoanGetPayload<{ include: typeof loanInclude }>) => Promise<{ result: unknown; type: string; payload: Record<string, unknown> }>, extra: ServiceCommandInput = {}) {
    const key = requiredServiceKey(rawKey);
    const initial = await this.prisma.loanerLoan.findUnique({ where: { id: loanId }, select: { workOrderId: true } });
    if (!initial) throw new ValidationError('loaner_loan_not_found', 'Выдача не найдена');
    const request: ServiceCommandInput = { loanId, ...extra };
    return this.command(initial.workOrderId, key, action, request, actor, async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'loaner-loan:' + loanId}))::text AS locked`;
      const loan = await tx.loanerLoan.findUnique({ where: { id: loanId }, include: loanInclude });
      if (!loan) throw new ValidationError('loaner_loan_not_found', 'Выдача не найдена');
      await this.assertPointAccess(tx, actor, loan.workOrder.point);
      if (!allowed.includes(loan.status)) throw new ConflictError('loaner_transition_closed', 'Действие недоступно в текущем статусе выдачи');
      const changed = await mutate(tx, loan);
      return { result: changed.result, event: { type: changed.type, actor, payload: changed.payload, refs: [loan.id, loan.deviceId, loan.workOrderId, loan.customerId, loan.device.unit.imei] } };
    });
  }

  private async command(workOrderId: string, key: string, action: string, request: ServiceCommandInput, actor: string, work: (tx: Prisma.TransactionClient) => Promise<{ result: unknown; event: { type: string; actor: string; payload: Record<string, unknown>; refs: string[] } }>) {
    await this.assertWorkOrderAccess(this.prisma, actor, workOrderId);
    const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return replayServiceCommand(existing, action, request);
    try {
      return await this.audit.transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'service-command:' + key}))::text AS locked`;
        const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (raced) return { result: replayServiceCommand(raced, action, request), events: [] };
        const changed = await work(tx);
        await tx.serviceWorkOrderCommand.create({ data: { idempotencyKey: key, workOrderId, action, request: serviceJson(request), response: serviceJson(changed.result) } });
        return { result: changed.result, events: [changed.event] };
      });
    } catch (error) {
      if (isServiceCommandUniqueViolation(error)) {
        const replay = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (replay) return replayServiceCommand(replay, action, request);
      }
      throw error;
    }
  }

  private async requireEvidence(tx: Prisma.TransactionClient, loanId: string, label: string) {
    const events = await tx.auditEvent.findMany({ where: { type: EventType.EvidenceAttached, refs: { has: loanId } }, select: { actor: true, payload: true }, take: 50 });
    const found = events.some((event) => {
      const payload = event.payload as Record<string, unknown>;
      return payload.entityType === 'loaner'
        && payload.entityId === loanId
        && payload.label === label
        && payload.trustedStaffEvidence === true
        && typeof event.actor === 'string'
        && event.actor.startsWith('staff:');
    });
    if (!found) throw new ConflictError('loaner_evidence_required', `Требуется фото: ${label}`);
  }

  private async lockWorkOrder(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "ServiceWorkOrder" WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0) throw new ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
  }

  private async activeStaff(tx: Prisma.TransactionClient | PrismaService, actor: string) {
    const staff = await tx.staffUser.findUnique({ where: { id: actor }, select: { active: true, role: true, point: true } });
    if (!staff?.active) throw new ValidationError('loaner_staff_inactive', 'Сотрудник не найден или отключён');
    return staff;
  }

  private async assertPointAccess(tx: Prisma.TransactionClient, actor: string, point: string) {
    const staff = await this.activeStaff(tx, actor);
    if (!MANAGER_ROLES.has(staff.role) && (staff.role !== 'service' || staff.point !== point)) throw new ConflictError('loaner_point_forbidden', 'Нет доступа к подменному фонду этой точки');
  }

  private async assertWorkOrderAccess(tx: Prisma.TransactionClient | PrismaService, actor: string, workOrderId: string) {
    const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id: workOrderId }, select: { point: true } });
    if (!workOrder) throw new ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
    const staff = await this.activeStaff(tx, actor);
    if (!MANAGER_ROLES.has(staff.role) && (staff.role !== 'service' || staff.point !== workOrder.point)) {
      throw new ConflictError('loaner_point_forbidden', 'Нет доступа к подменному фонду этой точки');
    }
  }

  private assertRegistrationReplay(existing: { condition: string; unit: { imei: string } }, imei: string, condition: string) {
    if (existing.unit.imei !== imei || existing.condition !== condition) {
      throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой регистрацией');
    }
  }

  private async assertRegistrationAccess(tx: Prisma.TransactionClient | PrismaService, actor: string, location: string) {
    this.assertRegistrationStaffAccess(await this.activeStaff(tx, actor), location);
  }

  private assertRegistrationStaffAccess(staff: { role: Role; point: string }, location: string) {
    if (!MANAGER_ROLES.has(staff.role) && staff.point !== location) {
      throw new ForbiddenError('loaner_point_forbidden', 'Нет доступа к подменному фонду этой точки');
    }
  }
}

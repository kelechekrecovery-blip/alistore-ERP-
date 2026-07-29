import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { HrService } from '../src/hr/hr.service';
import { SettingsService } from '../src/settings/settings.service';
import { DomainError } from '../src/common/errors';
import { randomUUID } from 'node:crypto';

/**
 * F-03: `POST /hr/payroll/runs` отвечал 500. Находка предполагала пустой
 * attendance или деление на ноль — оба уже обработаны (`hr_payroll_empty`,
 * `hr_payroll_zero`). Этот тест закрывает требование, которое от причины не
 * зависит: любой отказ начисления обязан быть доменной ошибкой с кодом, а не
 * 500. Прогон по реальным сменам должен проводиться.
 */
describe('HR payroll run', () => {
  let prisma: PrismaService;
  let hr: HrService;
  const RUN = `${Date.now().toString(36)}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const point = `PAYROLL-${RUN}`;
  const period = '2026-05';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    hr = new HrService(prisma, audit, new SettingsService(prisma, audit));
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('проводит начисление по отработанной смене', async () => {
    await prisma.storePoint.create({
      data: {
        code: `payroll-${RUN}`,
        name: 'Payroll test point',
        address: '—',
        inventoryLocation: point,
        hours: '09:00–18:00',
        createdBy: 'test',
        idempotencyKey: `payroll-point-${RUN}`,
      },
    });
    const staff = await prisma.staffUser.create({
      data: { username: `payroll-${RUN}`, passwordHash: 'x', role: 'seller', point },
    });
    const schedule = await prisma.hrSchedule.create({
      data: {
        staffId: staff.id,
        point,
        shiftDate: new Date('2026-05-12T00:00:00.000Z'),
        startsAt: new Date('2026-05-12T09:00:00.000Z'),
        endsAt: new Date('2026-05-12T18:00:00.000Z'),
        createdBy: 'test',
        idempotencyKey: `sched-${RUN}`,
      },
    });
    await prisma.hrAttendance.create({
      data: {
        scheduleId: schedule.id,
        staffId: staff.id,
        point,
        checkInKey: `att-${RUN}`,
        checkedInAt: new Date('2026-05-12T09:00:00.000Z'),
        checkedOutAt: new Date('2026-05-12T18:00:00.000Z'),
      },
    });

    const run = await hr.postPayroll(period, point, 'owner-test', `payroll-${RUN}`);
    expect(run).toMatchObject({ period, point });
  });

  it('период без данных отказывает доменной ошибкой, а не падением', async () => {
    const error = await hr.postPayroll('2026-04', point, 'owner-test', `payroll-empty-${RUN}`)
      .catch((cause) => cause);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('hr_payroll_empty');
  });
});

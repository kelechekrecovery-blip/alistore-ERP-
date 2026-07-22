import { DebtsReminderScheduler } from '../src/debts/debts.scheduler';
import { ReservationsScheduler } from '../src/reservations/reservations.scheduler';
import { ServiceSlaScheduler } from '../src/service-center/service-sla.scheduler';

/**
 * Три durable-шедулера (напоминания о долгах, освобождение резервов, эскалация
 * SLA сервис-центра) при провале старта раньше только писали `logger.error` и
 * молча оставались выключенными: `/observability/status` про них ничего не
 * знает, а preflight проверяет лишь наличие флага, но не то, что pg-boss
 * реально поднялся. Так «деньги магазина утекали без единого события» — ровно
 * то, что OutboxRelay/RefundRelay уже решают через `AlerterService`.
 *
 * Тест мокает pg-boss так, что `start()` бросает, и требует, чтобы каждый
 * шедулер отправил критический алерт — а не проглотил сбой в лог.
 */
const mockBossState: { startThrows: boolean } = { startThrows: false };

jest.mock('pg-boss', () => ({
  PgBoss: class {
    on() {}
    async start() {
      if (mockBossState.startThrows) throw new Error('pg-boss start failed');
    }
    async createQueue() {}
    async work() {}
    async schedule() {}
    async stop() {}
  },
}));

function fakeConfig(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as never;
}

describe('Durable schedulers alert on startup failure instead of degrading silently', () => {
  beforeEach(() => {
    mockBossState.startThrows = true;
  });

  it('debt-reminder scheduler pages ops when pg-boss fails to start', async () => {
    const alerter = { notifyCritical: jest.fn() };
    const scheduler = new DebtsReminderScheduler(
      fakeConfig({ DEBT_REMINDERS_ENABLED: 'true', DATABASE_URL: 'postgresql://x', PROCESS_ROLE: 'api' }),
      {} as never,
      alerter as never,
    );
    await scheduler.onModuleInit();
    expect(alerter.notifyCritical).toHaveBeenCalledTimes(1);
    expect(alerter.notifyCritical.mock.calls[0][0].source).toContain('debt');
  });

  it('reservation-expiry scheduler pages ops when pg-boss fails to start', async () => {
    const alerter = { notifyCritical: jest.fn() };
    const scheduler = new ReservationsScheduler(
      fakeConfig({ RESERVATION_SWEEP_ENABLED: 'true', DATABASE_URL: 'postgresql://x', PROCESS_ROLE: 'api' }),
      {} as never,
      {} as never,
      alerter as never,
    );
    await scheduler.onModuleInit();
    expect(alerter.notifyCritical).toHaveBeenCalledTimes(1);
    expect(alerter.notifyCritical.mock.calls[0][0].source).toContain('reservation');
  });

  it('service-SLA scheduler pages ops when pg-boss fails to start', async () => {
    const alerter = { notifyCritical: jest.fn() };
    const scheduler = new ServiceSlaScheduler(
      // JOB_BACKEND != bullmq → берёт pg-boss ветку, которую и мокаем.
      fakeConfig({ SERVICE_SLA_SWEEP_ENABLED: 'true', DATABASE_URL: 'postgresql://x', JOB_BACKEND: 'pgboss' }),
      {} as never,
      alerter as never,
    );
    await scheduler.onModuleInit();
    expect(alerter.notifyCritical).toHaveBeenCalledTimes(1);
    expect(alerter.notifyCritical.mock.calls[0][0].source).toContain('sla');
  });
});

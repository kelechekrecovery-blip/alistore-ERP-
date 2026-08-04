import { selectNotificationTransport } from '../src/outbox/notification-transport-selector';
import { LogNotificationTransport } from '../src/outbox/transports/log.transport';

/**
 * Уведомления обязаны либо доставляться, либо честно падать.
 *
 * При отсутствии `NOTIFICATION_TRANSPORT` выбирался `LogNotificationTransport`:
 * он пишет строку в лог и резолвится успешно, после чего сообщение помечается
 * `sent`. Дашборд показывает `pending: 0, failed: 0`, владелец видит идеальную
 * доставку — а клиент не получил ничего.
 *
 * Тот же приём, что у `DisabledOtpSender` и `NonePaymentGatewayProvider`:
 * недоступность должна быть видимой. В dev заглушка остаётся — она там честна.
 */
describe('Выбор транспорта уведомлений', () => {
  const select = (values: Record<string, string> = {}) =>
    selectNotificationTransport((name) => values[name], {
      channels: () => ({}) as never,
      novu: () => ({}) as never,
      email: () => ({}) as never,
      realtime: () => ({}) as never,
      log: () => new LogNotificationTransport(),
    });

  it('вне production молча логирует — это честно', () => {
    expect(select()).toBeInstanceOf(LogNotificationTransport);
    expect(select({ NODE_ENV: 'development' })).toBeInstanceOf(LogNotificationTransport);
  });

  it('в production требует явный транспорт вместо тихой заглушки', () => {
    expect(() => select({ NODE_ENV: 'production' })).toThrow('NOTIFICATION_TRANSPORT is required');
  });

  it('в production отвергает неизвестное значение, а не откатывается в лог', () => {
    expect(() => select({ NODE_ENV: 'production', NOTIFICATION_TRANSPORT: 'unknown' }))
      .toThrow('Unsupported NOTIFICATION_TRANSPORT');
  });

  it('в production принимает объявленный транспорт', () => {
    expect(() => select({ NODE_ENV: 'production', NOTIFICATION_TRANSPORT: 'channels' })).not.toThrow();
    expect(() => select({ NODE_ENV: 'production', NOTIFICATION_TRANSPORT: 'realtime' })).not.toThrow();
  });

  /**
   * `novu` требует ключ. Раньше отсутствие ключа тихо роняло выбор в лог-
   * заглушку, то есть опечатка в переменной окружения выглядела как рабочая
   * доставка.
   */
  it('в production не принимает novu без ключа', () => {
    expect(() => select({ NODE_ENV: 'production', NOTIFICATION_TRANSPORT: 'novu' }))
      .toThrow('NOVU_API_KEY');
    expect(() => select({ NODE_ENV: 'production', NOTIFICATION_TRANSPORT: 'novu', NOVU_API_KEY: 'k' }))
      .not.toThrow();
  });
});

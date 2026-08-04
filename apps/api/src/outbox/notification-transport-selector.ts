import { NotificationTransport } from './outbox.types';

/**
 * Выбор транспорта уведомлений.
 *
 * Раньше отсутствие или опечатка в `NOTIFICATION_TRANSPORT` молча возвращали
 * `LogNotificationTransport`: он пишет строку в лог и резолвится успешно, после
 * чего сообщение помечается `sent`. Дашборд показывал `pending: 0, failed: 0` —
 * идеальную доставку, при которой ни один клиент ничего не получил.
 *
 * Тот же приём, что у `DisabledOtpSender` и `NonePaymentGatewayProvider`:
 * недоступность обязана быть видимой. Вне production заглушка остаётся — там
 * она честна и удобна.
 *
 * Функция вынесена из модуля Nest, чтобы её можно было проверить без поднятия
 * контейнера: ровно так же оформлены селекторы OTP и платёжного шлюза.
 */
export type TransportEnvReader = (name: string) => string | undefined;

export interface TransportFactories {
  channels: () => NotificationTransport;
  novu: () => NotificationTransport;
  email: () => NotificationTransport;
  realtime: () => NotificationTransport;
  log: () => NotificationTransport;
}

export function selectNotificationTransport(
  env: TransportEnvReader,
  factories: TransportFactories,
): NotificationTransport {
  const mode = env('NOTIFICATION_TRANSPORT')?.trim().toLowerCase();
  const isProduction = env('NODE_ENV')?.trim().toLowerCase() === 'production';

  if (!mode) {
    if (isProduction) {
      throw new Error(
        'NOTIFICATION_TRANSPORT is required in production: тихая лог-заглушка помечает сообщения как доставленные',
      );
    }
    return factories.log();
  }

  if (mode === 'channels' || mode === 'providers') return factories.channels();
  if (mode === 'email') return factories.email();
  if (mode === 'realtime') return factories.realtime();
  if (mode === 'novu') {
    // Раньше отсутствие ключа роняло выбор в лог-заглушку, то есть опечатка в
    // переменной окружения выглядела как рабочая доставка.
    if (!env('NOVU_API_KEY')?.trim()) {
      if (isProduction) throw new Error('NOVU_API_KEY is required for NOTIFICATION_TRANSPORT=novu');
      return factories.log();
    }
    return factories.novu();
  }
  if (mode === 'log') return factories.log();

  if (isProduction) throw new Error(`Unsupported NOTIFICATION_TRANSPORT: ${mode}`);
  return factories.log();
}

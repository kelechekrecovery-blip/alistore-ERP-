import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProductionPreflightReport } from '../src/health/production-preflight';
import { selectPaymentGatewayProvider } from '../src/payments/payment-gateway-selector';
import { NonePaymentGatewayProvider } from '../src/payments/none-payment-gateway.provider';

/**
 * Блюпринт — это то, с чем сервис реально поедет. Код может быть покрыт
 * полностью и всё равно уехать не в том режиме.
 *
 * Так и вышло: селектор платежей давно умел `none` (честный 503
 * `online_payments_unavailable`), preflight умел его принимать, а `render.yaml`
 * всё это время держал `PAYMENT_PROVIDER: sandbox` и `PUBLIC_DEMO_MODE: true`.
 * На боевом домене это означало:
 *
 * - покупатель, выбравший «Картой», получал страницу «Тестовая оплата.
 *   Списание средств не производится», а кнопка подтверждения отвечала 404,
 *   потому что `PAYMENTS_SANDBOX_CONFIRM_ENABLED` в блюпринте не задан;
 * - каждый заказ витрины помечался `isDemo`, из-за чего выбранные зона и
 *   интервал доставки писались как `null`, слот не бронировался, а
 *   подтверждение заказа гасилось условием `!order.isDemo`.
 *
 * Тесты против выдуманных значений env такого не ловят по построению. Этот
 * читает файл, с которым идёт деплой, и прогоняет по нему тот же preflight,
 * который поднимает контейнер.
 */
describe('render.yaml · боевой режим', () => {
  const blueprint = readFileSync(join(__dirname, '../../../render.yaml'), 'utf8');
  const webDockerfile = readFileSync(join(__dirname, '../../../docker/web.Dockerfile'), 'utf8');

  /**
   * Разбор текстом, а не через js-yaml: зависимость (и её типы) ради нескольких
   * ключей дороже, чем прочитать пары «key/value». Тот же приём уже используется
   * в `otp-sender-selector.spec.ts`.
   */
  function valuesOf(key: string): string[] {
    const found: string[] = [];
    const lines = blueprint.split('\n');
    lines.forEach((line, index) => {
      if (line.trim() !== `- key: ${key}`) return;
      const next = lines[index + 1]?.trim() ?? '';
      const match = next.match(/^value:\s*"?([^"]*)"?$/);
      if (match) found.push(match[1]);
    });
    return found;
  }

  it('не выпускает магазин в песочницу и в демо-режим', () => {
    expect(valuesOf('PAYMENT_PROVIDER')).toEqual(['none']);
    // Оба сервиса — веб и API — должны выйти из демо одновременно: витрина
    // читает NEXT_PUBLIC_DEMO_MODE, заказы — PUBLIC_DEMO_MODE.
    expect(new Set(valuesOf('PUBLIC_DEMO_MODE'))).toEqual(new Set(['false']));
    expect(new Set(valuesOf('NEXT_PUBLIC_DEMO_MODE'))).toEqual(new Set(['false']));
  });

  it('не встраивает demo-клиент в production Web image по умолчанию', () => {
    expect(webDockerfile).toMatch(/ARG NEXT_PUBLIC_DEMO_MODE=false/);
    expect(webDockerfile).not.toMatch(/ARG NEXT_PUBLIC_DEMO_MODE=true/);
  });

  it('выбирает честно недоступный шлюз на значении из блюпринта', () => {
    const [provider] = valuesOf('PAYMENT_PROVIDER');
    expect(selectPaymentGatewayProvider((name) => (name === 'PAYMENT_PROVIDER' ? provider : undefined)))
      .toBeInstanceOf(NonePaymentGatewayProvider);
  });

  /**
   * Релей возвратов провайдера при оплате наличными включённым быть не может:
   * деньги приходят курьеру или на кассу, возврат идёт через домен `refunds`.
   * Preflight считает включённый релей `unsafe` — проверяем обе роли разом,
   * потому что в блюпринте они описаны разными сервисами и разъезжались.
   */
  /**
   * Транспорт уведомлений обязан быть объявлен явно: без значения выбиралась
   * лог-заглушка, которая помечает сообщения `sent` и показывает владельцу
   * идеальную доставку при нуле полученных клиентами сообщений.
   */
  it('объявляет транспорт уведомлений и не оставляет его заглушкой', () => {
    const declared = valuesOf('NOTIFICATION_TRANSPORT');
    expect(declared.length).toBeGreaterThan(0);
    expect(declared).not.toContain('log');

    for (const mode of declared) {
      const report = buildProductionPreflightReport((name) =>
        name === 'NOTIFICATION_TRANSPORT' ? mode : undefined);
      const check = report.checks.find((row) => row.id === 'notification_transport');
      expect({ mode, status: check?.status }).toEqual({ mode, status: 'ready' });
    }
  });

  it('проходит боевой preflight в обеих ролях', () => {
    const relays = valuesOf('REFUND_RELAY_ENABLED');
    expect(new Set(relays)).toEqual(new Set(['false']));

    for (const role of ['api', 'worker']) {
      const env: Record<string, string> = {
        PROCESS_ROLE: role,
        REFUND_RELAY_ENABLED: 'false',
        PUBLIC_DEMO_MODE: valuesOf('PUBLIC_DEMO_MODE')[0],
        PAYMENT_PROVIDER: valuesOf('PAYMENT_PROVIDER')[0],
        PAYMENT_PROVIDER_CERTIFIED: valuesOf('PAYMENT_PROVIDER_CERTIFIED')[0] ?? 'false',
      };
      const report = buildProductionPreflightReport((name) => env[name]);
      const relay = report.checks.find((check) => check.id === 'refund_relay');
      expect({ role, status: relay?.status }).toEqual({ role, status: 'ready' });
    }
  });

  /**
   * Наблюдаемость: авария должна быть видимой. Health-check обязан смотреть на
   * БД (иначе Render переключит трафик на мёртвую базу), напоминания о долгах —
   * включены, канал алертов — объявлен. Ровно та конфигурация, при которой 502
   * держался полтора суток.
   */
  it('здоровье смотрит на базу, а фоновые задачи и алерты объявлены', () => {
    // healthCheckPath API-сервиса — первое вхождение (worker'а нет).
    const healthLine = blueprint.split('\n').find((line) => line.trim().startsWith('healthCheckPath: /api/'));
    expect(healthLine?.trim()).toBe('healthCheckPath: /api/health/ready');
    expect(valuesOf('DEBT_REMINDERS_ENABLED')).toContain('true');

    // Секреты алертов объявлены как sync: false — значения задаёт владелец.
    expect(blueprint).toContain('ALERT_TELEGRAM_BOT_TOKEN');
    expect(blueprint).toContain('ALERT_TELEGRAM_CHAT_ID');
  });
});

/**
 * Staging проверяется тем же preflight, что и прод, — потому что он тоже
 * поднимается с `NODE_ENV=production`.
 *
 * Проверка выше читала ТОЛЬКО `render.yaml`, поэтому расхождения второго
 * блюпринта были невидимы. А они были: `infra/render.staging.yaml` не объявлял
 * пяти переменных, которые `assertProductionRuntimeReady` считает
 * boot-blocking, — то есть staging падал при старте до первого запроса, и
 * снаружи это выглядело как 502 без объяснений. Ровно тот отказ, ради
 * устранения которого preflight и писался.
 *
 * И health-check у staging всё ещё смотрел на `/api/health/live` — тот самый
 * баг, который в проде уже исправили: Render зеленил деплой поверх мёртвой БД.
 */
describe('infra/render.staging.yaml · staging обязан стартовать', () => {
  const blueprint = readFileSync(join(__dirname, '../../../infra/render.staging.yaml'), 'utf8');

  function valuesOf(key: string): string[] {
    const found: string[] = [];
    const lines = blueprint.split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Staging пишет и списком (`- key: X` / `value: Y`), и парой в строке
      // (`- { key: X, value: Y }`) — читаем оба вида.
      const inline = trimmed.match(new RegExp(`^-\\s*\\{\\s*key:\\s*${key},\\s*value:\\s*"?([^",}]*)"?\\s*\\}$`));
      if (inline) { found.push(inline[1].trim()); return; }
      if (trimmed !== `- key: ${key}`) return;
      const next = lines[index + 1]?.trim() ?? '';
      const match = next.match(/^value:\s*"?([^"]*)"?$/);
      if (match) found.push(match[1]);
    });
    return found;
  }

  it('объявляет всё, что preflight считает обязательным для старта', () => {
    const env: Record<string, string> = { NODE_ENV: 'production' };
    for (const key of [
      'SMS_PROVIDER', 'NOTIFICATION_TRANSPORT', 'DEBT_REMINDERS_ENABLED',
      'OUTBOX_RELAY_ENABLED', 'RESERVATION_SWEEP_ENABLED',
    ]) {
      const value = valuesOf(key)[0];
      expect({ key, declared: value !== undefined }).toEqual({ key, declared: true });
      env[key] = value;
    }
    // Секреты алертов задаёт владелец (sync: false), но объявлены быть обязаны.
    expect(blueprint).toContain('ALERT_TELEGRAM_BOT_TOKEN');
    expect(blueprint).toContain('ALERT_TELEGRAM_CHAT_ID');
  });

  it('health-check API смотрит на базу, а не только на живость процесса', () => {
    const healthLine = blueprint.split('\n').find((line) => line.trim().startsWith('healthCheckPath: /api/'));
    expect(healthLine?.trim()).toBe('healthCheckPath: /api/health/ready');
  });
});

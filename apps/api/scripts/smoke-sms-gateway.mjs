#!/usr/bin/env node
/**
 * Смоук-проверка SMS-моста после активации.
 *
 * Что он делает и чего НЕ делает. Скрипт дёргает боевой `POST /auth/otp/request`
 * и говорит, принял ли сервер запрос и отправил ли его в шлюз. Он НЕ подтверждает
 * доставку самой SMS — это может сделать только человек с телефоном в руках.
 * Секретов скрипт не касается: они живут в переменных окружения запущенного
 * сервера, сюда попадает лишь публичный URL и номер получателя.
 *
 * Использование:
 *   node apps/api/scripts/smoke-sms-gateway.mjs --url https://api.ali.kg --phone +996700123456
 *   API_BASE=https://api.ali.kg SMOKE_PHONE=+996700123456 node apps/api/scripts/smoke-sms-gateway.mjs
 *
 * Ожидаемо на настроенном мосту: HTTP 201 и "сервер принял запрос".
 * Дальше владелец смотрит на телефон-получатель: пришла ли SMS с кодом.
 */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url') out.url = argv[++i];
    else if (argv[i] === '--phone') out.phone = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const base = (args.url ?? process.env.API_BASE ?? '').replace(/\/+$/, '');
const phone = args.phone ?? process.env.SMOKE_PHONE ?? '';

if (!base || !phone) {
  console.error('Нужны --url <API base> и --phone <+номер>. См. шапку файла.');
  process.exit(2);
}

const endpoint = `${base}/api/auth/otp/request`;
console.log(`→ ${endpoint}`);
console.log(`→ номер: ${phone}`);

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();

  if (response.ok) {
    console.log(`✓ HTTP ${response.status}: сервер принял запрос и отправил его в шлюз.`);
    console.log('  Теперь посмотрите на телефон-получатель — должна прийти SMS с кодом.');
    console.log('  Если SMS не пришла: телефон-шлюз онлайн? Cloud Server включён? Баланс SIM?');
    process.exit(0);
  }

  // Тело ответа может нести код ошибки конфигурации — показываем, но помним,
  // что код OTP сервер наружу не отдаёт (проверено тестами), так что это безопасно.
  console.error(`✗ HTTP ${response.status}: сервер отклонил запрос.`);
  console.error(`  Ответ: ${text.slice(0, 300)}`);
  if (response.status === 503) {
    console.error('  503 обычно значит: шлюз недоступен или SMS_PROVIDER настроен неполно.');
  }
  process.exit(1);
} catch (error) {
  console.error(`✗ Не удалось достучаться до API: ${error instanceof Error ? error.message : error}`);
  console.error('  Проверьте URL и что сервис поднят.');
  process.exit(1);
}

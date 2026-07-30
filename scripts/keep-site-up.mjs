#!/usr/bin/env node
// Сторож боевых процессов, пока сайт живёт на этой машине через Cloudflare Tunnel.
//
// Это ВРЕМЕННАЯ мера, а не архитектура. Причина простоев описана в
// docs/PRODUCTION-ARCHITECTURE-REVIEW.md: боевой магазин не должен зависеть от
// того, включён ли ноутбук. Правильное решение — развернуть render.yaml и
// переключить DNS с туннеля на Render.
//
// ПОЧЕМУ NODE, А НЕ BASH. Прежняя версия (scripts/keep-site-up.sh) под launchd
// работать не может: репозиторий лежит в TCC-защищённом ~/Desktop, и агент с
// /bin/bash падает с «Operation not permitted» (код 126) — при пересадке на
// launchd это уронило сайт. Проверено пробными агентами 23.07.2026: node к
// Desktop пускают, bash нет. Не переписывайте обратно на shell.
//
// Разделение обязанностей:
//   launchd (KeepAlive) — поднимает УПАВШИЙ процесс;
//   этот сторож         — ловит ЗАВИСШИЙ: процесс жив, порт занят, health молчит.
// Второго launchd не умеет в принципе, поэтому сторож нужен и при живых агентах.
//
// Почему kickstart, а не запуск руками: прежняя версия поднимала сервисы через
// `nohup ... & disown`, и они становились сиротами вне launchd. Именно так
// 23.07.2026 боевой API оказался дочерним процессом приложения Codex, а витрина —
// процессом с PPID 1 без супервизора вовсе. Сторож обязан возвращать сервис тому
// же владельцу, а не плодить второго.
//
// Запуск вручную:      node scripts/keep-site-up.mjs --once
// Включить постоянно:  см. scripts/com.alistore.keepsiteup.plist

import { execFile } from 'node:child_process';
import { appendFile, lstat, readdir, readlink, stat, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

const INTERVAL_MS = 60_000;
const PROBE_TIMEOUT_MS = 8_000;
// Путь закреплён намеренно. Через os.tmpdir() журнал уезжал в приватный
// $TMPDIR пользователя, и у запуска из терминала он оказывался не там, где у
// launchd-агента: искать простои было негде. Рядом лежат остальные логи из
// plist'ов — /tmp/alistore-*.log.
const LOG = '/tmp/alistore-keepalive.log';
const DOMAIN = `gui/${process.getuid()}`;

const SERVICES = [
  { label: 'com.alistore.api', name: 'API (4000)', url: 'http://127.0.0.1:4000/api/health/ready' },
  // Витрина проверяется по /healthz, а не по '/': главная тянет каталог из API,
  // и при мёртвом API отдала бы не-200 — сторож принялся бы перезапускать
  // исправную витрину. /healthz отвечает за сам процесс Next и ни за что больше.
  { label: 'com.alistore.web', name: 'витрина (3000)', url: 'http://127.0.0.1:3000/healthz', repair: () => repairStorefrontBuild() },
];

// Публичные адреса проверяются отдельно: процессы могут быть живы, а сайт всё
// равно недоступен снаружи — например, когда лёг туннель.
const PUBLIC_PROBES = [
  { name: 'ali.kg', url: 'https://ali.kg/' },
  { name: 'api.ali.kg', url: 'https://api.ali.kg/api/health/ready' },
];

// Состояние простоя между итерациями: нужно, чтобы записать в журнал
// длительность, а не только факт. Без длительности нельзя ответить на вопрос
// «сколько магазин реально лежал» — а именно он и был главным в этом разборе.
const downSince = new Map();

async function log(message) {
  // Местное время, а не UTC: журнал сверяют с `pmset -g log`, который пишет в
  // местном. Расхождение в шесть часов превращало сверку простоев в загадку.
  const stamp = new Date().toLocaleString('sv-SE');
  await appendFile(LOG, `${stamp} ${message}\n`).catch(() => {});
}

async function isUp(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function agentLoaded(label) {
  return run('/bin/launchctl', ['print', `${DOMAIN}/${label}`]).then(() => true, () => false);
}

// Turbopack складывает внешние пакеты (у нас — загрузчики Sentry) в
// apps/web/.next/node_modules симлинками на РАСКЛАДКУ ПАКЕТНОГО МЕНЕДЖЕРА, с
// которым шла сборка: `../../../../node_modules/.pnpm/<пакет>@<версия>/node_modules/<пакет>`.
// Любой последующий `npm install` сносит `.pnpm` — ссылки повисают, а Next
// падает на загрузке instrumentation hook и отдаёт 500 на КАЖДЫЙ маршрут,
// включая /healthz. Замерено 30.07.2026: шесть часов простоя и 256 бесполезных
// kickstart'ов, потому что рестарт сломанную сборку не чинит в принципе.
//
// Чиним по имени пакета, а не по строке ссылки: хэш в имени каталога
// (`require-in-the-middle-a99415fa67232f7f`) генерирует Turbopack, а вот
// basename цели — это настоящее имя пакета, и оно же есть в плоской
// npm-раскладке. Экспортируется ради теста scripts/__tests__/keep-site-up.test.mjs.
export async function repairDanglingExternals(externalsDir, flatModulesDir) {
  const repaired = [];
  const unrepairable = [];
  const entries = await readdir(externalsDir).catch(() => null);
  if (!entries) return { repaired, unrepairable };

  for (const entry of entries) {
    const link = path.join(externalsDir, entry);
    const info = await lstat(link).catch(() => null);
    if (!info?.isSymbolicLink()) continue;
    if (await stat(link).then(() => true, () => false)) continue; // ссылка жива — не трогаем

    const target = await readlink(link).catch(() => '');
    const fallback = path.join(flatModulesDir, path.basename(target));
    if (!target || !(await stat(fallback).then(() => true, () => false))) {
      unrepairable.push(entry);
      continue;
    }
    await unlink(link);
    await symlink(path.relative(externalsDir, fallback), link);
    repaired.push(entry);
  }
  return { repaired, unrepairable };
}

// Сколько подряд неудачных рестартов считаем доказательством, что рестарт не
// поможет. Один-два — обычная перезагрузка процесса; три подряд означают, что
// сервис поднимается и сразу же снова не отвечает, то есть сломан артефакт, а
// не процесс.
const REVIVALS_BEFORE_REPAIR = 3;
const REVIVALS_BEFORE_ESCALATION = 10;
const failedRevivals = new Map();

// Ремонт сборки витрины. Отдельно от revive(), потому что применим только к
// вебу: у API нет .next и внешних симлинков.
async function repairStorefrontBuild() {
  const externals = path.join(REPO_ROOT, 'apps/web/.next/node_modules');
  const flat = path.join(REPO_ROOT, 'node_modules');
  const { repaired, unrepairable } = await repairDanglingExternals(externals, flat);
  if (repaired.length) {
    await log(`РЕМОНТ: повисшие внешние модули сборки перепривязаны к node_modules: ${repaired.join(', ')}`);
  }
  if (unrepairable.length) {
    await log(`ВНИМАНИЕ: повисшие модули сборки без замены в node_modules: ${unrepairable.join(', ')}`);
    await log('         пересоберите витрину: npm run build -w @alistore/web');
  }
  return repaired.length > 0;
}

// Возвращает сервис launchd, а не запускает копию мимо него. -k шлёт SIGKILL
// текущему процессу, если он ещё жив: зависший процесс держит порт, и без этого
// новый экземпляр не поднялся бы.
async function revive({ label, name, repair }) {
  if (!(await agentLoaded(label))) {
    await log(`ВНИМАНИЕ: агент ${label} не загружен — ${name} поднять некому.`);
    await log(`         установите: cp scripts/${label}.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/${label}.plist`);
    return;
  }

  const attempt = (failedRevivals.get(label) ?? 0) + 1;
  failedRevivals.set(label, attempt);

  // Молчаливый бесконечный рестарт — худшее из поведений: журнал заполняется
  // одинаковыми строками, а диагноза в нём нет. Поэтому сначала пробуем
  // починить известную поломку, потом — говорим вслух, что рестарт не помогает.
  if (repair && attempt === REVIVALS_BEFORE_REPAIR) await repair();
  if (attempt === REVIVALS_BEFORE_ESCALATION) {
    await log(`ЭСКАЛАЦИЯ: ${name} не поднимается ${attempt} перезапусков подряд — рестарт не лечит причину.`);
    await log('           смотрите /tmp/alistore-web-prod.err.log и /tmp/alistore-api-prod.err.log');
    await notify('AliStore: рестарт не помогает', `${name} лежит после ${attempt} перезапусков. Нужен разбор.`);
  }

  await log(`${name} не отвечает — перезапускаю через launchctl kickstart ${label}`);
  await run('/bin/launchctl', ['kickstart', '-k', `${DOMAIN}/${label}`]).catch(() => {});
}

// Уведомление на экран. Молчаливое восстановление тоже плохо: если магазин
// падает по три раза в день, владелец обязан это видеть, а не узнавать из логов.
async function notify(title, message) {
  await run('/usr/bin/osascript', [
    '-e',
    `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
  ]).catch(() => {});
}

async function trackOutage(key, up, humanName) {
  if (!up && !downSince.has(key)) {
    downSince.set(key, Date.now());
    await log(`ПРОСТОЙ НАЧАЛСЯ: ${humanName}`);
    await notify('AliStore: сайт недоступен', `${humanName} не отвечает`);
    return;
  }
  if (up && downSince.has(key)) {
    const seconds = Math.round((Date.now() - downSince.get(key)) / 1000);
    downSince.delete(key);
    await log(`ПРОСТОЙ ЗАКОНЧЕН: ${humanName}, длительность ${seconds}с`);
    await notify('AliStore: сайт восстановлен', `${humanName} снова отвечает (простой ${seconds}с)`);
  }
}

// Напоминание про сон показываем не чаще раза в час: в журнал пишем каждый цикл
// (там это дёшево и полезно для истории), а уведомлением раз в минуту довели бы
// до того, что его отключат — и вместе с ним пропустят настоящую аварию.
const SLEEP_NAG_INTERVAL_MS = 60 * 60 * 1000;
let lastSleepNagAt = 0;

async function checkSleepGuard() {
  const stdout = await run('/usr/bin/pmset', ['-g']).then((r) => r.stdout, () => '');
  if (/SleepDisabled\s+1/.test(stdout)) return;
  // Сон — главная причина простоев (22ч37м из 52ч на 23.07.2026), и сторож
  // против него бессилен: спящая машина не выполняет ничего, включая этот
  // процесс. Поэтому не «чиним», а громко фиксируем, если защиту сняли.
  //
  // Раз в час, а не каждый цикл: прежняя версия писала две строки в минуту и к
  // 30.07.2026 заняла 7778 строк журнала из 9015 — настоящие простои в нём
  // приходилось выискивать. Часа достаточно, чтобы восстановить по журналу
  // интервал, когда защита была снята, и это ровно та же частота, что у
  // экранного уведомления.
  if (Date.now() - lastSleepNagAt < SLEEP_NAG_INTERVAL_MS) return;
  lastSleepNagAt = Date.now();
  await log('ВНИМАНИЕ: sleep не запрещён — закрытая крышка снова погасит сайт.');
  await log('         включите: sudo pmset -a disablesleep 1');
  await notify(
    'AliStore: защита от сна выключена',
    'Закрытая крышка погасит магазин. Выполните: sudo pmset -a disablesleep 1',
  );
}

async function checkOnce() {
  for (const service of SERVICES) {
    const up = await isUp(service.url);
    if (up) failedRevivals.delete(service.label);
    else await revive(service);
    await trackOutage(service.label, up, service.name);
  }

  // Туннель: без него сайт недоступен снаружи, даже если процессы живы.
  //
  // -x (точное имя процесса), а НЕ -f 'cloudflared tunnel'. Прежний шаблон
  // никогда не совпадал: реальная командная строка — «cloudflared --logfile X
  // tunnel run», то есть слова "cloudflared" и "tunnel" не соседи. Сторож
  // каждую минуту считал живой туннель мёртвым и убивал его через kickstart -k,
  // сам создавая простой, который потом же и фиксировал. Поймано на прогоне
  // 23.07.2026 до включения агента.
  const tunnelUp = await run('/usr/bin/pgrep', ['-x', 'cloudflared']).then(() => true, () => false);
  if (!tunnelUp) await revive({ label: 'com.alistore.cloudflared', name: 'туннель cloudflared' });

  for (const probe of PUBLIC_PROBES) {
    await trackOutage(`public:${probe.name}`, await isUp(probe.url), `публичный ${probe.name}`);
  }

  await checkSleepGuard();
}

// Цикл запускается только при прямом вызове файла. Без этой проверки импорт из
// теста (scripts/__tests__/keep-site-up.test.mjs) поднимал бы сторожа и начинал
// перезапускать боевые сервисы прямо из прогона тестов.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  if (process.argv.includes('--once')) {
    await checkOnce();
  } else {
    await log('сторож запущен');
    for (;;) {
      await checkOnce();
      await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    }
  }
}

#!/usr/bin/env node
/**
 * Локальный API для симулятора iOS и ручной работы — на своём порту и своей базе.
 *
 * Зачем отдельный скрипт. Порт 4000 занял боевой процесс с `NODE_ENV=production`,
 * а в этом режиме `allowedHostsMiddleware` отвергает любой хост вне
 * `ALLOWED_HOSTS`; вносить туда `localhost` запрещено намеренно. Приложение из
 * симулятора получало `421 Misdirected Request` на каждый запрос — код был
 * исправен, целились не туда.
 *
 * И вторая, более неприятная половина: `apps/api/.env` указывает на
 * `alistore_dev` — это **боевая** база. Запуск локального API с дефолтным
 * окружением означал бы, что симулятор пишет в прод. Поэтому база здесь своя и
 * задаётся явно, а не наследуется.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'apps', 'api');

const PORT = process.env.LOCAL_API_PORT ?? '4010';
const DB_NAME = process.env.LOCAL_API_DB ?? 'alistore_local';
const DB_URL = `postgresql://${process.env.USER}@localhost:5432/${DB_NAME}?schema=public`;

// Предохранитель: имя боевой базы сюда попасть не должно даже по опечатке.
if (DB_NAME === 'alistore_dev') {
  console.error('[local-api] alistore_dev — боевая база. Укажите другую в LOCAL_API_DB.');
  process.exit(1);
}

function psqlListHasDb() {
  const out = execFileSync('psql', ['-lqt'], { encoding: 'utf8' });
  return out.split('\n').some((line) => line.split('|')[0].trim() === DB_NAME);
}

if (!psqlListHasDb()) {
  console.log(`[local-api] создаю базу ${DB_NAME}`);
  execFileSync('createdb', [DB_NAME], { stdio: 'inherit' });
}

console.log(`[local-api] применяю миграции к ${DB_NAME}`);
execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: apiDir,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: DB_URL },
});
// Индексы ставит отдельный шаг: `migrate deploy` их не создаёт (см. CLAUDE.md).
execFileSync('node', ['scripts/postdeploy-indexes.mjs'], {
  cwd: apiDir,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: DB_URL },
});

const entry = join(apiDir, 'dist', 'main.js');
// Проверка «файл существует» пропускала пересборку после правки исходников:
// поднимался вчерашний сервер без новых маршрутов, и молча — человек искал
// причину в коде, которого в процессе не было. Сравниваем со свежестью src.
function newestMtime(dir) {
  let newest = 0;
  for (const entryName of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entryName.name);
    const stamp = entryName.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs;
    if (stamp > newest) newest = stamp;
  }
  return newest;
}
const builtAt = existsSync(entry) ? statSync(entry).mtimeMs : 0;
if (builtAt < newestMtime(join(apiDir, 'src'))) {
  console.log('[local-api] исходники новее сборки — пересобираю API');
  execFileSync('npm', ['run', 'api:build'], { cwd: root, stdio: 'inherit' });
}

console.log(`[local-api] http://127.0.0.1:${PORT}/api · база ${DB_NAME}`);
const child = spawn(process.execPath, [entry], {
  cwd: apiDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: DB_URL,
    PORT,
    NODE_ENV: 'development',
    NODE_PATH: './node_modules',
    // Боевой список origin'ов наследуется из `.env` и не содержит локальную
    // витрину — браузер резал каждый запрос по CORS, и кабинет молча не
    // логинился. Задаём локальные явно, а не разрешаем всё: «origin: true»
    // однажды переживёт копипасту в staging.
    CORS_ORIGINS: process.env.LOCAL_API_CORS
      ?? 'http://localhost:3400,http://127.0.0.1:3400,http://localhost:3000,http://127.0.0.1:3000',
  },
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
// `code === null` означает завершение по сигналу или креш — выдавать это за
// успешный выход значит спрятать падение от того, кто запустил скрипт.
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

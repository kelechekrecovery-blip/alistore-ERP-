#!/usr/bin/env node
/**
 * Проверка восстановленной базы, которая ничего не стирает.
 *
 * Зачем отдельный скрипт
 * ----------------------
 * До него ответить на вопрос «система работает после восстановления?» было
 * нечем. `mvp:verify` — единственный гейт — отвергает базу без слова `test` в
 * имени (`mvp-verify.mjs:117`), а с ним первым же шагом делает `migrate reset`
 * (`:33-38`), то есть стирает восстановленное **до первого ассерта**. Показательно,
 * что `alistore_restore_check` — имя из самого `infra/RUNBOOK.md` — этот
 * предохранитель не проходит. Поэтому drill 18.07 и остался ручным: сверять
 * пришлось `count(*)` руками, автоматизировать было нечего.
 *
 * Что здесь проверяется, по возрастанию силы
 * ------------------------------------------
 * 1. Схема доехала целиком — миграции и структура против эталона.
 * 2. Справочные данные на месте — план счетов.
 * 3. Деньги сходятся — двойная запись по всей базе.
 * 4. Леджер непуст и достаточно свеж.
 * 5. Сервис отвечает на этих данных (опционально, `--api-url`).
 *
 * Эталон структуры — не константа, а свежемигрированная база. Триггеров здесь 33
 * при 19 `CREATE TRIGGER` в миграциях (остальные — `CREATE CONSTRAINT TRIGGER`),
 * так что любое зашитое число устареет молча. Эталон обновляется вместе с
 * миграциями сам.
 *
 * Read-only не на честном слове: соединение переводится в
 * `default_transaction_read_only`, поэтому любая попытка записи упадёт с ошибкой
 * Postgres, а не тихо изменит проверяемые данные.
 *
 * Использование
 *   node scripts/verify-restored-database.mjs --database-url=postgresql://…/alistore_restore_check
 *     [--reference-db=alistore_test_template] [--max-age-days=7] [--api-url=http://127.0.0.1:4000]
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationCountOnDisk, readStructure, missingFrom } from './lib/pg-structure.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Client } = require(require.resolve('pg', { paths: [path.join(repoRoot, 'apps/api'), repoRoot] }));

const options = parseArgs(process.argv.slice(2));
if (!options.databaseUrl) {
  console.error('Укажите --database-url=<строка подключения к восстановленной базе>');
  process.exit(2);
}

const REFERENCE_DB = options.referenceDb ?? 'alistore_test_template';
const results = [];

/** Соединение только для чтения: запись отвергнет сам Postgres. */
async function readOnlyClient(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  await client.query('SET default_transaction_read_only = on');
  return client;
}

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Эталон — свежемигрированная база. Если её нет, собираем: это дешевле, чем
 * ослаблять проверку до «триггеры есть хоть какие-то».
 */
async function ensureReference(adminUrl) {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [REFERENCE_DB]);
    if (exists.rowCount) return;
    console.log(`[эталон] ${REFERENCE_DB} отсутствует — собираю из миграций`);
    await admin.query(`CREATE DATABASE "${REFERENCE_DB}"`);
  } finally {
    await admin.end();
  }
  const env = { ...process.env, DATABASE_URL: withDatabase(options.databaseUrl, REFERENCE_DB) };
  for (const [command, args] of [
    ['npm', ['exec', '-w', '@alistore/api', '--', 'prisma', 'migrate', 'deploy']],
    ['node', ['apps/api/scripts/postdeploy-indexes.mjs']],
  ]) {
    const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', env });
    if ((result.status ?? 1) !== 0) throw new Error(`не удалось собрать эталон ${REFERENCE_DB}`);
  }
}

async function main() {
  const adminUrl = withDatabase(options.databaseUrl, 'postgres');
  await ensureReference(adminUrl);

  const target = await readOnlyClient(options.databaseUrl);
  const reference = await readOnlyClient(withDatabase(options.databaseUrl, REFERENCE_DB));

  try {
    // 1. Схема доехала целиком.
    const [actual, expected] = [await readStructure(target), await readStructure(reference)];
    const onDisk = migrationCountOnDisk(repoRoot);
    record(
      'миграции применены полностью',
      actual.appliedMigrations === onDisk,
      `в базе ${actual.appliedMigrations === -1 ? 'нет таблицы _prisma_migrations' : actual.appliedMigrations}, на диске ${onDisk}`,
    );

    for (const kind of ['tables', 'triggers', 'indexes']) {
      const missing = missingFrom(expected[kind], actual[kind]);
      record(
        `структура: ${kind}`,
        missing.length === 0,
        missing.length === 0
          ? `${actual[kind].size} шт., совпадает с эталоном`
          : `не хватает ${missing.length}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`,
      );
    }

    // 2. Справочные данные: план счетов — единственный источник правды тот же,
    // что у приложения.
    const chart = JSON.parse(
      readFileSync(path.join(repoRoot, 'apps/api/src/finance/accounting-chart.data.json'), 'utf8'),
    );
    const present = new Set(
      (await target.query('SELECT code FROM "AccountingAccount"')).rows.map((row) => row.code),
    );
    const missingAccounts = chart.map((a) => a.code).filter((code) => !present.has(code));
    record(
      'план счетов полон',
      missingAccounts.length === 0,
      missingAccounts.length === 0 ? `${chart.length} счетов на месте` : `нет: ${missingAccounts.join(', ')}`,
    );

    // 3. Деньги сходятся. Тот же инвариант, что accounting-journal.ts (дебет =
    // кредит и обе стороны > 0) и триггер 20260716053000, но применённый ко всей
    // базе разом: именно это и значит «проводки пережили восстановление».
    const unbalanced = await target.query(`
      SELECT e.id,
             COALESCE(SUM(l.debit), 0)::bigint  AS debit,
             COALESCE(SUM(l.credit), 0)::bigint AS credit
      FROM "AccountingJournalEntry" e
      LEFT JOIN "AccountingJournalLine" l ON l."entryId" = e.id
      GROUP BY e.id
      HAVING COALESCE(SUM(l.debit), 0) <> COALESCE(SUM(l.credit), 0)
          OR COALESCE(SUM(l.debit), 0) = 0
      LIMIT 20
    `);
    const entries = await target.query('SELECT count(*)::int AS n FROM "AccountingJournalEntry"');
    record(
      'двойная запись сходится',
      unbalanced.rowCount === 0,
      unbalanced.rowCount === 0
        ? `${entries.rows[0].n} проводок, все сбалансированы`
        : `несбалансированных ${unbalanced.rowCount}+: ${unbalanced.rows.slice(0, 3).map((r) => `${r.id} (${r.debit}/${r.credit})`).join(', ')}`,
    );

    // 4. Леджер непуст и свеж.
    const ledger = await target.query('SELECT count(*)::int AS n, max(ts) AS latest FROM "AuditEvent"');
    const { n, latest } = ledger.rows[0];
    record('леджер непуст', n > 0, `${n} событий, последнее ${latest ? new Date(latest).toISOString() : '—'}`);
    if (options.maxAgeDays != null) {
      const ageDays = latest ? (Date.now() - new Date(latest).getTime()) / 86_400_000 : Infinity;
      record(
        'леджер свежий',
        ageDays <= options.maxAgeDays,
        `последнему событию ${Number.isFinite(ageDays) ? ageDays.toFixed(1) : '∞'} дн., порог ${options.maxAgeDays}`,
      );
    }
  } finally {
    await target.end();
    await reference.end();
  }

  // 5. Сервис отвечает на этих данных.
  if (options.apiUrl) {
    const url = `${options.apiUrl.replace(/\/$/, '')}/api/health/ready`;
    try {
      const response = await fetch(url);
      const body = await response.text();
      record('API отвечает ready', response.ok, `${response.status} ${body.slice(0, 120)}`);
    } catch (error) {
      record('API отвечает ready', false, `${url}: ${error.message}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length === 0 ? 'Восстановленная база прошла все проверки' : `Провалено проверок: ${failed.length}`} (${results.length} всего)`);
  process.exit(failed.length === 0 ? 0 : 1);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'database-url') parsed.databaseUrl = value;
    if (key === 'reference-db') parsed.referenceDb = value;
    if (key === 'api-url') parsed.apiUrl = value;
    if (key === 'max-age-days') parsed.maxAgeDays = Number(value);
  }
  return parsed;
}

function withDatabase(base, database) {
  const url = new URL(base);
  url.pathname = `/${database}`;
  url.search = '?schema=public';
  return url.toString();
}

main().catch((error) => {
  console.error(`Проверка не выполнена: ${error.message}`);
  process.exit(2);
});

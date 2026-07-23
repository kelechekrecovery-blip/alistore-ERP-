/**
 * Чтение структуры Postgres-базы и числа миграций на диске.
 *
 * Вынесено в общий модуль, потому что двум скриптам нужен один и тот же ответ на
 * вопрос «доехала ли схема целиком»: `run-isolated-api-tests.mjs` решает, не
 * устарел ли шаблон, а `verify-restored-database.mjs` — не потерялось ли что-то
 * при восстановлении из бэкапа.
 *
 * Числа здесь принципиально не зашиты. Триггеров в этой схеме 33 при 19
 * `CREATE TRIGGER` в миграциях — остальные заводятся как `CREATE CONSTRAINT
 * TRIGGER`, и любая попытка сосчитать их регуляркой по SQL врёт. Поэтому эталон
 * — не константа, а свежемигрированная база: она по определению знает правду и
 * обновляется вместе с миграциями.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

/** Сколько миграций лежит на диске (папки вида `2026…_name`). */
export function migrationCountOnDisk(repoRoot) {
  return readdirSync(path.join(repoRoot, 'apps/api/prisma/migrations'))
    .filter((entry) => /^\d/.test(entry)).length;
}

/**
 * Снимок структуры: имена таблиц, триггеров и индексов схемы `public` плюс число
 * успешно применённых миграций. Только SELECT — вызывается и на базах, которые
 * запрещено трогать.
 */
export async function readStructure(client) {
  const tables = await client.query(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const triggers = await client.query(
    `SELECT t.tgname AS name FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal AND n.nspname = 'public'`,
  );
  const indexes = await client.query(
    `SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'`,
  );

  let appliedMigrations = -1;
  try {
    const applied = await client.query(
      'SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL',
    );
    appliedMigrations = applied.rows[0].n;
  } catch {
    // Таблицы миграций может не быть вовсе — это сам по себе результат.
    appliedMigrations = -1;
  }

  return {
    tables: new Set(tables.rows.map((row) => row.name)),
    triggers: new Set(triggers.rows.map((row) => row.name)),
    indexes: new Set(indexes.rows.map((row) => row.name)),
    appliedMigrations,
  };
}

/** Что есть в эталоне, но отсутствует в проверяемой базе. */
export function missingFrom(reference, actual) {
  return [...reference].filter((name) => !actual.has(name)).sort();
}

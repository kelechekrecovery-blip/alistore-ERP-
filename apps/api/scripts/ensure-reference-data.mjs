import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

/**
 * Ставит справочные данные, без которых система не работает.
 *
 * Читает тот же `accounting-chart.data.json`, что и приложение с тестами: план
 * счетов раньше жил INSERT-ом внутри миграции и копией в тестовом харнессе.
 * Тесты чинили себя сами, поэтому пустой справочник в рабочей базе никто не
 * замечал — отказ вылезал за три шага от причины: приёмка товара падала с
 * «Счёт 1200 не найден», хотя счёт никто не удалял, он просто не был поставлен.
 *
 * Идемпотентно и неразрушающе: `ON CONFLICT DO NOTHING` не трогает уже заведённые
 * счета, поэтому переименование счёта владельцем переживает следующий деплой.
 */
const here = dirname(fileURLToPath(import.meta.url));
const chartPath = join(here, '..', 'src', 'finance', 'accounting-chart.data.json');
const accounts = JSON.parse(readFileSync(chartPath, 'utf8'));

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required to install reference data');
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rows } = await client.query(
    `INSERT INTO "AccountingAccount" ("code", "name", "type")
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::"AccountingAccountType"[])
     ON CONFLICT ("code") DO NOTHING
     RETURNING "code"`,
    [
      accounts.map((account) => account.code),
      accounts.map((account) => account.name),
      accounts.map((account) => account.type),
    ],
  );
  const total = await client.query('SELECT count(*)::int AS total FROM "AccountingAccount"');
  console.log(
    `reference-data: план счетов — добавлено ${rows.length}, всего ${total.rows[0].total} из ${accounts.length} эталонных`,
  );
  if (total.rows[0].total < accounts.length) {
    throw new Error(
      'reference-data: в базе меньше счетов, чем в эталоне — кто-то удалил справочник, деплой остановлен',
    );
  }
} finally {
  await client.end();
}

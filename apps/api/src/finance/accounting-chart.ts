import type { AccountingAccountType } from '@prisma/client';
// Файл данных называется `.data.json`, а не `accounting-chart.json`, намеренно:
// в `jest.config.js` расширение `json` стоит РАНЬШЕ `ts`, поэтому одноимённый
// JSON затеняет этот модуль — `import { ... } from './accounting-chart'` в
// соседних файлах начинает резолвиться в данные и отдаёт undefined.
import * as chartModule from './accounting-chart.data.json';

/**
 * JSON приходит в двух формах в зависимости от того, кто нас грузит: ts-node и
 * сборка дают массив в `default`, ts-jest отдаёт сам массив. Нормализуем здесь
 * один раз, чтобы ни один потребитель не знал об этой разнице.
 */
const chart = (Array.isArray(chartModule)
  ? chartModule
  : (chartModule as { default: unknown[] }).default) as Array<{
  code: string;
  name: string;
  type: string;
  note?: string;
}>;

export interface AccountingAccountSeed {
  code: string;
  name: string;
  type: AccountingAccountType;
  /** Почему счёт заведён — там, где это неочевидно. В базу не пишется. */
  note?: string;
}

const ACCOUNT_TYPES: ReadonlySet<string> = new Set<AccountingAccountType>([
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
]);

/**
 * План счетов — единственный источник правды.
 *
 * Лежит в JSON, а не массивом в TypeScript, потому что его читают три разных
 * потребителя: приложение (через этот модуль), тестовый харнесс и скрипт
 * деплоя на голом Node без сборки. Пока список был массивом в `.ts`, скрипт
 * деплоя прочитать его не мог, и справочник ставился только миграцией и
 * тестами. Тесты чинили себя сами, поэтому пустой план счетов в рабочей базе
 * никто не замечал — отказ вылез за три шага от причины: приёмка товара упала
 * с «Счёт 1200 не найден».
 *
 * JSON не проверяется компилятором, поэтому тип счёта сверяется здесь: опечатка
 * должна ронять запуск, а не создавать счёт, на который потом не встанет ни одна
 * проводка.
 */
export const ACCOUNTING_ACCOUNT_SEED: readonly AccountingAccountSeed[] = chart.map((account) => {
  if (!ACCOUNT_TYPES.has(account.type)) {
    throw new Error(
      `accounting-chart.json: счёт ${account.code} имеет неизвестный тип «${account.type}»`,
    );
  }
  return account as AccountingAccountSeed;
});

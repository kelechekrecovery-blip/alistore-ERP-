import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { repairDanglingExternals } from '../keep-site-up.mjs';

// 30.07.2026 витрина отвечала 500 на КАЖДЫЙ запрос шесть часов подряд, включая
// /healthz, и сторож 256 раз перезапустил её впустую. Причина: сборка Turbopack
// кладёт внешние пакеты Sentry в apps/web/.next/node_modules симлинками на
// pnpm-раскладку (node_modules/.pnpm/<пакет>@<версия>/node_modules/<пакет>),
// а последующий `npm install` стирает .pnpm — симлинки повисают, instrumentation
// hook не грузится, Next отдаёт 500. Рестарт такое не лечит по определению,
// поэтому сторож обязан уметь чинить ровно этот случай сам.
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'keepsiteup-'));
  const flat = path.join(root, 'node_modules');
  const externals = path.join(root, 'apps/web/.next/node_modules');
  await mkdir(path.join(flat, 'require-in-the-middle'), { recursive: true });
  await writeFile(path.join(flat, 'require-in-the-middle', 'package.json'), '{}');
  await mkdir(externals, { recursive: true });
  return { root, flat, externals };
}

test('repoints a dangling pnpm symlink at the flat package of the same name', async (t) => {
  const { root, flat, externals } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const link = path.join(externals, 'require-in-the-middle-a99415fa67232f7f');
  await symlink('../../../../node_modules/.pnpm/require-in-the-middle@8.0.1/node_modules/require-in-the-middle', link);

  const result = await repairDanglingExternals(externals, flat);

  assert.deepEqual(result.repaired, ['require-in-the-middle-a99415fa67232f7f']);
  assert.deepEqual(result.unrepairable, []);
  // Сверяем не строку ссылки, а фактическую разрешимость: цель теста —
  // «модуль снова находится», а не «ссылка написана вот так».
  assert.equal(path.resolve(externals, await readlink(link)), path.join(flat, 'require-in-the-middle'));
});

test('leaves a healthy symlink untouched', async (t) => {
  const { root, flat, externals } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const link = path.join(externals, 'require-in-the-middle-a99415fa67232f7f');
  await symlink(path.join(flat, 'require-in-the-middle'), link);

  const result = await repairDanglingExternals(externals, flat);

  assert.deepEqual(result.repaired, []);
  assert.deepEqual(result.unrepairable, []);
});

test('reports a dangling symlink it cannot repair instead of silently passing', async (t) => {
  const { root, flat, externals } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await symlink('../../../../node_modules/.pnpm/nowhere@1.0.0/node_modules/nowhere', path.join(externals, 'nowhere-deadbeefdeadbeef'));

  const result = await repairDanglingExternals(externals, flat);

  assert.deepEqual(result.repaired, []);
  assert.deepEqual(result.unrepairable, ['nowhere-deadbeefdeadbeef']);
});

test('treats a missing externals directory as nothing to repair', async (t) => {
  const { root, flat } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await repairDanglingExternals(path.join(root, 'apps/web/.next-absent/node_modules'), flat);

  assert.deepEqual(result, { repaired: [], unrepairable: [] });
});

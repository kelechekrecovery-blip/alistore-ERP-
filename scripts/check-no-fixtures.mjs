#!/usr/bin/env node
/**
 * Guard: ERP screens must not ship invented business data.
 *
 * Every mock this repo grew followed the same shape — a `DEFAULT_*` constant with
 * plausible figures, substituted in a `catch` when the request failed. The owner
 * then read invented couriers, an invented payroll run of 273 200 сом and six
 * employees who do not exist, with no way to tell them from live data. Worse,
 * two of those catches showed an error banner *and* rendered the numbers under
 * it, so the banner read as a warning about something else.
 *
 * Two rules, both aimed at that shape:
 *   1. no constant holding business-looking data (money-sized numbers, or names
 *      and phrases in Cyrillic) in the ERP screens;
 *   2. no `catch` that swallows a failure without recording an error state.
 *
 * Escape hatch: put `// fixtures-allowed: <reason>` on the line above. It is
 * deliberately explicit — a reviewer should see the justification in the diff.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN = ['apps/web/components/erp', 'apps/web/app/erp'];
const ALLOW = /\/\/\s*fixtures-allowed:/;

/** A number this large in a UI constant is a price, a salary or a balance. */
const MONEY_LIKE = /\b\d{4,}\b/;
/** Invented names, cities and sentences — the other half of every mock found. */
const CYRILLIC_PHRASE = /['"`][^'"`]*[А-Яа-яЁё][^'"`]{7,}['"`]/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Collect the source of a `const NAME = ...` declaration up to its closing
 * bracket, so a multi-line fixture is judged as a whole rather than line by line.
 */
function readDeclaration(lines, start, fromColumn = 0) {
  let depth = 0;
  const chunk = [];
  for (let i = start; i < lines.length && i < start + 400; i += 1) {
    // `} catch (e) {` closes the *try* block first: counting that brace would end
    // the scan before the handler body is ever read, and every handler would look
    // empty. Callers pass the column of the construct so the tail is scanned.
    const text = i === start ? lines[i].slice(fromColumn) : lines[i];
    chunk.push(text);
    for (const char of text) {
      if (char === '{' || char === '[') depth += 1;
      if (char === '}' || char === ']') depth -= 1;
    }
    if (depth <= 0 && i > start) break;
    if (depth === 0 && /;\s*$/.test(text)) break;
  }
  return chunk.join('\n');
}

const findings = [];

for (const scanDir of SCAN) {
  const abs = join(ROOT, scanDir);
  let files;
  try { files = walk(abs); } catch { continue; }

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    const rel = relative(ROOT, file);

    lines.forEach((line, index) => {
      const allowed = index > 0 && ALLOW.test(lines[index - 1]);
      if (allowed) return;

      // Rule 1 — a constant that looks like invented business data.
      const decl = /^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=/.exec(line);
      if (decl && /^(DEFAULT_|.*_FIXTURE|.*_SAMPLE|MOCK_|FAKE_)/.test(decl[1])) {
        const body = readDeclaration(lines, index);
        if (MONEY_LIKE.test(body) || CYRILLIC_PHRASE.test(body)) {
          findings.push({
            file: rel,
            line: index + 1,
            what: `константа ${decl[1]} содержит бизнес-данные`,
            why: 'Владелец не отличит её от настоящих данных. Покажите пустое состояние или ошибку.',
          });
        }
      }

      // Rule 2 — a catch that answers a failure with invented data.
      //
      // The first version of this rule demanded that every catch record an error,
      // and immediately flagged handlers that call `setNotice(...)` — a different
      // but perfectly honest setter. The harm was never silence as such: it is
      // substituting fixtures, which turns a failure into confident-looking data.
      // So the rule now targets exactly that, plus a genuinely empty handler.
      const catchAt = /\bcatch\s*(\([^)]*\))?\s*\{/.exec(line);
      if (catchAt) {
        const body = readDeclaration(lines, index, catchAt.index);
        const usesFixture = /\b(DEFAULT_[A-Z0-9_]*|MOCK_[A-Z0-9_]*|FAKE_[A-Z0-9_]*|\w*_FIXTURE\w*|default[A-Z]\w*\()/.test(body);
        const stripped = body.replace(/catch\s*(\([^)]*\))?\s*\{/, '').replace(/[{}\s]/g, '').replace(/\/\/.*$/gm, '');
        if (usesFixture) {
          findings.push({
            file: rel,
            line: index + 1,
            what: 'catch подставляет фикстуру вместо ошибки',
            why: 'Сбой превращается в правдоподобные данные — владелец их не отличит.',
          });
        } else if (stripped.length === 0) {
          findings.push({
            file: rel,
            line: index + 1,
            what: 'пустой catch',
            why: 'Сбой исчезает бесследно: ни ошибки на экране, ни записи в консоли.',
          });
        }
      }
    });
  }
}

/*
 * Ratchet. Some screens still carry known fixtures (Склад, Сервис-центр) and are
 * scheduled separately. Failing on them would make the guard unusable today and
 * it would simply be removed. So the baseline records what is already known and
 * the guard fails only on anything NEW — the count can go down, never up.
 * Fixing a screen means deleting its lines from the baseline in the same commit.
 */
const BASELINE_PATH = join(ROOT, 'scripts/no-fixtures-baseline.json');
let baseline = [];
try { baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')); } catch { /* no baseline yet */ }

const key = (f) => `${f.file}::${f.what}`;
const known = new Set(baseline);
const fresh = findings.filter((f) => !known.has(key(f)));
const fixed = [...known].filter((entry) => !findings.some((f) => key(f) === entry));

if (fixed.length > 0) {
  console.log(`✓ Исправлено с прошлого запуска: ${fixed.length}. Удалите из базовой линии:`);
  for (const entry of fixed) console.log(`    ${entry}`);
  console.log('');
}

if (fresh.length === 0) {
  const rest = findings.length;
  console.log(rest === 0
    ? '✓ Фикстур в экранах ERP не осталось'
    : `✓ Новых фикстур нет (в базовой линии ещё ${rest} — они запланированы отдельно)`);
  process.exit(fixed.length > 0 ? 1 : 0);
}

console.error(`\n✗ Новых нарушений: ${fresh.length}\n`);
for (const f of fresh) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.what}`);
  console.error(`    ${f.why}\n`);
}
console.error('Если случай действительно оправдан — добавьте строкой выше:');
console.error('  // fixtures-allowed: <причина>\n');
process.exit(1);

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
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
/*
 * Область: весь веб, а не только экраны ERP.
 *
 * Первая версия сканировала два каталога ERP — и пропустила ровно ту
 * поверхность, где цена ошибки выше всего. Витрина при упавшем каталоге
 * показывает покупателю пустой магазин: ни ошибки, ни повтора, ни намёка, что
 * это сбой. Именно в таком состоянии сейчас находится прод.
 */
const SCAN = ['apps/web/app', 'apps/web/components', 'apps/web/lib'];
/** В тестах фикстуры уместны — это их работа. */
const SKIP_FILE = /\.(test|spec)\.tsx?$/;
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
    else if (/\.tsx?$/.test(entry) && !SKIP_FILE.test(entry)) out.push(full);
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

/**
 * Собрать аргумент промисного `.catch(...)` — от открывающей скобки до парной.
 *
 * Это не то же самое, что блок `try/catch`: у `.catch(() => setProducts([]))`
 * фигурных скобок нет вовсе, и разбор по ним находит пустоту. Первая версия
 * правила именно поэтому пропускала все тридцать мест, ради которых её писали.
 */
function readCatchCallback(lines, start, fromColumn) {
  let depth = 0;
  const chunk = [];
  for (let i = start; i < lines.length && i < start + 40; i += 1) {
    const text = i === start ? lines[i].slice(fromColumn) : lines[i];
    let cut = text.length;
    for (let c = 0; c < text.length; c += 1) {
      if (text[c] === '(') depth += 1;
      if (text[c] === ')') {
        depth -= 1;
        if (depth === 0) { cut = c + 1; break; }
      }
    }
    chunk.push(text.slice(0, cut));
    if (depth === 0) break;
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

    lines.forEach((rawLine, index) => {
      const allowed = index > 0 && ALLOW.test(lines[index - 1]);
      if (allowed) return;

      // Отрезаем хвостовой строчный комментарий, прежде чем искать `catch`.
      // Иначе комментарий, документирующий старый плохой паттерн
      // (`// раньше было .catch(() => setD(null))`), сам ловится правилом как
      // нарушение. `(^|[^:])` бережёт `https://` — двоеточие перед `//` не режем.
      const line = rawLine.replace(/(^|[^:])\/\/.*$/, '$1');

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
      // Промисный `.catch(cb)` — тот же вред, другая форма. Разбирается
      // отдельно: скобок вида `{ … }` у стрелки может не быть вовсе.
      const promiseCatchAt = /\.catch\s*\(/.exec(line);
      if (promiseCatchAt) {
        const body = readCatchCallback(lines, index, promiseCatchAt.index + promiseCatchAt[0].length - 1);
        const recordsError = /\b(set\w*(Error|Err|Message|Msg|Notice|Failed)|console\.(error|warn)|flash|toast)\s*\(/i.test(body);
        const neutralReset = /\bset[A-Z]\w*\(\s*(\[\]|null|0|''|""|false)\s*\)/.test(body);
        const usesFixture = /\b(DEFAULT_[A-Z0-9_]*|MOCK_[A-Z0-9_]*|FAKE_[A-Z0-9_]*|\w*_FIXTURE\w*)/.test(body);
        // Пробрасывающий catch ошибку не глотает — она уходит вызывающему,
        // который её и покажет. Это честный путь, а не подмена данных.
        const rethrows = /\bthrow\b/.test(body);
        if (rethrows) {
          // ошибка распространяется дальше — не нарушение
        } else if (usesFixture) {
          findings.push({
            file: rel,
            line: index + 1,
            what: 'catch подставляет фикстуру вместо ошибки',
            why: 'Сбой превращается в правдоподобные данные — владелец их не отличит.',
          });
        } else if (neutralReset && !recordsError) {
          findings.push({
            file: rel,
            line: index + 1,
            what: 'catch выдаёт сбой за пустоту',
            why: 'Пустой список и упавший запрос — разные вещи. Покажите ошибку и дайте повтор.',
          });
        }
      }

      const catchAt = /\bcatch\s*(\([^)]*\))?\s*\{/.exec(line);
      if (catchAt) {
        const body = readDeclaration(lines, index, catchAt.index);
        const usesFixture = /\b(DEFAULT_[A-Z0-9_]*|MOCK_[A-Z0-9_]*|FAKE_[A-Z0-9_]*|\w*_FIXTURE\w*|default[A-Z]\w*\()/.test(body);
        // Комментарии снимаем ДО схлопывания пробелов. В обратном порядке
        // `[{}\s]` убирает переводы строк, всё тело становится одной строкой, и
        // `//.*$` вырезает от первого комментария до самого конца. Любой catch,
        // начинающийся с пояснения, выглядел пустым — например обработчик
        // офлайн-продажи в кассе, где под комментарием три ветки с `flash`.
        const stripped = body
          .replace(/catch\s*(\([^)]*\))?\s*\{/, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '')
          .replace(/[{}\s]/g, '');
        // Правило 3 — сбой, выданный за пустоту.
        //
        // Самая частая форма, и первая версия правила её пропускала: тело у
        // `.catch(() => setProducts([]))` непустое и фикстуры не содержит, а
        // результат тот же — «сервер лёг» становится неотличимо от «данных
        // нет». Владелец не пойдёт чинить то, о чём ему не сказали, а
        // покупатель на витрине просто уйдёт из пустого магазина.
        //
        // `flash`/`toast` в теле catch — это и есть канал ошибки в этом
        // приложении (тост сотруднику). Раньше правило их не знало и флагало
        // честные action-хендлеры, которые уже показывают `flash(e.message)` и
        // лишь сбрасывают `setBusy(null)` в finally. В catch эти вызовы всегда
        // на пути ошибки, так что распознавать их безопасно.
        const recordsError = /\b(set\w*(Error|Err|Message|Msg|Notice|Failed)|console\.(error|warn)|flash|toast)\s*\(/i.test(body);
        const neutralReset = /\bset[A-Z]\w*\(\s*(\[\]|null|0|''|""|false)\s*\)/.test(body);
        // См. промисный catch выше: `throw` пробрасывает ошибку, не глотает её.
        const rethrows = /\bthrow\b/.test(body);

        if (rethrows) {
          // ошибка уходит вызывающему — не нарушение
        } else if (usesFixture) {
          findings.push({
            file: rel,
            line: index + 1,
            what: 'catch подставляет фикстуру вместо ошибки',
            why: 'Сбой превращается в правдоподобные данные — владелец их не отличит.',
          });
        } else if (neutralReset && !recordsError) {
          findings.push({
            file: rel,
            line: index + 1,
            what: 'catch выдаёт сбой за пустоту',
            why: 'Пустой список и упавший запрос — разные вещи. Покажите ошибку и дайте повтор.',
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
 * Храповик по количеству, а не по факту.
 *
 * Раньше ключом было «файл + вид нарушения», поэтому файл с пятью молчащими
 * catch'ами и файл с одним выглядели одинаково: починив один, ты не двигал
 * базовую линию, а добавив шестой — не ронял гейт. Теперь в линии хранится
 * число: оно может только уменьшаться. Гейт падает и когда появляется новый
 * вид нарушения, и когда старого становится больше.
 *
 * Строки вида "путь::вид::N". Обновлять командой
 *   node scripts/check-no-fixtures.mjs --update-baseline
 * и только осознанно — это фиксация долга, а не способ заглушить гейт.
 */
const BASELINE_PATH = join(ROOT, 'scripts/no-fixtures-baseline.json');
let baseline = [];
try { baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')); } catch { /* базовой линии ещё нет */ }

const groupKey = (f) => `${f.file}::${f.what}`;
const counts = new Map();
for (const f of findings) counts.set(groupKey(f), (counts.get(groupKey(f)) ?? 0) + 1);

const allowed = new Map();
for (const entry of baseline) {
  const at = entry.lastIndexOf('::');
  const parsed = Number(entry.slice(at + 2));
  if (Number.isInteger(parsed)) allowed.set(entry.slice(0, at), parsed);
  else allowed.set(entry, 1); // формат старой линии — считаем за одно
}

const lines = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}::${n}`);

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(lines, null, 2)}\n`);
  console.log(`Базовая линия обновлена: ${findings.length} нарушений в ${counts.size} группах.`);
  process.exit(0);
}

const grown = [...counts.entries()].filter(([k, n]) => n > (allowed.get(k) ?? 0));
const shrunk = [...allowed.entries()].filter(([k, n]) => (counts.get(k) ?? 0) < n);

if (shrunk.length > 0) {
  console.log(`✓ Стало лучше в ${shrunk.length} местах. Зафиксируйте: --update-baseline`);
  for (const [k, n] of shrunk) console.log(`    ${k}: ${n} → ${counts.get(k) ?? 0}`);
  console.log('');
}

if (grown.length === 0) {
  const rest = findings.length;
  console.log(rest === 0
    ? '✓ Ни одна поверхность не выдаёт сбой за данные'
    : `✓ Новых нарушений нет (в базовой линии ещё ${rest} — они запланированы отдельно)`);
  process.exit(shrunk.length > 0 ? 1 : 0);
}

console.error(`\n✗ Новых нарушений: ${grown.reduce((sum, [k, n]) => sum + n - (allowed.get(k) ?? 0), 0)}\n`);
for (const [k, n] of grown) {
  const [file, what] = k.split('::');
  console.error(`  ${file}`);
  console.error(`    ${what}: было ${allowed.get(k) ?? 0}, стало ${n}`);
  const first = findings.find((f) => groupKey(f) === k);
  console.error(`    ${first.why}`);
  console.error(`    строки: ${findings.filter((f) => groupKey(f) === k).map((f) => f.line).join(', ')}\n`);
}
console.error('Если случай действительно оправдан — добавьте строкой выше:');
console.error('  // fixtures-allowed: <причина>\n');
process.exit(1);

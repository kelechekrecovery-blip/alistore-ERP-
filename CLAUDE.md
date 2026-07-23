# AliStore ERP — руководство для агента

Операционная система для розницы электроники в Кыргызстане: интернет-витрина +
приложение сотрудника + POS + ERP владельца. Один бэкенд, ядро — append-only
**Event Ledger** (`AuditEvent`): деньги/сток/статусы пишутся транзакционно.
Стек: **NestJS 11 + Prisma 5 + PostgreSQL** (`apps/api`), **Next.js 16** (`apps/web`),
iOS/Android. Монорепо на npm workspaces.

## Как здесь работают (project skills)

Перед задачей проверь релевантный скилл в `.claude/skills/`:

- **writing-plans** — план перед нетривиальной работой (один вертикальный срез, acceptance-first).
- **test-driven-development** — RED→GREEN→REFACTOR: тест до реализации.
- **executing-plans** — исполнение плана по задачам через TDD, один срез = один коммит.
- **systematic-debugging** — 4 фазы root-cause: воспроизвести → изолировать → причина → фикс+verify.
- **verification-before-completion** — реальные гейты перед «готово».

## Проектные сабагенты (`.claude/agents/`)

Узкие специалисты под этот стек (авто-подбор по контексту или явным упоминанием):

- **nestjs-ledger-engineer** — бэкенд-фичи apps/api: Event Ledger, `audit.transaction`, advisory-lock, RBAC, idempotency, TDD.
- **storefront-web-developer** — apps/web (Next.js витрина/ERP): server-authoritative данные, desktop/mobile-зеркала, токены.
- **ai-layer-engineer** — apps/api/src/ai: нейтральный LlmClient-порт, structured output, keyless-fallback, ai:eval.
- **ledger-security-reviewer** — read-only ревью: RBAC/IDOR, атомарность леджера, idempotency, утечки ключей.
- **prisma-migration-reviewer** — read-only ревью схемы/миграций: инварианты-первыми, индексы, uniques, дрейф истории.
- **e2e-acceptance-engineer** — jest-интеграция + Playwright по ролям (хелперы `e2e/helpers.ts`, Postgres-предусловие).

## Оркестрация: ruflo ведёт (с 22.07.2026)

**ruflo — слой оркестрации по умолчанию.** Для многоагентных задач, координации
роёв, памяти агентов, роутинга задача→агент, декомпозиции воркфлоу — сначала бери
ruflo (скилл `ruflo`, его `swarm`/`memory`/`hooks`, `.claude-flow/` рантайм).

**Граница жёсткая — ruflo координирует, но не пишет доменный код.** Любое изменение
`apps/api` / `apps/web`, затрагивающее деньги/сток/статусы/Event Ledger, идёт через
проектные скиллы и сабагентов выше (**test-driven-development**, **writing-plans**,
**verification-before-completion**, **nestjs-ledger-engineer**, **ledger-security-reviewer**).
Они знают `audit.transaction`, advisory-lock, idempotency — агенты ruflo не знают.
При конфликте «как делать код» проектные скиллы важнее ruflo.

**Факты установки (режим сосуществования):** `.claude/settings.json` → `permissions.allow`
разрешает `npx claude-flow*` и `mcp__claude-flow__*`; рантайм (`.claude-flow/`, `.swarm/`,
`ruvector.db`, `skills-lock.json`) под `.gitignore` — не коммитим. MCP-сервер ruflo
в `.mcp.json` **не** зарегистрирован. **Фоновый демон может авто-подниматься сам**
(`config.yaml → hooks.autoExecute: true`) при вызовах `npx ruflo` — держим его погашенным,
т.к. он сканирует то же дерево, что и Codex. Перед выводом «дерево тихое» проверяй
`ruflo daemon status` (и `ps aux | grep "daemon start"`); гасить — `npx ruflo daemon stop`.
Полное удаление: `npx ruflo@latest cleanup`.

## Команды (это правда — сверено)

| Задача | Команда |
|---|---|
| API — один спек | `cd apps/api && NODE_PATH=./node_modules npx jest --runInBand --testPathPattern <name>` |
| API — все тесты, как в CI | `npm run api:test` (один процесс, `--runInBand`) — `ci.yml:72` |
| API — все тесты, как в `mvp:verify` | `node scripts/run-api-test-batches.mjs` (один спек-файл на процесс) — `mvp-verify.mjs:41` |
| Typecheck API | `npx tsc --noEmit -p apps/api/tsconfig.json` |
| Typecheck web | `npx tsc --noEmit -p apps/web/tsconfig.json` |
| Build API | `npm run api:build` |
| Build web | `npm run build -w @alistore/web` |
| E2E (Playwright) | `npm run e2e` (сам поднимает API:4200/web:3200) |
| Быстрый гейт | `npm run mvp:verify -- --skip-e2e` |
| Полный / релиз | `npm run mvp:verify` / `npm run mvp:verify -- --strict-external` |
| Acceptance-аудит | Committed-HEAD bootstrap из `docs/TRUSTED-ECOSYSTEM-GATE.md` |
| API — свой изолированный прогон | `npm run api:test:isolated [-- <аргументы jest>]` — клон БД из шаблона, не мешает чужим прогонам |
| Схема в test-БД (разово) | `DATABASE_URL="…/alistore_test?schema=public" npm exec -w @alistore/api -- prisma migrate deploy` **плюс** `node apps/api/scripts/postdeploy-indexes.mjs`. **Не `db push`** — он создаёт схему с 0 из 33 триггеров, которые ставят 7 миграций кастомным SQL; замерено — этот путь один дал 20 фантомных падений |

## Предусловия и особенности (не удивляйся)

- **Живой Postgres обязателен** для `apps/api` jest и e2e (`test/setup-db.ts` beforeAll
  подключается). БД: `alistore_dev` / `alistore_test`. Нет БД → тесты падают на старте,
  а не в ассертах.
- **Два разных гейта, и они расходятся.** CI гоняет `npm run api:test` — один процесс,
  `--runInBand` (`ci.yml:72`). `mvp:verify` гоняет батчер — один спек-файл на процесс
  (`mvp-verify.mjs:41`), чтобы сьюты не наследовали фикстуры друг друга. Прогон одного
  ничего не говорит о другом; перед релизом нужны оба.
- **Прогон на общей БД одинок по определению — но одиночество больше не обязательно.**
  Сьюты делят одну БД и чистят фикстуры голым `deleteMany()`: 1207 вызовов в 114 спек-файлах,
  73 из них стирают `AuditEvent` целиком. Параллельный второй прогон по той же
  `alistore_test` даёт **мусорный результат**: чужой `deleteMany` попадает между `findFirst`
  и `FOR UPDATE`. Измерено 23.07 в лоб, одна машина, один момент, один и тот же набор из
  7 сьютов: **на общей базе** два прогона дали `4 failed / 24 упавших` и `4 failed / 22`
  (числа расходятся между собой — это шум, а не дефект); **изолированно** оба дали `7/7`
  и `40/40`. Красный из конфликта не диагноз.
  Поэтому: **`npm run api:test:isolated`** (`scripts/run-isolated-api-tests.mjs`) — клонирует
  свою БД из шаблона `alistore_test_template` (`CREATE DATABASE … TEMPLATE`, меньше секунды),
  гоняет, удаляет. Принимает любые аргументы jest, `--keep` оставляет базу для разбора.
  Изолирует и `pg_advisory_xact_lock`, который **database-scoped, не schema-scoped** — схема
  на процесс от него не спасает. Общий `npm run api:test` оставлен как есть: это то, что
  гоняет CI.
- **Порядок сьютов закреплён** (`test/alphabetic-sequencer.js`). Дефолтный секвенсер jest
  сортирует по кэшу длительности, а на холодном кэше — по размеру файла, поэтому один и тот
  же коммит шёл разными порядками. С протекающим состоянием это давало разный результат:
  прогон 1 — 983/983, прогон 2 — пять падений в `reports-money-truth`, который в одиночку
  проходит 5/5. Сортировка по пути убирает **этот** источник; протечки она не лечит.
- **Детерминированным гейт всё равно не стал — замерено.** Пять полных изолированных
  прогонов на одном коммите: три раза `210/210` и `1265/1265`, один раз упали `hr` +
  `import-guard` (2 теста), ещё один — `service-loaner` (1 тест: `404` на займе, который
  строкой выше выдался `201`). Каждый раз **разные** сьюты. То есть примерно 40% прогонов
  показывают 1–2 флакующих теста. Практический вывод: **один зелёный прогон ничего не
  доказывает — повторяй**; и наоборот, 1–2 красных теста в несвязанных сьютах сначала
  перепроверяй повтором, а диагностируй как дефект только если повторились. Открытые
  флаки заведены в `BACKLOG.md` (`FLAKE-*`).
- **Playwright e2e бьётся о ту же БД.** `playwright.config.ts:6-9` резолвит
  `E2E_DATABASE_URL ?? DATABASE_URL ?? alistore_test` — по умолчанию это **та же база**,
  что у jest. Замерено 23.07: полный прогон при работающем рядом jest дал `7 failed /
  132 passed`; все семь перепроверены в изолированной БД и **прошли** (`web-checkout` 7/7,
  `storefront-motion` + `web-route-audit` 52/52) — то есть были чистой контаминацией.
  Чтобы прогнать e2e честно при занятой машине, поднимай свою базу и порты:
  `E2E_DATABASE_URL=postgresql://alistore@localhost:5432/<имя>_test?schema=public`
  `E2E_API_PORT=4310 E2E_WEB_PORT=3310 npx playwright test …`
  Имя БД обязано содержать `test` как отдельное слово — иначе предохранитель
  `e2e/helpers.ts:135` откажет в очистке.
- **Нет ESLint и Prettier.** Единственный статический гейт — **`tsc`** (+ `prisma validate`).
  Не ссылайся на lint/format — их нет. Нет enforced coverage %.
- `mvp:verify` бросает без `TEST_DATABASE_URL` и не ресетит БД без «test» в имени.
- **External-readiness не блокирует:** зелёный `mvp:verify` ≠ launch-ready (`docs/READINESS.md` 🟡).
- Рабочее дерево может параллельно править другой инструмент — `git status` перед выводами.
- Итоги пиши в существующие журналы: `PROGRESS.md` / `BACKLOG.md` / `docs/READINESS.md`
  (не заводи новый changelog). Один вертикальный срез = один коммит.

Подробный контракт: `docs/MASTER-ENGINEERING-PROMPT.md`, `CODEX_PROMPT.md`.
Authoritative «что должно пройти»: `scripts/mvp-verify.mjs` и CI `.github/workflows/ci.yml`.

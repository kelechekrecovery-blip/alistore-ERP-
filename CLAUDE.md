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
| Схема в test-БД (разово) | `DATABASE_URL="postgresql://alistore@localhost:5432/alistore_test?schema=public" npm exec -w @alistore/api -- prisma db push --skip-generate` |

## Предусловия и особенности (не удивляйся)

- **Живой Postgres обязателен** для `apps/api` jest и e2e (`test/setup-db.ts` beforeAll
  подключается). БД: `alistore_dev` / `alistore_test`. Нет БД → тесты падают на старте,
  а не в ассертах.
- **Два разных гейта, и они расходятся.** CI гоняет `npm run api:test` — один процесс,
  `--runInBand` (`ci.yml:72`). `mvp:verify` гоняет батчер — один спек-файл на процесс
  (`mvp-verify.mjs:41`), чтобы сьюты не наследовали фикстуры друг друга. Прогон одного
  ничего не говорит о другом; перед релизом нужны оба.
- **Любой прогон API-тестов одинок по определению.** Сьюты делят одну БД и чистят фикстуры
  голым `deleteMany()`: 1175 вызовов в 108 спек-файлах, 72 из них стирают `AuditEvent`
  целиком. **Если параллельно идёт второй прогон** — другой агент, второй терминал, CI по
  той же `alistore_test` — **результат мусорный**: чужой `deleteMany` попадает между
  `findFirst` и `FOR UPDATE` и роняет посторонние сьюты. Красный отсюда не диагноз, а шум:
  проверено — коммит давал PASS 18/18 в одиночку и два FAIL под конфликтом.
  Перед разбором падения: `ps aux | grep -e jest -e "playwright test"`, затем перепроверь
  одиночным `--testPathPattern` — детерминированный баг падает и в одиночку.
- **Нет ESLint и Prettier.** Единственный статический гейт — **`tsc`** (+ `prisma validate`).
  Не ссылайся на lint/format — их нет. Нет enforced coverage %.
- `mvp:verify` бросает без `TEST_DATABASE_URL` и не ресетит БД без «test» в имени.
- **External-readiness не блокирует:** зелёный `mvp:verify` ≠ launch-ready (`docs/READINESS.md` 🟡).
- Рабочее дерево может параллельно править другой инструмент — `git status` перед выводами.
- Итоги пиши в существующие журналы: `PROGRESS.md` / `BACKLOG.md` / `docs/READINESS.md`
  (не заводи новый changelog). Один вертикальный срез = один коммит.

Подробный контракт: `docs/MASTER-ENGINEERING-PROMPT.md`, `CODEX_PROMPT.md`.
Authoritative «что должно пройти»: `scripts/mvp-verify.mjs` и CI `.github/workflows/ci.yml`.

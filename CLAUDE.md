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

## Команды (это правда — сверено)

| Задача | Команда |
|---|---|
| API — один спек | `cd apps/api && NODE_PATH=./node_modules npx jest --runInBand --testPathPattern <name>` |
| API — все тесты | `npm run api:test` |
| Typecheck API | `npx tsc --noEmit -p apps/api/tsconfig.json` |
| Typecheck web | `npx tsc --noEmit -p apps/web/tsconfig.json` |
| Build API | `npm run api:build` |
| Build web | `npm run build -w @alistore/web` |
| E2E (Playwright) | `npm run e2e` (сам поднимает API:4200/web:3200) |
| Быстрый гейт | `npm run mvp:verify -- --skip-e2e` |
| Полный / релиз | `npm run mvp:verify` / `npm run mvp:verify -- --strict-external` |
| Acceptance-аудит | `npm run ecosystem:audit` |
| Схема в test-БД (разово) | `DATABASE_URL="postgresql://alistore@localhost:5432/alistore_test?schema=public" npm exec -w @alistore/api -- prisma db push --skip-generate` |

## Предусловия и особенности (не удивляйся)

- **Живой Postgres обязателен** для `apps/api` jest и e2e (`test/setup-db.ts` beforeAll
  подключается). БД: `alistore_dev` / `alistore_test`. Нет БД → тесты падают на старте,
  а не в ассертах.
- **Нет ESLint и Prettier.** Единственный статический гейт — **`tsc`** (+ `prisma validate`).
  Не ссылайся на lint/format — их нет. Нет enforced coverage %.
- `mvp:verify` бросает без `TEST_DATABASE_URL` и не ресетит БД без «test» в имени.
- **External-readiness не блокирует:** зелёный `mvp:verify` ≠ launch-ready (`docs/READINESS.md` 🟡).
- Рабочее дерево может параллельно править другой инструмент — `git status` перед выводами.
- Итоги пиши в существующие журналы: `PROGRESS.md` / `BACKLOG.md` / `docs/READINESS.md`
  (не заводи новый changelog). Один вертикальный срез = один коммит.

Подробный контракт: `docs/MASTER-ENGINEERING-PROMPT.md`, `CODEX_PROMPT.md`.
Authoritative «что должно пройти»: `scripts/mvp-verify.mjs` и CI `.github/workflows/ci.yml`.

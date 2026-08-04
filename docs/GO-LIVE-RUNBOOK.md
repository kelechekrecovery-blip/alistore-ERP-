# AliStore — Go-Live Runbook

Turnkey commands for the full ecosystem release. Prepared 2026-07-19. Everything an
agent could do is committed; the steps below need owner credentials/approval (Render,
Apple, prod DB) and are copy-paste ready. Tracked checklist: see the release-plan artifact.

Branch ready to ship: **`claude/storefront-upgrade`** (off `origin/main`, tsc-clean) —
prod API-base self-heal + a11y + 18-product photo catalog + hero/benefits + device renders.

---

## Phase 0 — Storefront go-live (ali.kg)

### 1. Merge the branch
Open + merge the PR (recommended — keeps clean history vs the concurrent Codex branch):
`https://github.com/kelechekrecovery-blip/alistore-ERP-/pull/new/claude/storefront-upgrade`

> Note: pushing to `main` triggers the staging CD (`.github/workflows/cd-staging.yml`)
> and Render auto-deploy on connected branches. Production stays a **manual** approval.

### 2. Render deploy (owner)
- In the Render **web** service env, set: `NEXT_PUBLIC_API_BASE=https://api.ali.kg/api`
  (belt-and-suspenders; `apps/web/lib/api/http.ts` also self-heals from the origin).
- Deploy `apps/web` and `apps/api`; approve the production deploy.

### 3. Наполнить боевой каталог (владелец) — только через ERP

**Демо-сидера больше нет.** Прежняя редакция этого шага предписывала запустить
`npm run db:seed` против боевой `DATABASE_URL`. Это залило бы в продакшен 18
выдуманных товаров с фиктивными IMEI, демо-клиентов, демо-отзывы и служебные
учётки `demo.*` — в отчётах и Event Ledger они неотличимы от настоящих продаж.
Сидер удалён вместе со скриптом `db:seed`; команда больше не существует.

Порядок наполнения с нуля:

1. **Первый вход.** Сотрудников в чистой базе нет. Проверить
   `GET /api/staff-auth/bootstrap-status` → если `needsBootstrap: true`, создать
   первого владельца через `POST /api/staff-auth/bootstrap` (логин + пароль,
   пароль от 8 символов). Эндпоинт работает ровно один раз — пока в базе ноль
   сотрудников; дальше он отвечает `staff_already_bootstrapped`. Готовые
   curl-команды и блокер по входу ревьюера в клиентское приложение —
   `OWNER-LAUNCH-CHECKLIST` §4.
2. **Сотрудники.** Владелец заводит остальных в ERP (роли `seller`, `courier`,
   `cashier`). Здесь же создаются учётки для ревью Apple — см.
   `OWNER-LAUNCH-CHECKLIST`.
3. **Каталог.** Товары, цены, категории и себестоимость — через ERP (Товары).
4. **Остатки.** Единицы с реальными IMEI заводятся **приёмкой на склад**, а не
   вручную в БД: только так серийный учёт и Event Ledger сойдутся.
5. **Витрина.** Hero, подборки и блоки — через Marketing CMS. Фото товаров
   загружаются в ERP; складывать файлы в репозиторий не нужно.

### 4. Verify (agent can run on request, once prod is up)
```bash
npx playwright test --config playwright.prod-smoke.config.ts
```
Expect: catalog populated, no `localhost:4000` calls, `/catalog`+`/privacy` = 200,
no ≤389px header overflow.

---

## Phase 2 — Live providers (for real transactions)
Set these in the Render api service env (owner secrets); `docs/READINESS.md` gates 🟡:
- Payment gateway prod keys · SMS/OTP provider · APNs production certs.
- Optional AI: `AI_PROVIDER_KEY` + `AI_MODEL` (keyless rules-fallback works without).

---

## Phase 3 — iOS App Store (Client `kg.alistore.client`)
Engineering complete (v1.0.0, iPad screenshots, orientations, /privacy+/support,
credential-free preflight). Remaining, per `apps/ios/store/release-runbook.md`:
1. Fill `apps/ios/.env.production` — `DEVELOPMENT_TEAM`, `ASC_KEY_ID` + `AuthKey_<KEYID>.p8`, `ASC_ISSUER_ID`.
2. Create the App Store Connect record (`kg.alistore.client`, ru-KG, Shopping) + review demo account.
3. `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run ios:store-preflight -- --env-file apps/ios/.env.production --strict-asc --strict-signing`
4. Archive → upload → submit (per the iOS runbook).
Staff / Courier / POS → TestFlight or Apple Business Manager (internal).

---

## Rollback
Render → service → Events → **Rollback** on the previous successful deploy
(re-runs `prisma migrate deploy`, a no-op on an already-migrated DB). Never reverse a
data-bearing migration during an image rollback — ship a forward migration instead.

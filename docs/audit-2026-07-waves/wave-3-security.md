# План устранения девяти находок AppSec — alistore-erp

Порядок исполнения: сначала три серверных среза (дёшево, не меняют поведение прода,
закрывают прямое раскрытие ПДн), затем 3.4 (меняет поведение прода), затем пять
клиентских.

Сквозные факты, проверенные по репозиторию (нужны исполнителю до начала):

- Статический гейт — только `tsc` + `prisma validate`. ESLint/Prettier нет.
- `npm run test -w @alistore/web` (vitest) **не запускается ничем** — ни
  `scripts/mvp-verify.mjs`, ни `.github/workflows/ci.yml`. Восемь существующих
  vitest-файлов (`apps/web/lib/*.test.ts`) висят мёртвым грузом. Любой барьер в
  vitest декоративен, пока шаг не добавлен (см. Срез 4, задача 8).
- `npm run ios:test` и `npm run android:test` тоже не в CI. Нативные тесты в
  срезах 5–9 не запускаются автоматически (см. «Чего не смог проверить»).
- Образец кросс-поверхностного статического барьера в репозитории:
  `scripts/validate-deeplink-contract.mjs` (в CI: `npm run native:deeplink-preflight`)
  и `scripts/check-no-fixtures.mjs` (в `mvp:verify`). Это правильная форма для
  всего, что нельзя проверить тестом.

---

### Срез 1 — Evidence больше не раздаётся с диска (3.2)

**Зависит от:** ничего.

**Severity и почему здесь в очереди:** CRITICAL. Единственная находка, дающая
неаутентифицированное чтение фото паспорта посторонним: `GET https://<host>/uploads/evidence/tradein/<id>/<key>.webp`
минует `assertStaffCanRead`, `assertCustomerOwnsEntity` и запись доступа в леджер
(`evidence.controller.ts:27-62`). Первой, потому что фикс — три локальных изменения
и один новый preflight-чек, ничего в поведении сотрудников не ломает.

**Acceptance (пишется первым):**

1. `apps/api/test/media-storage-contract.spec.ts` (новый) — контрактный набор,
   прогоняемый через `describe.each` по **всем** реализациям `MediaStorage`
   (`LocalDiskStorage`, `S3Storage` с замоканным presigner):
   - `it('never returns a permanent URL for an evidence object')` — два вызова
     `getReadUrl('evidence/tradein/t1/a.webp')` не равны друг другу и не равны
     `${MEDIA_PUBLIC_BASE}/evidence/tradein/t1/a.webp`.
   - `it('returns a URL that carries an expiry within EVIDENCE_SIGNED_URL_TTL_SECONDS')`.
   - `it('keeps non-evidence keys on the plain public base')` — товарные картинки
     не должны стать подписанными, иначе витрина перестанет кешироваться.
2. `apps/api/test/media-mount.spec.ts` (новый) —
   `it('mounts static assets on the public media subtree only')`: новая чистая
   функция `resolveStaticMediaMount(env)` возвращает
   `{ root: join(MEDIA_LOCAL_DIR,'public'), prefix: MEDIA_PUBLIC_BASE }`, и
   `it('never returns a root that contains the evidence subtree')`.
3. `apps/api/test/production-preflight.spec.ts` (существующий, добавить) —
   `it('blocks production when evidence media is served from local disk')`:
   `buildProductionPreflightReport` с `MEDIA_STORAGE=local` даёт
   `status: 'blocked'` и `media_storage` в `nextActions`.
4. `apps/api/test/evidence.e2e-spec.ts` (существующий, добавить) —
   `it('hands out a read URL that is not the raw static path')`.

**Файлы:**

- `apps/api/src/media/storage/local-disk.storage.ts:16-42` → конструктор считает
  два корня: `publicRoot = join(dir,'public')`, `privateRoot = join(dir,'private')`.
  `put()` пишет ключи с префиксом `evidence/` в `privateRoot`, остальное — в
  `publicRoot`. `getReadUrl(key)`: для `evidence/` — вернуть
  `${apiBase}/api/evidence/objects/${token}`, где `token` — JWT над `{ key }` с
  `expiresIn = EVIDENCE_SIGNED_URL_TTL_SECONDS`, issuer/audience по образцу
  `apps/api/src/auth/guest-capability.ts:26-30`; для остального — прежний
  `${publicBase}/${key}`.
- `apps/api/src/evidence/evidence.controller.ts` → новый роут
  `@Get('objects/:token')`, который верифицирует токен (`verify` с тем же
  issuer/audience), читает файл из `privateRoot` и стримит его. Без валидного
  токена — 404, не 401 (существование объекта не должно быть наблюдаемо).
- `apps/api/src/config/runtime-security.ts` → добавить
  `export function resolveStaticMediaMount(env: RuntimeEnvReader)` рядом с
  `resolveTrustProxy`/`resolveAllowedHosts`.
- `apps/api/src/main.ts:23-25` → `const mount = resolveStaticMediaMount(env);
  app.useStaticAssets(mount.root, { prefix: mount.prefix });`
  Больше `process.env.MEDIA_LOCAL_DIR` в `main.ts` не встречается.
- `apps/api/src/health/production-preflight.ts:54-190` → новый `CheckDefinition`
  в массиве `CHECKS`:
  `{ id: 'media_storage', area: 'security', title: 'Evidence media is object-store backed',
     requiredEnv: ['MEDIA_STORAGE','S3_PUBLIC_BASE','EVIDENCE_SIGNED_URL_TTL_SECONDS'],
     evaluate: (env) => env('MEDIA_STORAGE')?.trim().toLowerCase() === 's3' ? 'ready' : 'unsafe' }`.
- `infra/RUNBOOK.md:43` → убрать `MEDIA_PUBLIC_BASE=https://api.ali.kg/uploads`:
  строка прямо инструктирует раздавать каталог со статикой.

**Барьер против возврата:** контрактный спек `media-storage-contract.spec.ts`
привязан к списку реализаций `MediaStorage`, а не к одному классу — любая новая
реализация (R2, GCS) обязана пройти те же три `it`, иначе падает. Плюс
`media_storage` в `assertProductionRuntimeReady`: контейнер с `MEDIA_STORAGE=local`
в production не стартует вообще (`main.ts:17`), так что конфигурационный возврат
дефекта невозможен, а не «маловероятен».

**Переиспользовать:**
- `apps/api/src/auth/guest-capability.ts:26-30,73-95` — ровно тот же приём
  «короткоживущая подписанная capability на объект», включая issuer/audience и
  проверку `entity`. Токен объекта — четвёртый scope того же механизма.
- `apps/api/src/config/runtime-security.ts:44-63` (`resolveTrustProxy`) — форма
  «чистый резолвер env → значение + unit-тест», в неё же кладём
  `resolveStaticMediaMount`.
- `apps/api/src/health/production-preflight.ts:195-217` (`assertProductionRuntimeReady`)
  — готовый механизм отказа от старта.
- `apps/api/src/media/storage/s3.storage.ts:60-67` — эталон поведения
  `getReadUrl` (evidence подписывается, остальное нет). Локальный диск должен
  повторять этот контракт, а не иметь свой.

**НЕ делать в этом срезе:** не мигрировать уже лежащие объекты (в проде
`MEDIA_STORAGE=s3`, на диске ничего нет — `render.yaml:230`); не трогать
presigner S3; не вводить CDN; не менять `media.controller.ts` (товарные картинки
остаются публичными намеренно).

---

### Срез 2 — Классификация ПДн становится fail-closed (3.1)

**Зависит от:** Среза 1 (без него удалённый объект всё равно оставался бы читаемым
по статическому URL до истечения кеша, и тест на удаление ничего не доказывал бы).

**Severity и почему здесь в очереди:** HIGH. Не даёт прямого доступа, но означает,
что фото паспорта хранится бессрочно: ни один клиент не шлёт ни одну из пяти
меток. Проверено — реально отправляются `buyback_evidence`
(`apps/ios/Staff/StaffScannerView.swift:269`), `tradein_device`
(`apps/ios/Client/AliStoreClientApp.swift:3497`), `loaner_issue`/`loaner_return`
(`apps/web/components/erp/ServiceCenterView.tsx:273,286,321`) и произвольный текст
из поля (`StaffScannerView.swift:294`). Ни одна не входит в `PII_LABELS`.

**Acceptance (пишется первым):**

1. `apps/api/test/evidence-retention.spec.ts` (существующий, переписать):
   - `it('classifies every unrecognised trade-in evidence label as PII')` —
     `decideEvidenceRetention(config,'tradein','buyback_evidence',t)` даёт
     `isPii === true` и `retentionUntil = t + 365d`.
   - `it('classifies an empty trade-in label as PII')` — `null` и `''` тоже.
   - `it('keeps only explicitly allowlisted trade-in device photos non-PII')` —
     `tradein_device` → `isPii === false`.
   - `it('leaves non-tradein entity types unclassified')` — регрессия на
     существующее поведение (`warranty`/`passport_front` остаётся `false`).
2. `apps/api/test/evidence.e2e-spec.ts` (существующий, добавить) —
   `it('stamps a retention deadline on the label the Staff app actually sends')`:
   загрузка с `entityType='tradein'`, `label='buyback_evidence'` → строка
   `EvidenceUpload` с `isPii=true` и непустым `retentionUntil`; затем
   `EvidenceRetentionService.runDuePurges()` с подкрученным `retentionUntil` в
   прошлое удаляет объект и пишет `EventType.EvidencePurged`.
3. `apps/api/test/evidence-retention-backfill.spec.ts` (новый) —
   `it('reclassifies trade-in uploads stored before the policy inversion')`:
   строка с `entityType='tradein'`, `isPii=false`, `retentionUntil=null`,
   `createdAt` год назад после прогона backfill получает `isPii=true` и
   `retentionUntil = createdAt + 365d` (то есть немедленно попадает под сweep).

**Файлы:**

- `apps/api/src/evidence/evidence-retention.policy.ts:10-16` → `PII_LABELS`
  заменяется на `NON_PII_TRADEIN_LABELS = new Set(['tradein_device','device_front','device_back','device_screen','device_imei'])`
  (собрано из фактических отправителей; список экспортируется).
- `apps/api/src/evidence/evidence-retention.policy.ts:42` →
  `const isPii = entityType === 'tradein' && !NON_PII_TRADEIN_LABELS.has(normalized);`
  Комментарий в шапке (`:29-33`) переписать: политика теперь «всё в trade-in —
  ПДн, пока явно не доказано обратное».
- `apps/api/src/evidence/evidence.dto.ts:29-31` → `@IsString()` дополнить
  `@MaxLength(64)` и `@Matches(/^[a-z0-9_]*$/)`. Не `@IsIn`: жёсткий enum сломает
  уже установленные приложения, а fail-closed-политика делает enum ненужным для
  безопасности.
- `apps/ios/Staff/StaffScannerView.swift:32,294` → `styledTextField("Метка фото")`
  заменить на `Picker` по общему списку меток; `:269` оставить как есть
  (`buyback_evidence` теперь классифицируется как ПДн корректно).
- Backfill: `apps/api/prisma/migrations/<ts>_evidence_reclassify_tradein_pii/migration.sql`
  — `UPDATE "EvidenceUpload" SET "isPii" = true, "retentionUntil" = "createdAt" + interval '365 days'
  WHERE "entityType" = 'tradein' AND "purgedAt" IS NULL AND "isPii" = false
  AND lower(coalesce("label",'')) NOT IN (<allowlist>);`
- `docs/PII-EVIDENCE-RETENTION.md:3-9` → раздел Scope переписать: сейчас он
  документирует ровно тот пятиметочный список, который никогда не срабатывал.

**Барьер против возврата:** сам инвертированный дефолт и есть барьер класса —
любая новая метка, любой новый клиент, любая опечатка попадает в «ПДн, удалить
через срок», а не в «хранить вечно». Дополнительно
`scripts/check-evidence-labels.mjs` (в `mvp:verify`): проходит по `apps/ios`,
`apps/android`, `apps/web`, собирает строковые литералы, передаваемые как `label`
в загрузку evidence, и падает, если метка для `tradein` попала в
`NON_PII_TRADEIN_LABELS` без записи в `docs/PII-EVIDENCE-RETENTION.md`.
Форма — `scripts/validate-deeplink-contract.mjs`.

**Переиспользовать:**
- `decideEvidenceRetention` и вызов на `apps/api/src/evidence/evidence.service.ts:41`
  (политика уже присваивается сервером, клиент на неё не влияет — менять
  архитектуру не нужно, только правило).
- `apps/api/src/evidence/evidence-retention.service.ts:36-118` — sweep уже
  корректен (claim + backoff + `EvidencePurged`); он просто никогда не находил
  кандидатов.
- `scripts/validate-deeplink-contract.mjs` — шаблон кросс-поверхностной проверки
  строковых контрактов между API / web / iOS / Android.

**НЕ делать в этом срезе:** не менять срок хранения и не трогать
`EVIDENCE_PII_RETENTION_DAYS`; не расширять политику на `warranty`/`service`/`order`
(документ прямо оставляет это на юридическое решение); не вводить enum меток в DTO.

---

### Срез 3 — Вебхук возвратов перестаёт быть публичным (3.3)

**Зависит от:** ничего.

**Severity и почему здесь в очереди:** CRITICAL по механике, сегодня смягчён
конфигурацией. `POST /api/refunds/webhooks/provider` без `@UseGuards` и `@Throttle`
(`refund-webhooks.controller.ts:11-30`) вызывает `verifyRefundWebhook`, который у
песочницы проверяет только форму (`sandbox-payment-gateway.provider.ts:59-65`), и
дальше идёт `reconcileProviderRefund` — перевод аллокации возврата в `succeeded`.
Сейчас в проде `PAYMENT_PROVIDER=none` (`render.yaml:186`), и
`NonePaymentGatewayProvider.verifyRefundWebhook` бросает 503 до всякой логики —
поэтому не первый. На staging `PAYMENT_PROVIDER=sandbox`
(`infra/render.staging.yaml`), там дыра открыта уже сейчас.

**Acceptance (пишется первым):** `apps/api/test/refund-webhook-auth.e2e-spec.ts` (новый)

- `it('answers 404 when the configured provider issues no refund webhooks')` —
  `PAYMENT_PROVIDER=none` → 404, а не 503 (доступность роута не наблюдаема).
- `it('rejects a sandbox refund webhook without a signature header')` → 404.
- `it('rejects a sandbox refund webhook whose signature does not match the raw body')`
  — валидная подпись над другим телом → 404.
- `it('reconciles exactly once for a correctly signed webhook')` — валидная
  подпись → 200, аллокация `succeeded`, повтор того же тела → 200 без второго
  события в леджере.
- `it('throttles repeated unsigned webhook attempts')` — 61-й запрос за минуту → 429.

Плюс `apps/api/test/route-guard-inventory.spec.ts` (новый) — см. барьер.

**Файлы:**

- `apps/api/src/refunds/refund-webhook.guard.ts` (новый) — копия структуры
  `apps/api/src/payments/sandbox-confirm.guard.ts:9-19`: `canActivate()` читает
  `PAYMENT_PROVIDER`; для `none`/`production` бросает `NotFoundException`; для
  `sandbox` требует непустой `PAYMENTS_SANDBOX_WEBHOOK_SECRET`, иначе тоже 404.
- `apps/api/src/refunds/refund-webhooks.controller.ts:19-21` → добавить
  `@HttpCode(200)`, `@UseGuards(RefundWebhookGuard, ThrottlerGuard)`,
  `@Throttle({ default: { limit: 60, ttl: 60_000 } })` — те же значения, что у
  `payments.controller.ts:145-147`.
- `apps/api/src/payments/sandbox-payment-gateway.provider.ts:59-65` → перед
  проверкой формы: HMAC-SHA256 над `input.rawBody` с
  `PAYMENTS_SANDBOX_WEBHOOK_SECRET`, сравнение через `timingSafeEqual` с
  заголовком `x-alistore-signature`; при несовпадении — `NotFoundException`.
  Тот же метод применить к `verifyWebhook` (`:51-53`) — он не подписан ровно так
  же, просто прикрыт `SandboxConfirmGuard`.
- `apps/api/src/refunds/refunds.module.ts:15` → зарегистрировать `RateLimitModule`
  в `imports` (сейчас его там нет, `ThrottlerGuard` без него не резолвится).
- `apps/api/.env.example`, `apps/api/.env.production.example`,
  `infra/render.staging.yaml` → объявить `PAYMENTS_SANDBOX_WEBHOOK_SECRET`.

**Барьер против возврата:** `apps/api/test/route-guard-inventory.spec.ts` —
поднимает `AppModule` в `Test.createTestingModule`, через `DiscoveryService` +
`Reflector` обходит **все** методы контроллеров, читает метаданные `__guards__` и
`PATH_METADATA`/`METHOD_METADATA`, и падает, если у любого не-GET роута нет ни
одного guard'а и он не внесён в явную таблицу исключений внутри спека. Это
превращает «один незакрытый вебхук» в «незакрытый мутирующий роут нельзя добавить».
Таблица исключений живёт в спеке, поэтому попадает в дифф и видна ревьюеру.

**Переиспользовать:**
- `apps/api/src/payments/sandbox-confirm.guard.ts` — эталон «404 вместо 403,
  чтобы доступность не была наблюдаема», прямо в комментарии класса.
- `apps/api/src/payments/payments.controller.ts:143-152` — эталон обвязки
  вебхука (`@HttpCode(200)` + guard + throttle + `rawBody`).
- `apps/api/src/rate-limit/rate-limit.module.ts:20-40` (`trackRequestSubject`) —
  уже готовый субъектный трекер; для анонимного вебхука он даст `ip:` бакет,
  что и нужно.
- `apps/api/test/dangerous-endpoint-rbac.e2e-spec.ts` — образец сборки
  тестового модуля с `PaymentsModule` + `RefundsModule` и переключением
  `PAYMENTS_SANDBOX_CONFIRM_ENABLED` через `process.env` в `beforeAll`.

**НЕ делать в этом срезе:** не реализовывать боевой адаптер провайдера
(`ProductionPaymentGatewayProvider` намеренно 503); не включать `REFUND_RELAY_ENABLED`;
не менять `reconcileProviderRefund` (`refunds.processor.ts:265`) — его идемпотентность
уже покрыта `refund-aggregate.e2e-spec.ts`.

---

### Срез 4 — Разделение публичного и внутреннего хоста (3.4)

**Зависит от:** ничего в коде, но **зависит от действия владельца**: домен
`admin.ali.kg` должен быть прикреплён к сервису `alistore-web-prod` в панели
Render до мержа. В блюпринте кастомные домены не объявляются — из репозитория это
не проверяемо.

**Severity и почему здесь в очереди:** HIGH. Данные сервер закрывает корректно
(RBAC на API), но с `ali.kg` открыт весь набор внутренних экранов, форма входа
сотрудника индексируема и брутфорсится, а половина путей не покрыта даже
`robots.ts`. Четвёртым — потому что это единственный срез, меняющий поведение
прода, и он должен идти после того, как дешёвые серверные барьеры уже стоят.

**Полный список внутренних путей — проверен мной, не по вашему списку.**
Признак: страница рендерит `StaffSessionLogin` или использует `restoreStaffSession`
из `apps/web/lib/staff-session.ts`.

| Путь | Файл | В вашем списке |
|---|---|---|
| `/erp` | `app/erp/page.tsx` | да |
| `/pos` | `app/pos/page.tsx` | да |
| `/staff` | `app/staff/page.tsx` | да |
| `/warehouse` | `app/warehouse/page.tsx` | да |
| `/approvals` | `app/approvals/page.tsx` (свой `staffLogin`, без `StaffSessionLogin`) | да |
| `/refunds` | `app/refunds/page.tsx` | да |
| `/admin/products` | `app/admin/products/page.tsx` | да |
| `/courier` | `app/courier/page.tsx` | да |
| `/courier-cash` | `app/courier-cash/page.tsx` | да |
| `/ai-tools` | `app/ai-tools/page.tsx` | да |
| **`/assess`** | `app/assess/page.tsx:64-73` | **нет** |
| **`/exchange`** | `app/exchange/page.tsx:109-112` | **нет** |
| **`/warranty`** | `app/warranty/page.tsx:92-95` | **нет** |

Три последние — целиком staff-only (при отсутствии сессии рендерят форму входа
сотрудника), но `e2e/web-route-audit.spec.ts:14-27` числит `/exchange`, `/warranty`
и `/assess` в `anonymousRoutes`, а `apps/web/app/sitemap.ts:20` **рекламирует
`/assess` в sitemap с priority 0.6**. То есть страница входа сотрудника сейчас
подаётся поисковикам как витринная. Это надо чинить в этом же срезе.

`/account/*` — покупательские, остаются на публичном хосте.
`/api/runtime-config` — нужен обоим хостам (bootstrap Sentry DSN), внутренним не
считается.

**Acceptance (пишется первым):** `apps/web/lib/host-policy.test.ts` (vitest, новый)

- `it('404s an internal path requested on the public apex host')`
- `it('404s an internal path on the www alias too')`
- `it('serves internal paths on a configured internal host')`
- `it('redirects www to the canonical public host with 308, preserving path and query')`
- `it('lets /healthz through on any host including the render subdomain')` — это
  критично: Render дёргает healthCheckPath (`render.yaml:44`) по
  `*.onrender.com`, которого нет ни в одном списке.
- `it('lets /.well-known/* through before the www redirect')` — Apple и Google
  верифицируют App Links по `https://ali.kg` **и** `https://www.ali.kg`, а
  `scripts/validate-deeplink-contract.mjs:26-31` прибивает `applinks:www.ali.kg`
  и `android:host="www.ali.kg"` гвоздями. Редирект `.well-known` сломал бы
  верификацию.
- `it('treats every allowed host as public when INTERNAL_HOSTS is unset')` —
  fail-closed: без конфигурации внутренних хостов внутренние пути не отдаются
  нигде.
- `it('stays inert when no hosts are configured at all')` — локальный `next dev`
  и Playwright (`playwright.config.ts` поднимает web на 127.0.0.1:3200 без
  `ALLOWED_HOSTS`) не должны сломаться.
- `it('rejects a configuration listing the same host as both public and internal')`
- `it('keeps 421 for a host in neither list')` — регрессия на нынешнее поведение.

Плюс `apps/web/lib/internal-route-inventory.test.ts` (новый) —
`it('covers every page that renders a staff login with an internal path prefix')`:
обходит `apps/web/app/**/page.tsx`, для каждой страницы, импортирующей
`StaffSessionLogin` либо `staff-session`, требует совпадения её маршрута с одним
из `INTERNAL_PATH_PREFIXES`. Это и есть барьер класса.

Плюс `e2e/web-route-audit.spec.ts` — `/assess`, `/exchange`, `/warranty`
перенести из `anonymousRoutes` в `authenticatedShellRoutes`.

**Точный механизм.**

Новый чистый модуль `apps/web/lib/host-policy.ts`:

```
export const INTERNAL_PATH_PREFIXES = [
  '/erp','/pos','/staff','/warehouse','/approvals','/refunds',
  '/admin','/courier','/courier-cash','/ai-tools',
  '/assess','/exchange','/warranty',
] as const;

export const BYPASS_EXACT   = ['/healthz'];
export const BYPASS_PREFIX  = ['/.well-known/'];

export interface HostPolicy { publicHosts: string[]; internalHosts: string[]; canonicalPublic: string | null }
export function resolveHostPolicy(env: Record<string,string|undefined>): HostPolicy
export function isInternalPath(pathname: string): boolean
export type ProxyDecision =
  | { kind: 'next' }
  | { kind: 'next-noindex' }
  | { kind: 'misdirected' }         // 421
  | { kind: 'not-found' }           // 404
  | { kind: 'redirect'; location: string; status: 308 };
export function decideProxy(
  req: { host: string; pathname: string; search: string },
  policy: HostPolicy,
  opts: { internalHostRedirect: boolean },
): ProxyDecision
```

`resolveHostPolicy` читает `PUBLIC_HOSTS` и `INTERNAL_HOSTS`; если оба пусты —
падает обратно на `ALLOWED_HOSTS` целиком как на публичные (обратная
совместимость + fail-closed). Валидация хостов — та же, что в
`apps/api/src/config/runtime-security.ts:64-79`: нижний регистр, без схемы, без
`/`, без `:`, без `localhost`; плюс новая проверка «хост не может быть и
публичным, и внутренним».

Порядок решений в `decideProxy` — строго такой, менять нельзя:

1. `BYPASS_EXACT.includes(pathname)` → `next`. (`/healthz` — до проверки хоста.)
2. `BYPASS_PREFIX.some(p => pathname.startsWith(p))` → `next`.
3. `policy.publicHosts.length === 0 && policy.internalHosts.length === 0` →
   `next` (dev / Playwright).
4. хост не в объединении списков → `misdirected` (421). Нынешнее поведение.
5. хост публичный, но не канонический (`www.ali.kg`) → `redirect` 308 на
   `https://${canonicalPublic}${pathname}${search}`.
6. `isInternalPath(pathname)` и хост публичный →
   `internalHostRedirect ? redirect 308 на https://${internalHosts[0]}${pathname}${search} : not-found`.
7. хост внутренний → `next-noindex` (ответ получает `X-Robots-Tag: noindex, nofollow`).
8. иначе → `next`.

`opts.internalHostRedirect` берётся из `INTERNAL_HOST_REDIRECT === 'true'`,
по умолчанию `false`. Это тот самый вентиль, который не даёт отрезать сотрудников:
на один релиз ставим `true`, старые закладки `ali.kg/erp` уводят на
`admin.ali.kg/erp`; после этого `false` и 404. Удаление вентиля — отдельный пункт
в `BACKLOG.md`, заводится в этом же срезе.

**Почему сотрудники не будут отрезаны — проверено:**
`apps/web/lib/staff-session.ts:12` возвращает `null` в production, а
`restoreStaffSession` (`:46`) требует cookie `alistore_staff_session_hint`, которую
API ставит **host-only на `api.ali.kg`** (`apps/api/src/auth/web-session.ts:63-64`,
атрибут `domain` не задан). То есть `document.cookie` на `ali.kg` её сегодня
и не видит — восстановления сессии в проде нет ни на каком хосте. Терять при
смене origin нечего. Сами access/refresh cookie живут на `api.ali.kg` с
`SameSite=Lax`, а `admin.ali.kg` для `api.ali.kg` — same-site (одна
регистрируемая доменная зона `ali.kg`), поэтому `credentials:'include'` работает
с нового хоста ровно так же. `CORS_ORIGINS` в `render.yaml:186` уже содержит
`https://admin.ali.kg` — правку API этот срез не требует.

**Про `/api/health/*` — уточнение к постановке:** это путь сервиса **API**
(`api.ali.kg`), веб-прокси его не видит. У веб-приложения единственный `/api/*` —
это `app/api/runtime-config/route.ts`. На стороне API исключение уже стоит:
`apps/api/src/config/runtime-security.ts:85`. Добавлять `/api/health` в bypass
веб-прокси не нужно — это был бы мёртвый код. Здоровье веба — `/healthz`
(`render.yaml:44`), правило 1.

**Про `NODE_ENV !== 'production'`:** нынешняя ветка `proxy.ts:4` выключает
middleware целиком. Она заменяется правилом 3 (пустая конфигурация → inert).
Разница принципиальна: staging тоже идёт с `NODE_ENV=production`
(`infra/render.staging.yaml`), и на нём разделение обязано работать; а
Playwright и `next dev` попадают в правило 3 и не ломаются.

**Файлы:**

1. `apps/web/lib/host-policy.ts` — новый (весь механизм выше).
2. `apps/web/proxy.ts:3-20` → тело заменить на
   `resolveHostPolicy(process.env)` (вычислить один раз на уровне модуля) +
   `decideProxy(...)` + маппинг решения в `NextResponse`. `config.matcher`
   (`:19`) не менять.
3. `apps/web/app/robots.ts:5` → `PRIVATE_PREFIXES` заменить импортом
   `INTERNAL_PATH_PREFIXES` из `@/lib/host-policy` плюс `/account`, `/api`,
   `/order` (сейчас в нём нет `/approvals`, `/refunds`, `/courier`,
   `/courier-cash`, `/ai-tools`, `/assess`, `/exchange`, `/warranty`).
4. `apps/web/app/sitemap.ts:20` → убрать строку `{ path: '/assess', … }`.
5. `render.yaml:54-56` → вместо одного `ALLOWED_HOSTS` объявить
   `PUBLIC_HOSTS: ali.kg,www.ali.kg` и `INTERNAL_HOSTS: admin.ali.kg`;
   `ALLOWED_HOSTS` оставить на один релиз как объединение — для отката.
6. `infra/render.staging.yaml:38` → те же два ключа, `sync: false`
   (значения `staging.ali.kg` / `admin-staging.ali.kg` — они уже фигурируют в
   `CORS_ORIGINS` staging-группы).
7. `scripts/check-internal-host-split.mjs` — новый (см. барьер).
8. `package.json` → добавить `"web:test": "npm run test -w @alistore/web"`;
   `scripts/mvp-verify.mjs:16-40` → шаг `['Web unit tests','npm',['run','web:test']]`
   сразу после `Web build`; `.github/workflows/ci.yml:71` → `- run: npm run web:test`.
   **Без этого пункта весь барьер среза не выполняется ничем.**
9. `e2e/web-route-audit.spec.ts:14-27,32-48` → перенести `/assess`, `/exchange`,
   `/warranty` в `authenticatedShellRoutes`.
10. `BACKLOG.md` → пункт «убрать `INTERNAL_HOST_REDIRECT` после релиза N».

**Барьер против возврата:** два, оба обязательны.
- `apps/web/lib/internal-route-inventory.test.ts` — новая back-office страница,
  не внесённая в `INTERNAL_PATH_PREFIXES`, роняет сборку. Дефект «страницу
  добавили, в список не внесли» становится невозможным, а не «маловероятным».
  `robots.ts` и `sitemap.ts` питаются из того же списка, поэтому разъехаться
  они больше не могут.
- `scripts/check-internal-host-split.mjs` в `mvp:verify` и в CI: парсит
  `render.yaml` и `infra/render.staging.yaml`, требует у каждого сервиса типа
  `web` обоих ключей `PUBLIC_HOSTS`/`INTERNAL_HOSTS`, падает если хост встречается
  в обоих, и падает если внутренний хост равен апексу или `www.`+апекс. Форма —
  шаг `Parse Render blueprints` в `.github/workflows/ci.yml:18-20`, который уже
  читает оба блюпринта.

**Переиспользовать:**
- `apps/api/src/config/runtime-security.ts:64-95` (`resolveAllowedHosts` +
  `allowedHostsMiddleware`) — готовые правила валидации хостов, 421 и
  bypass-путь для health. `host-policy.ts` — их зеркало на стороне web; правила
  парсинга скопировать дословно, чтобы два слоя не разошлись.
- `apps/api/test/runtime-security.spec.ts:35-52` — образец табличных тестов на
  резолвер хостов, включая «а что если хост чужой».
- `scripts/validate-deeplink-contract.mjs` — образец проверки, что контракт
  хостов согласован между API, web, iOS и Android; при добавлении
  `INTERNAL_HOSTS` убедиться, что он по-прежнему проходит.
- `apps/web/lib/site.ts` (`SITE_URL`) — канонический публичный origin; правило 5
  должно приводить именно к нему, иначе canonical и редирект разойдутся.

**НЕ делать в этом срезе:** не переносить проверку staff-сессии на сервер
(страницы остаются `'use client'`, авторитет — API); не вводить basic-auth или
IP-allowlist на `admin.ali.kg`; не трогать `allowedHostsMiddleware` в API; не
переименовывать маршруты; не удалять `ALLOWED_HOSTS` из блюпринтов в этом релизе.

---

### Срез 5 — Защита от скриншотов и App Switcher (3.6)

**Зависит от:** ничего.

**Severity и почему здесь в очереди:** MEDIUM-HIGH и первый из клиентских, потому
что это единственная нативная находка, эксплуатируемая без компрометации
устройства: снимок App Switcher с телефонами покупателей и суммой в ящике
попадает на скриншот, в бэкап и в скринкаст. Проверено грепом: `privacySensitive`,
`redacted`, `isCaptured` в `apps/ios` — 0 вхождений; `FLAG_SECURE`,
`setRecentsScreenshotEnabled` в `apps/android` — 0.

**Acceptance (пишется первым):** честно — надёжного автотеста здесь нет.

- Единственный воспроизводимый гейт: `scripts/check-privacy-shield.mjs`
  (см. барьер). Он и есть acceptance.
- Дополнительно, best-effort UI-тест
  `apps/ios/UITests/Staff/AliStoreStaffUITests.swift` →
  `func testBlindCashCountShowsThePrivacyCoverWhenBackgrounded()`:
  `XCUIDevice.shared.press(.home)`, возврат, проверка наличия элемента с
  accessibility identifier `privacy-shield-cover`. Тест хрупкий (симулятор не
  всегда снимает snapshot), помечается как non-blocking и **не** считается
  доказательством.
- Ручная проверка, записать в `PROGRESS.md`: на устройстве открыть каждый из
  пяти экранов, свернуть приложение, убедиться, что в App Switcher видна
  заглушка; сделать скриншот и убедиться, что содержимое закрыто.

**Файлы:**

- `apps/ios/Shared/PrivacyShield.swift` — новый. `ViewModifier sensitiveSurface()`:
  (a) `.privacySensitive()`; (b) подписка на
  `UIApplication.willResignActiveNotification` / `didBecomeActiveNotification` —
  пока приложение неактивно, поверх кладётся непрозрачный оверлей с
  `accessibilityIdentifier("privacy-shield-cover")`; (c) подписка на
  `UIScreen.capturedDidChangeNotification` — оверлей, пока `UIScreen.main.isCaptured`.
  Плюс `public static let protectedSurfaces: [String]` — список идентификаторов
  защищённых экранов, на который опирается статическая проверка.
- Точки применения `.sensitiveSurface()`:
  - `apps/ios/Staff/AliStoreStaffApp.swift:1384-1395` — слепой пересчёт кассы.
  - `apps/ios/POS/POSOperationsView.swift:104-114` — пересчёт кассы POS.
  - Customer 360 в Staff (экран с телефонами и LTV; найти по
    `openCustomer360` → `selectedTab = .customer` в
    `AliStoreStaffApp.swift:105`).
  - `apps/ios/Client/AliStoreClientApp.swift:3553` — поле «Паспорт / ID продавца».
  - `apps/ios/Shared/QuickUnlock.swift` — `QuickUnlockView.body` (ввод PIN).
- Android: `FLAG_SECURE` на уровне Activity, покомпонентно там нельзя.
  - `apps/android/staff/.../MainActivity`, `apps/android/pos/.../MainActivity`,
    `apps/android/courier/.../MainActivity` — в `onCreate`:
    `window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, FLAG_SECURE)`.
  - Клиент: флаг ставится только на экране trade-in/паспорта через
    `DisposableEffect` (ставим при входе, снимаем при выходе) — глобальный
    `FLAG_SECURE` в покупательском приложении сломает легитимные скриншоты
    заказа.
  - На API 33+ дополнительно `activity.setRecentsScreenshotEnabled(false)` для
    трёх рабочих приложений.

**Барьер против возврата:** `scripts/check-privacy-shield.mjs` в `mvp:verify`.
Держит явный список PII-поверхностей (файл + символ + платформа) и требует в
каждом файле наличия `sensitiveSurface()` / `FLAG_SECURE`. Класс закрывается
второй, эвристической половиной: скрипт падает, если в `apps/ios` или
`apps/android` появился файл, где рядом встречаются признаки ПДн
(`passport`, `паспорт`, `phone`, `Телефон`, `LTV`, `openCash`, `closeCash`) и нет
ни `sensitiveSurface`, ни `FLAG_SECURE`, и файл не внесён в baseline-файл
`scripts/privacy-shield-baseline.json`. Ратчет-механика — как у
`scripts/check-no-fixtures.mjs` с его `no-fixtures-baseline.json`.

**Переиспользовать:**
- `scripts/check-no-fixtures.mjs` — готовая механика «скан + baseline + явный
  escape-hatch в комментарии», включая формат отчёта.
- `apps/ios/Shared/UITestBootstrap.swift` — существующий механизм подстановки
  состояния в UI-тестах, если решите доводить UI-тест.
- `apps/ios/.swiftlint.yml` — можно добавить `custom_rules`, но помнить: линтер
  сейчас **не блокирующий** (в шапке файла об этом сказано прямо), поэтому
  реальный барьер — node-скрипт.

**НЕ делать в этом срезе:** не вводить глобальный `FLAG_SECURE` на клиентском
приложении; не пытаться блокировать скриншоты на iOS (API не существует —
закрываем только App Switcher и активную запись экрана); не трогать
`QuickUnlock` логику (Срезы 6 и 7).

---

### Срез 6 — Токен под биометрией, PIN — не один проход SHA256 (3.5)

**Зависит от:** Среза 5 (экран ввода PIN должен быть уже прикрыт — иначе новый
biometric-prompt на разблокировке даёт лишний кадр в App Switcher).

**Severity и почему здесь в очереди:** HIGH при компрометации устройства.
`SecureTokenStore.save` (`apps/ios/Shared/SecureTokenStore.swift:11-24`) ставит
`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` без `kSecAttrAccessControl` —
элемент читается при заблокированном экране. PIN —
`SHA256.hash(salt + pin)` за один проход (`QuickUnlock.swift:83`), пространство
10⁶ перебирается за секунды. Сравнение `expected == actual` (`:93`) не
constant-time. Android здесь уже сделан правильно: HMAC-SHA256 ключом из
AndroidKeyStore (`QuickUnlock.kt`, метод `hmac`/`key`) — iOS надо привести к тому
же уровню.

**Acceptance (пишется первым):** `apps/ios/Tests/LocalPINStoreTests.swift` (новый,
таргет `AliStoreCoreTests`, схема `AliStoreClient`, запуск `npm run ios:test`)

- `func testStoredDigestIsNotASinglePassSha256OfSaltAndPin()` — сохранить PIN,
  прочитать сырую строку, убедиться, что она **не** равна
  `sha256hex(salt + pin)`.
- `func testDerivationCostIsAtLeastTheConfiguredIterationCount()` — версия `v2:`
  содержит счётчик итераций ≥ 210 000.
- `func testV1DigestsStillVerifyAndAreUpgradedToV2OnSuccessfulUnlock()`.
- `func testComparisonIsConstantTime()` — проверяется вызовом общей
  `constantTimeEquals`, а не таймингом.
- `func testTokensAndPinUseDifferentKeychainProtectionClasses()` — токен
  сохраняется с `kSecAttrAccessControl`, PIN-хеш — с
  `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` без ACL.

**Файлы:**

- `apps/ios/Shared/SecureTokenStore.swift:5-9` → `init(service:protection:)`, где
  `protection` — `enum KeychainProtection { case biometric, deviceUnlockedThisDeviceOnly }`.
- `apps/ios/Shared/SecureTokenStore.swift:11-24` → для `.biometric`:
  `SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, [.biometryCurrentSet], &error)`
  в `kSecAttrAccessControl`; `kSecAttrAccessible` при этом **не** ставится (ключи
  взаимоисключающие). Для `.deviceUnlockedThisDeviceOnly`:
  `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` без ACL.
  `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` исчезает из файла.
- Вызовы `SecureTokenStore(service:)`: сессии (`StaffAuthStore` с
  `keychainService: "kg.alistore.staff"` — `AliStoreStaffApp.swift:50`, и
  аналогично POS `:48`, Courier `:52`) → `.biometric`.
- `apps/ios/Shared/QuickUnlock.swift:51` → `LocalPINStore` создаёт свой
  `SecureTokenStore(service:protection: .deviceUnlockedThisDeviceOnly)`.
  Иначе получается круг: чтобы ввести PIN, нужна биометрия.
- `apps/ios/Shared/QuickUnlock.swift:80-86` (`save(pin:)`) → формат
  `v2:<iterations>:<saltBase64>:<derivedBase64>`, вывод через
  `CCKeyDerivationPBKDF` (PBKDF2-HMAC-SHA256, ≥210 000 итераций, соль 16 байт из
  `SecRandomCopyBytes`).
- `apps/ios/Shared/QuickUnlock.swift:88-95` (`matches(pin:)`) → распознаёт `v1:`
  и `v2:`; сравнение — новая `constantTimeEquals(_:_:)` в `Shared/`; при успешной
  проверке `v1:` немедленно перезаписывает в `v2:`.

**Барьер против возврата:** `scripts/check-keychain-protection.mjs` в
`mvp:verify`: падает, если в `apps/ios` встречается
`kSecAttrAccessibleAfterFirstUnlock` в любом виде, либо если `SecItemAdd` с
`kSecClassGenericPassword` вызывается вне `Shared/SecureTokenStore.swift`, либо
если в `Shared/QuickUnlock.swift` появляется `SHA256.hash` (весь вывод ключа
обязан идти через PBKDF2). Три правила закрывают не одно место, а весь способ
хранить секреты на iOS. Дополнительно — `custom_rules` в
`apps/ios/.swiftlint.yml` с тем же запретом (пока информативно; линтер не
блокирующий по его же шапке).

**Переиспользовать:**
- `apps/android/core/src/main/java/kg/alistore/core/QuickUnlock.kt`, методы
  `hmac(value:)` и `key()` — уже правильная модель «вывод ключа привязан к
  аппаратному хранилищу, а не к паролю». iOS-реализация должна давать тот же
  уровень: без ключа из Keychain офлайн-перебор 10⁶ бесполезен.
- `apps/api/src/auth/guest-capability.ts` — образец версионирования формата
  (`v1:`/`typ`) и мягкой миграции.
- `MessageDigest.isEqual` в `QuickUnlock.kt:matches` — эталон constant-time
  сравнения, которого на iOS нет.

**НЕ делать в этом срезе:** не менять троттлинг (Срез 7); не переносить PIN в
Secure Enclave (перебор закрывается стоимостью вывода ключа); не менять серверную
авторизацию — PIN остаётся локальным гейтом поверх серверной сессии, как и
написано в подсказке `QuickUnlock.swift` («не заменяет серверную авторизацию»).

---

### Срез 7 — Троттлинг PIN не по настенным часам, с эскалацией (3.8)

**Зависит от:** Среза 6 (обе правки в `QuickUnlock.swift` / `QuickUnlock.kt`;
разводить их по релизам — гарантированный конфликт).

**Severity и почему здесь в очереди:** MEDIUM. Сдвиг системного времени снимает
блокировку (`QuickUnlock.swift:103-104` — `Date().timeIntervalSince1970`;
`QuickUnlock.kt:50,57,90` — `System.currentTimeMillis()`), а на пятой неудаче
пишется `failures = 0` (`QuickUnlock.swift:118`; `PinAttemptLimiter.afterFailure`
возвращает `0 to nowMillis + lockoutMillis`) — эскалации нет, бесконечные циклы
по 5 попыток за 30 секунд. С исправленным Срезом 6 стоимость перебора уже выросла,
поэтому это следующим, а не раньше.

**Acceptance (пишется первым):**

- `apps/ios/Tests/PinAttemptLimiterTests.swift` (новый):
  - `func testMovingTheWallClockForwardDoesNotReleaseTheLock()`
  - `func testMovingTheWallClockBackwardKeepsTheLock()`
  - `func testLockoutGrowsWithTotalFailuresInsteadOfResetting()`
  - `func testPinIsWipedAtTheFailureCeiling()`
- `apps/android/core/src/test/java/kg/alistore/core/PinAttemptLimiterTest.kt`
  (существующий, дополнить):
  - `fun escalatesLockoutInsteadOfResettingFailures()`
  - `fun ignoresABackwardClockJump()`
  - `fun wipesThePinAtTheFailureCeiling()`
  Существующие три теста (`locksAfterTheFifthFailure`,
  `ignoresFailuresDuringLockoutAndAllowsRetryAfterExpiry`,
  `countsFailuresBeforeLockout`) переписываются под новую сигнатуру, а не удаляются.

Запуск: `npm run ios:test` и `npm run android:test`. Ни одна из этих команд не в
CI — см. «Чего не смог проверить».

**Файлы:**

- `apps/ios/Shared/PinAttemptLimiter.swift` — новый. Чистая структура, зеркало
  `PinAttemptLimiter` из Kotlin: `status(totalFailures:lockedUntilWall:lockedUntilMonotonic:nowWall:nowMonotonic:)`
  и `afterFailure(...)`. Ни одного обращения к часам внутри — время только
  параметром.
- `apps/ios/Shared/QuickUnlock.swift:99-119` → `attemptStatus` и
  `registerFailure` читают/пишут тройку
  `(totalFailures, wallDeadline, continuousDeadline)`, где continuous — от
  `mach_continuous_time()`. Блокировка снимается, только если **оба** дедлайна
  истекли; если настенные часы прыгнули назад относительно записанного момента —
  блокировка сохраняется (признак подкрутки).
- `apps/ios/Shared/QuickUnlock.swift:118` → `failures = 0` убрать. Правило:
  `lockout = min(30s * 2^(totalFailures/5 - 1), 15 min)`; при
  `totalFailures >= 25` — `try pinStore.clear()` и принудительный `onLogout()`.
- `apps/android/core/.../QuickUnlock.kt:39-58` → `PinAttemptLimiter` получает то
  же правило и ту же тройку; `nowMonotonic` — `SystemClock.elapsedRealtime()`,
  прокидывается параметром.
- `apps/android/core/.../QuickUnlock.kt:81-92` (`registerPinFailure`,
  `pinStatus`) → передавать оба источника времени; хранить `totalFailures`
  отдельно от `failures`.

**Барьер против возврата:** обе реализации лимитера — чистые функции, время
только аргументом; тесты покрывают подкрутку в обе стороны. Механический барьер:
`scripts/check-pin-limiter-purity.mjs` в `mvp:verify` — падает, если в
`apps/ios/Shared/PinAttemptLimiter.swift` встречается `Date(`/`mach_`/`Clock`,
или в объекте `PinAttemptLimiter` внутри `QuickUnlock.kt` встречается
`System.currentTimeMillis`/`SystemClock`. Это запрещает не конкретную ошибку, а
сам способ её сделать — брать время изнутри чистой логики.

**Переиспользовать:**
- `apps/android/core/.../QuickUnlock.kt:39-58` (`PinAttemptLimiter`) — уже
  чистый объект с `nowMillis` параметром; iOS-версию писать по нему дословно,
  чтобы поведение двух платформ совпадало.
- `apps/android/core/src/test/.../PinAttemptLimiterTest.kt` — готовый образец
  табличных тестов на лимитер.
- `apps/api/src/refunds/refunds.processor.ts` (`recordFailure`, экспоненциальный
  backoff с потолком) — та же форма эскалации на сервере; правило подобрать
  консистентно.

**НЕ делать в этом срезе:** не переносить счётчик попыток из
`SharedPreferences` в шифрованное хранилище (рутованное устройство очистит
любое; серверная сессия остаётся независимым рубежом) — завести пунктом в
`BACKLOG.md`; не менять число попыток до первой блокировки (5 остаётся).

---

### Срез 8 — Ролевой гейт в Staff-приложениях (3.7)

**Зависит от:** ничего.

**Severity и почему здесь в очереди:** LOW по безопасности (сервер закрывает
данные корректно — курьер получит 403), MEDIUM по эксплуатации: пользователь
тонет в непонятных ошибках. Предпоследним, потому что не закрывает утечку.
Проверено: `apps/ios/Staff/AliStoreStaffApp.swift:59-63` отдаёт полный `TabView`
любой аутентифицированной роли, тогда как POS (`AliStorePOSApp.swift:62` —
`["cashier","admin","owner"].contains(session.role)`) и Courier
(`AliStoreCourierApp.swift:63` — `session.role == "courier"`) гейт имеют.
Android — то же самое: `StaffOperationsScreens.kt:105-114` рендерит
`StaffSignedInScreen` без проверки роли.

Роли берутся из `apps/api/prisma/schema.prisma:20-37`:
`seller, senior_seller, cashier, warehouse, service, technician, courier,
marketer, admin, owner` (+ выведенная из обращения `franchise`).
Для Staff-приложения допустимый набор:
`seller, senior_seller, cashier, warehouse, service, technician, marketer, admin, owner`
— то есть все, кроме `courier` и `franchise`. Точный список согласовать с
`apps/api/src/authz` перед реализацией и зафиксировать в манифесте (см. барьер).

**Acceptance (пишется первым):**

- `apps/ios/Tests/StaffRoleAccessTests.swift` (новый) —
  `func testCourierIsNotAllowedIntoTheStaffWorkspace()`,
  `func testEveryPrismaRoleIsClassifiedExactlyOnce()` (список ролей читается из
  манифеста, не хардкодится второй раз).
- `apps/android/core/src/test/java/kg/alistore/core/StaffRoleAccessTest.kt`
  (новый) — те же два случая.
- Инструментальные, best-effort, вне CI:
  `apps/ios/UITests/Staff/AliStoreStaffUITests.swift` →
  `func testCourierRoleSeesNoAccessInsteadOfTheStaffTabBar()` (через
  `apps/ios/Shared/UITestBootstrap.swift`);
  `apps/android/staff/src/androidTest/java/kg/alistore/staff/StaffPackagedUiTest.kt` →
  `fun courierRoleSeesAccessDeniedInsteadOfOperations()`.

**Файлы:**

- `apps/ios/Shared/StaffRoleAccess.swift` — новый: `enum StaffSurface { staff, pos, courier }`,
  `func allows(_ surface: StaffSurface, role: String) -> Bool`, списки — из
  одного места.
- `apps/ios/Staff/AliStoreStaffApp.swift:59-63` → обернуть `StaffRootView` в
  `else if StaffRoleAccess.allows(.staff, role: session.role) { … } else { ContentUnavailableView(…) }`
  — структура дословно как в `AliStorePOSApp.swift:62-75`, включая кнопку
  «Выйти» в оверлее.
- `apps/ios/POS/AliStorePOSApp.swift:62` и
  `apps/ios/Courier/AliStoreCourierApp.swift:63` → перевести на тот же
  `StaffRoleAccess`, чтобы списки не жили в трёх файлах.
- `apps/android/core/src/main/java/kg/alistore/core/StaffRoleAccess.kt` — новый,
  зеркало.
- `apps/android/core/src/main/java/kg/alistore/core/StaffOperationsScreens.kt:105-114`
  → добавить ветку `if (!StaffRoleAccess.allows(Surface.STAFF, current.session.role)) RoleDeniedScreen(logout)`.
  Проверить и Android POS/Courier точки входа — привести к тому же вызову.

**Барьер против возврата:** единый JSON-манифест
`apps/shared-contracts/staff-role-access.json` (роли × поверхности) и
`scripts/check-staff-role-access.mjs` в `mvp:verify`, который:
(1) сверяет манифест с enum `Role` в `apps/api/prisma/schema.prisma` — новая
роль обязана быть классифицирована, иначе падение;
(2) проверяет, что списки в `StaffRoleAccess.swift` и `StaffRoleAccess.kt`
совпадают с манифестом;
(3) падает, если `@main`-структура iOS-приложения или Android-экран рендерит
staff-корень, не пройдя через `StaffRoleAccess`.
Форма — `scripts/validate-deeplink-contract.mjs`. Это закрывает класс «новая роль
или новое рабочее приложение появились, гейт забыли».

**Переиспользовать:**
- `apps/ios/POS/AliStorePOSApp.swift:62-75` — готовый эталон гейта, включая
  `ContentUnavailableView` и текст «Роль \(session.role) не может…».
- `apps/ios/Courier/AliStoreCourierApp.swift:63-73` — второй эталон.
- `apps/web/lib/staff-permissions.ts` (`staffCan`, `erpRouteAllowed`, используется
  в `apps/web/app/erp/page.tsx:50`) — уже существующая ролевая модель на
  клиенте; манифест должен ей не противоречить.

**НЕ делать в этом срезе:** не переносить проверку роли на сервер (она там уже
есть, это UX-гейт); не менять RBAC на API; не скрывать отдельные вкладки внутри
разрешённой роли — это отдельная задача.

---

### Срез 9 — Экспорт «моих данных» не остаётся на диске (3.9)

**Зависит от:** ничего.

**Severity и почему здесь в очереди:** LOW-MEDIUM, последним. Полный дамп профиля
пишется в `FileManager.default.temporaryDirectory` с `options: .atomic`
(`apps/ios/Client/AliStoreClientApp.swift:3939-3941`) — без
`.completeFileProtection` и без удаления. Файл читается при заблокированном
экране и попадает в бэкап. Затрагивает только iOS: Android отдаёт поток в SAF
(`ClientAuthScreen.kt:263`, `exportLauncher.launch`), web скачивает blob
(`apps/web/app/account/settings/page.tsx:48`).

**Acceptance (пишется первым):** `apps/ios/Tests/ExportFileStoreTests.swift` (новый)

- `func testExportIsWrittenWithCompleteFileProtection()` — после `write`
  `URLResourceValues.fileProtection == .complete`.
- `func testExportDirectoryIsExcludedFromBackup()`.
- `func testPurgeAllRemovesEveryPreviousExport()`.
- `func testWriteReplacesAnEarlierExportInsteadOfAccumulating()`.

**Файлы:**

- `apps/ios/Shared/ExportFileStore.swift` — новый: каталог
  `temporaryDirectory/alistore-exports/`, создаётся с
  `isExcludedFromBackup = true`; `write(_ data: Data, named: String) -> URL`
  пишет с `options: [.atomic, .completeFileProtection]`; `purgeAll()` чистит
  каталог целиком.
- `apps/ios/Client/AliStoreClientApp.swift:3935-3944` (`exportMyData`) →
  запись через `ExportFileStore.write`; `ExportFileStore.purgeAll()` вызывается
  перед записью, при закрытии `ActivityShareSheet` (`:3925` — `.sheet(item:)`
  получает `onDismiss`) и при уходе сцены в фон (`@Environment(\.scenePhase)`).
- Тот же `ExportFileStore` применить в точке запуска приложения (purge при
  холодном старте), чтобы прошлые файлы, оставшиеся у существующих
  пользователей, удалились при первом же обновлении.

**Барьер против возврата:** `scripts/check-export-file-protection.mjs` в
`mvp:verify` — падает, если в `apps/ios` встречается
`FileManager.default.temporaryDirectory` вне `Shared/ExportFileStore.swift`, либо
если любой `write(to:options:` в `apps/ios` не содержит
`.completeFileProtection`. Запрещается способ, а не конкретная строка: единственный
путь записать файл — через хранилище, которое уже правильное.

**Переиспользовать:**
- `apps/ios/Shared/SecureTokenStore.swift` — образец «единственная точка доступа
  к чувствительному хранилищу в `Shared/`, все остальные ходят через неё».
- `apps/android/core/.../ClientAuthScreen.kt:263` — правильная модель: система
  сама выбирает место, приложение ничего не оставляет. iOS-аналог — удаление
  после шеринга.

**НЕ делать в этом срезе:** не менять серверный `GET /customers/me/export`; не
шифровать содержимое (это уже данные пользователя, отданные ему); не трогать
`deleteAccount` (`:3947-3962`).

---

## Чего не смог проверить

1. **Прикреплён ли `admin.ali.kg` к сервису `alistore-web-prod`.** Кастомные
   домены Render не объявляются в блюпринте; в `render.yaml` есть только
   `renderSubdomainPolicy: allowed`. Срез 4 без этого домена превращается в
   «внутренние пути 404 везде». Проверить в панели Render до мержа.
2. **Что реально стоит в env staging и prod прямо сейчас.** Читал только
   `render.yaml` и `infra/render.staging.yaml`; часть ключей помечена
   `sync: false` (в т.ч. `ALLOWED_HOSTS` веба на staging, `S3_ENDPOINT`,
   `MINIO_ROOT_*`). Если `MEDIA_STORAGE` где-то переопределён на `local`,
   находка 3.2 сегодня активна и на проде — Срез 1 надо ускорить.
3. **Ни один тест и ни один билд не запускал** — ограничение задачи «только
   чтение». Все `it(...)` в плане — предписания, а не наблюдения.
4. **iOS/Android не собирал.** `npm run ios:test`, `npm run android:test`,
   `npm run ios:build` не выполнялись; сигнатуры SwiftUI-модификаторов и
   доступность `setRecentsScreenshotEnabled` на целевом `minSdk` (не смотрел
   `apps/android/*/build.gradle.kts`) исполнителю надо подтвердить.
5. **Что `restoreStaffSession` действительно не работает в проде.** Вывод
   сделан по коду (`apps/web/lib/staff-session.ts:12,46` + отсутствие атрибута
   `domain` у cookie в `apps/api/src/auth/web-session.ts:47-64`), а не по
   наблюдению живого браузера. От этого зависит утверждение «Срез 4 не отрежет
   сотрудников» — проверить руками до включения `INTERNAL_HOST_REDIRECT=false`.
   Побочно: если вывод верен, у сотрудников сейчас нет восстановления сессии на
   любом хосте — отдельный дефект, стоит завести в `BACKLOG.md`.
6. **Полнота списка меток evidence.** Собирал грепом по литералам; метка вводится
   свободным текстом (`StaffScannerView.swift:294`), поэтому в базе могут быть
   произвольные значения. Fail-closed политика Среза 2 это покрывает по построению,
   но состав `NON_PII_TRADEIN_LABELS` надо сверить с реальными данными
   (`SELECT DISTINCT label FROM "EvidenceUpload" WHERE "entityType"='tradein'`).
7. **Полнота списка Android Activity** для `FLAG_SECURE` — смотрел структуру
   модулей (`staff`, `pos`, `courier`, `app`), но не каждый манифест.
8. **Список ролей для Staff-приложения** вывел из `schema.prisma`; авторитетное
   соответствие «роль → рабочее приложение» лежит в `apps/api/src/authz`, туда я
   углублялся только поверхностно.

## Что станет хуже после переезда на постоянный хостинг

Сегодня прод выключен или живёт в демо-режиме, и это гасит несколько находок.
После включения смягчение исчезает — вот по каким именно:

1. **3.3 держится исключительно на `PAYMENT_PROVIDER=none`** (`render.yaml:186`).
   `NonePaymentGatewayProvider.verifyRefundWebhook` бросает 503 раньше всякой
   логики. В момент, когда владелец подключит эквайринг и значение станет
   `sandbox` или `production`, публичный неаутентифицированный вебхук возвратов
   оживёт мгновенно. На staging (`PAYMENT_PROVIDER=sandbox`) он уже открыт.
2. **3.2 держится на `MEDIA_STORAGE=s3`** (`render.yaml:230`). Это единственное,
   что уводит evidence с раздаваемого статикой диска; проверки на это нет ни в
   `production-preflight.ts`, ни в CI. Любой переезд на одноузловой VPS, любой
   `docker-compose` из `infra/`, любой откат к дефолту `MEDIA_STORAGE=local` —
   и фото паспортов раздаются по прямому GET. `infra/RUNBOOK.md:43` при этом
   прямым текстом рекомендует `MEDIA_PUBLIC_BASE=https://api.ali.kg/uploads`.
3. **3.1 копит долг молча.** Пока трафика нет, невырезанных паспортов
   единицы. Каждый день работы магазина добавляет строки с
   `retentionUntil = null`, которые sweep не увидит никогда. Стоимость
   исправления растёт линейно со временем работы: backfill из Среза 2 после
   года работы затронет несоизмеримо больше объектов.
4. **3.4 сейчас не эксплуатируется потому, что домены не разведены и трафика
   нет.** С постоянным хостингом форма входа сотрудника на апексе получает
   индексацию (её половина не покрыта `robots.ts:5`, а `/assess` вообще
   рекламируется в `sitemap.ts:20`) и фоновый брутфорс. Rate-limit по субъекту
   уже стоит, но он считает по `ip:` для неаутентифицированных, а `trust proxy`
   даёт один hop — за CDN этого хватает, за двумя прокси нет.
5. **3.5–3.9 не зависят от прода вообще.** Они уже полностью активны на всех
   устройствах, где стоят сборки: приложения ставятся и запускаются независимо
   от того, включён ли backend. Отложенный прод их не смягчает ни на грамм —
   единственное, что их смягчает, это малое число установок.
6. **Общий эффект наблюдаемости.** Сейчас нет ни трафика, ни алертов, ни
   реальных логов доступа к evidence. После запуска первым признаком любой из
   этих находок станет не алерт, а инцидент. Уже добавленный
   `.github/workflows/uptime.yml` покрывает доступность, но не
   несанкционированный доступ — стоит завести пункт про алерт на всплеск
   `evidence.read` в леджере и на 4xx/5xx у `/refunds/webhooks/provider`.

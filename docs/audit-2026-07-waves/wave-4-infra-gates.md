# План: гейты, которые умеют краснеть

Роль: Build & Verification Architect. Тезис: зелёный гейт, который ничего не доказывает,
хуже отсутствия гейта. План рассчитан на аккуратного джуниора без догадок.

---

## 0. Фактический прогон (21.07.2026, рабочее дерево, ветка `codex/open-source-integrations`)

### `npm run mvp:verify -- --skip-e2e` — **не запускается вообще**

```
Error: Set ALISTORE_TEST_DATABASE_CONFIRMED=1 to confirm the destructive test database reset
    at testDatabaseOverride (scripts/mvp-verify.mjs:124:11)
    at scripts/mvp-verify.mjs:13:25
```

Бросок происходит на **строке 13**, при вычислении `const testDatabaseEnv`, то есть
до массива `steps` и до первого `spawnSync`. Ни один шаг — включая шесть
неразрушающих — не исполняется. Это самостоятельный дефект: гейт «всё или ничего»,
и «прогнать дешёвую часть» невозможно даже намеренно.

### Неразрушающие шаги, прогнанные по отдельности

| Шаг из `steps[]` | Команда | Результат |
|---|---|---|
| Prisma schema validate | `set -a && . ./apps/api/.env && npx prisma validate --schema apps/api/prisma/schema.prisma` | **зелёный** (`valid 🚀`) |
| Prisma client generate | внутри `api:build` (`prebuild`) | **зелёный** (v5.22.0) |
| Нет новых фикстур в ERP | `node scripts/check-no-fixtures.mjs` | **зелёный**, exit 0: `✓ Новых нарушений нет (в базовой линии ещё 78)` |
| API build | `npm run api:build` | **зелёный** |
| Web build | `npm run build -w @alistore/web` | **зелёный** (exit 0) |
| External readiness (report) | `npm run readiness -w @alistore/api` | **зелёный как шаг** (нестрогий режим), содержимо — `blocked`: ready=1, missing=10, manual=1, blocking=11 |

Сверх списка (свои, тоже неразрушающие):

| Проверка | Результат |
|---|---|
| `npx tsc --noEmit -p apps/api/tsconfig.json` (включая `test/`) | **зелёный** |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | **зелёный** |
| `npm run ecosystem:audit` | **красный**, `Error: The ecosystem test toolchain lock does not match package-lock.json` (`scripts/trusted-npm.mjs:210`) |

### Поправка к постановке задачи: `check-no-fixtures` сейчас **зелёный**

Формулировка «Из-за этого `mvp:verify` красный прямо сейчас» была верна на момент
снимка, но уже неверна. История:

```
d5df346 fix(guard): барьер не видел самую частую форму дефекта — 4 найденных места стали 92
e4cff17 fix(storefront): покупатель видел пустой магазин вместо сообщения о сбое
4c2a66b fix(erp): экраны выдавали сбой за благополучие  ← здесь обновлена базовая линия
```

`scripts/no-fixtures-baseline.json` был перезаписан в `4c2a66b`; сейчас в нём
33 группы / 78 нарушений, `shrunk` пуст, `grown` пуст → exit 0.

**Структурный дефект при этом никуда не делся.** `scripts/check-no-fixtures.mjs:256`
по-прежнему `process.exit(shrunk.length > 0 ? 1 : 0)`, то есть следующий, кто починит
любой `catch`, снова получит красный гейт на успехе. Именно поэтому срез 1 остаётся
первым — он чинит механику, а не восстанавливает зелёный.

### Что найдено сверх списка

**Корень отказа `ecosystem:audit` установлен.** Расхождение ровно в одном поле:

```
lock.packageLockSha256  = c3dc499209f49db6a92d512c695c2cec09d32109e17879908ec8b83d7ae55d40
actual packageLockSha256 = a791c4176764f010e8ff72b54a545a0e5bbb5df88e54f1898407fa82c4a4b673   MISMATCH
lock.playwright.version = 1.61.1  | actual 1.61.1   OK
lock.jest.version       = 29.7.0  | actual 29.7.0   OK
lock.runtime.platform   = darwin arm64 | actual darwin arm64   OK
```

Коммит `8463353 chore(tooling): install AliStore engineering foundation` добавил в
`package-lock.json` 5218 строк; `scripts/ecosystem-toolchain-lock.json` последний раз
трогали в `63681bb`, до этого. **Скрипта регенерации лока в репозитории нет** —
`grep -rn ecosystem-toolchain-lock scripts/ docs/ package.json .github/` даёт только два
места чтения (`trusted-git.mjs:11`, `trusted-npm.mjs:47`). Это отдельный срез, не «дописать
одну строку».

### Чего проверить нельзя было

Разрушающие шаги (`Refund/Inventory/Exchange/Order-payment-mode migration upgrade path`,
`Test database reset`, `postdeploy-indexes`, `API Jest batches`) требуют
`ALISTORE_TEST_DATABASE_CONFIRMED=1` и ресета `alistore_test` — по ограничению задачи не
запускались. Их цвет неизвестен. `tsc` по `apps/api/tsconfig.json` (включая `test/`)
зелёный, значит компиляция спеков не сломана, но это не про runtime.

---

## A. Срезы

### Срез 1 — храповик перестаёт наказывать за починку

**Зависит от:** ничего. Первый.

**Acceptance:**
Гейт обязан краснеть на регрессе и **не** краснеть на улучшении.
Способ доказать, что он умеет краснеть, — самотест в `scripts/check-no-fixtures.spec.mjs`
(новый файл), который прогоняет чистую функцию сравнения на трёх синтетических парах:
- `{a::x::2}` vs baseline `{a::x::1}` → вердикт `fail`, причина `grown`;
- `{a::x::1}` vs baseline `{a::x::2}` → вердикт `pass` + флаг `stale`;
- `{}` vs baseline `{}` → вердикт `pass`, `stale === false`.
Тест пишется ДО правки, падает на текущем коде (функции ещё нет) — RED.
После среза: `node scripts/check-no-fixtures.mjs` даёт exit 0 (как сейчас);
искусственный регресс (добавить в любой файл `apps/web/components/` строку
`.catch(() => setFoo([]))`) даёт exit 1 — проверить руками и **откатить**.

**Файлы:**
- `scripts/check-no-fixtures.mjs:242-256` → вынести сравнение в экспортируемую чистую
  функцию `compareToBaseline(counts, allowed)`, возвращающую
  `{ grown: [...], shrunk: [...], verdict: 'pass' | 'fail' }`, где
  `verdict === 'fail'` **тогда и только тогда, когда `grown.length > 0`**.
- `scripts/check-no-fixtures.mjs:256` → `process.exit(shrunk.length > 0 ? 1 : 0)`
  заменить на `process.exit(0)`. Сообщение об устаревшей линии из строк 245-249
  оставить как есть (`console.log` про `--update-baseline`), но добавить туда явное
  `::notice::` / префикс `[stale-baseline]`, чтобы это было видно в логе CI без падения.
- `scripts/check-no-fixtures.spec.mjs` → новый файл, три кейса выше, запуск через
  `node --test scripts/check-no-fixtures.spec.mjs`.
- `package.json` scripts → добавить `"guard:test": "node --test scripts/*.spec.mjs"`.
- `scripts/mvp-verify.mjs:24` → сразу после шага `'Нет новых фикстур в ERP'` добавить
  шаг `['Самотест барьеров', 'npm', ['run', 'guard:test']]`. Гейт, который не
  самотестируется, — следующий кандидат в тавтологии.

**Переиспользовать:** встроенный `node:test` (Node ≥20 по `engines`), сторонний
раннер не заводить. Формат строк `путь::вид::N` и парсер `allowed` из строк 226-232 — как есть.

**НЕ делать в этом срезе:** не трогать 78 нарушений в базовой линии, не расширять
`SCAN`, не менять регулярки правил, не обновлять `no-fixtures-baseline.json`.

---

### Срез 2 — `mvp:verify` перестаёт быть «всё или ничего»

**Зависит от:** среза 1 (чтобы дешёвая часть была честной).

**Acceptance:**
Сейчас `npm run mvp:verify -- --skip-e2e` без `ALISTORE_TEST_DATABASE_CONFIRMED`
падает исключением на строке 13, ноль шагов. После среза та же команда прогоняет
шесть неразрушающих шагов, печатает по каждому результат и завершается ненулевым
кодом с внятным текстом «разрушающие шаги пропущены: не задан
ALISTORE_TEST_DATABASE_CONFIRMED» — то есть **не выдаёт частичный прогон за полный**.
Доказательство, что умеет краснеть: с `ALISTORE_TEST_DATABASE_CONFIRMED=1` и
подменённым `TEST_DATABASE_URL` на базу без сегмента `test` — по-прежнему бросок
(строка 117-119 не ослабляется).

**Файлы:**
- `scripts/mvp-verify.mjs:13` → `const testDatabaseEnv = testDatabaseOverride(env);`
  заменить на ленивое вычисление: `let testDatabaseEnv = null;` плюс функция
  `requireTestDatabaseEnv()`, вызываемая только внутри цикла для шагов, у которых
  задан `stepEnv`.
- `scripts/mvp-verify.mjs:15-42` → у разрушающих шагов вместо готового объекта
  `testDatabaseEnv` поставить маркер `'destructive'`; в цикле (строка 60) для
  маркера вызывать `requireTestDatabaseEnv()`.
- `scripts/mvp-verify.mjs:60-77` → в цикле: если шаг разрушающий и подтверждения нет
  — не бросать сразу, а записать в `skipped[]` и продолжить; после цикла, если
  `skipped.length > 0`, напечатать список и `process.exit(2)` (отличный от 1 код —
  «не доказано» ≠ «сломано»).
- `scripts/mvp-verify.mjs:123-125` → сообщение оставить дословно, но перенести в
  `requireTestDatabaseEnv()`.

**Переиспользовать:** `loadEnvFile`, `withConnectionLimit`, `normalizedDatabase`,
проверку сегмента `test` (строки 117-119) — без изменений.

**НЕ делать в этом срезе:** не ослаблять требование подтверждения, не добавлять
автоматический ресет, не менять состав шагов, не трогать `--strict-external`.

---

### Срез 3 — `ecosystem:audit` снова стартует, и лок можно пересобрать

**Зависит от:** ничего (независим от 1-2, можно параллельно).

**Acceptance:**
Сейчас `npm run ecosystem:audit` умирает на `scripts/trusted-npm.mjs:210`.
После среза: `node scripts/regenerate-toolchain-lock.mjs --check` печатает построчный
diff лока (сейчас — ровно одно поле, `packageLockSha256`) и выходит 1;
`node scripts/regenerate-toolchain-lock.mjs --write` перезаписывает лок;
`npm run ecosystem:audit` доходит хотя бы до собственной логики аудита.
Доказательство, что умеет краснеть: после `--write` изменить один байт в
`package-lock.json` → `--check` снова красный и называет то же поле.

**Файлы:**
- `scripts/regenerate-toolchain-lock.mjs` → новый файл. Вычисляет ровно те же
  значения, что читает `resolveTrustedNpm` (строки 181-189): `packageLockSha256`,
  `nodeModulesTreeSha256`, `runtime.{platform,architecture,nodeSha256,nodeKegSha256,
  nodeRuntimeLibrariesSha256,browserSha256,browserAppTreeSha256}`,
  `playwright.version`, `jest.version`. Режимы `--check` (diff + exit 1 при
  расхождении) и `--write`.
- `scripts/trusted-npm.mjs:188-210` → **логику сравнения не менять**. Изменить только
  текст исключения: вместо одной строки перечислить конкретные разошедшиеся поля.
  Сейчас сообщение не говорит, какое из четырнадцати условий не выполнено, —
  из-за этого отказ читается как «сломано непонятно что» и гейт обходят.
- `docs/TRUSTED-ECOSYSTEM-GATE.md` → раздел «Когда обновлять лок»: после любого
  изменения `package-lock.json`, командой `--write`, отдельным коммитом.
- `package.json` scripts → `"ecosystem:lock:check"` и `"ecosystem:lock:write"`.

**Переиспользовать:** `sha256File`, `hashDependencyTree`, `hashNodeRuntimeLibraries`
из `scripts/trusted-npm.mjs` — вынести в `scripts/toolchain-hashes.mjs` и
импортировать в оба файла. Не копировать реализацию.

**НЕ делать в этом срезе:** не ослаблять ни одно из условий сравнения, не убирать
проверку `acceptanceDatabaseIdentity`, не делать регенерацию автоматической в CI
(лок обязан меняться осознанным коммитом), не запускать `--write` вслепую — сначала
`--check` и глазами убедиться, что расхождение только в `packageLockSha256`.

---

### Срез 4 — восемь переменных в `render.yaml`

**Зависит от:** ничего.

**Acceptance:**
Сейчас `grep -c "SEARCH_ADMIN_TOKEN\|METRICS_TOKEN\|APPLE_CLIENT_ID\|APPLE_TEAM_ID\|
ANDROID_APP_LINK_SHA256\|NOTIFICATION_TRANSPORT\|DEBT_REMINDERS_ENABLED\|STORE_NAME"
render.yaml` = 0. После среза каждая присутствует ровно в том сервисе, который её
читает. Проверка сама по себе — срез 5 (валидатор блюпринта); этот срез без него
недоказуем и должен идти в паре.

**Файлы:**

В сервис `alistore-api-prod` (`render.yaml:13-43`, после `key: SENTRY_DSN`):
- `SEARCH_ADMIN_TOKEN` → `sync: false`. Потребитель:
  `apps/api/src/catalog/catalog.service.ts:474-480` — без неё
  `assertMaintenanceToken` бросает `maintenance_token_not_configured` (403) на
  реиндексацию, индекс Meilisearch не наполняется, поиск на витрине пуст.
- `METRICS_TOKEN` → `sync: false`. Потребитель:
  `apps/api/src/observability/metrics.controller.ts:29`.
- `APPLE_CLIENT_ID` → `value: kg.alistore.client`. Потребитель:
  `apps/api/src/auth/auth.service.ts:151-164` — `verifyAppleIdentityToken` сверяет
  `aud` токена с этим значением. У native-флоу в `aud` лежит **bundle ID**, а не
  Services ID.
- `NOTIFICATION_TRANSPORT` → `value:` согласовать с
  `apps/api/src/health/external-readiness.ts` (проверка `campaign_delivery`
  требует `NOTIFICATION_TRANSPORT` в списке `missing`).
- `DEBT_REMINDERS_ENABLED` → `value: "false"` (включать осознанно).
- `STORE_NAME`, `STORE_ADDRESS`, `STORE_PHONE` → `value:` реальные реквизиты точки.
- `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID` → `sync: false`.
  Потребитель: `.github/workflows/uptime.yml` job `notify` (строки ~107-119) —
  сейчас при пустых значениях уведомление молча не уходит (`exit 0`).

В сервис `alistore-web-prod` (`render.yaml:54-79`, после `NEXT_PUBLIC_SENTRY_ENVIRONMENT`):
- `APPLE_TEAM_ID` → `sync: false`. Потребитель:
  `apps/web/app/.well-known/apple-app-site-association/route.ts:6-7` — без неё
  route отдаёт `503` с телом `{"applinks":{"details":[]}}`.
- `ANDROID_APP_LINK_SHA256` → `sync: false`. Потребитель:
  `apps/web/app/.well-known/assetlinks.json/route.ts:6-8` — без неё `503` и тело `[]`.

**Переиспользовать:** `apps/api/.env.production.example` как список имён.
`apps/api/src/health/external-readiness.ts` как источник истины по тому, что во что
входит.

**НЕ делать в этом срезе:** не трогать `PUBLIC_DEMO_MODE` (исправлен в `9075ca2`).
Не вписывать секреты значениями — только `sync: false`. Не править
`infra/render.staging.yaml` (отдельный срез, если понадобится).

**Побочно, в том же срезе:** исправить дезинформирующий комментарий
`apps/api/.env.production.example:104-105` — «App ID / Services ID = APPLE_CLIENT_ID»
заменить на: для native Sign in with Apple здесь **bundle ID**
(`kg.alistore.client`), Services ID нужен только для web-редиректного флоу, который
здесь не используется.

---

### Срез 5 — CI валидирует значения блюпринта, а не только тип узла

**Зависит от:** среза 4 (иначе валидатор упадёт на реальном блюпринте, и это правильно
— но тогда срезы 4 и 5 сливаются в один коммит; так и сделать).

**Acceptance:**
Сейчас `.github/workflows/ci.yml:20` проверяет ровно одно: `['services'].is_a?(Array)`.
Файл, где у всех сервисов пустые `envVars`, проходит. После среза: новый
`scripts/validate-render-blueprint.mjs` собирает `envVars` каждого сервиса в
`Map<name, value>`, скармливает `assertProductionRuntimeReady` из
`apps/api/src/health/production-preflight.ts:235` и дополнительно требует наличия
ключей из среза 4 в правильном сервисе.
Доказательство, что умеет краснеть — юнит-тест
`scripts/validate-render-blueprint.spec.mjs` на трёх фикстурах YAML в памяти:
- блюпринт без `SEARCH_ADMIN_TOKEN` в api-сервисе → exit 1, в тексте имя ключа;
- блюпринт без `APPLE_TEAM_ID` в web-сервисе → exit 1;
- блюпринт из среза 4 → exit 0.
Тест пишется до валидатора и падает — RED.

**Файлы:**
- `scripts/validate-render-blueprint.mjs` → новый. Принимает пути блюпринтов
  аргументами. Парсит YAML, строит `EnvReader` вида `(name) => map.get(name)`,
  добавляет `NODE_ENV=production` (иначе `assertProductionRuntimeReady:236` тихо
  возвращается — это ровно та ветка, из-за которой инструмент бесполезен вне рантайма).
- `scripts/validate-render-blueprint.spec.mjs` → новый, три кейса выше.
- `.github/workflows/ci.yml:18-20` → шаг `Parse Render blueprints` заменить на
  `node scripts/validate-render-blueprint.mjs render.yaml infra/render.staging.yaml`.
  Строку с `ruby -e ... is_a?(Array)` удалить целиком: она даёт ложное чувство покрытия.
- `package.json` scripts → `"blueprint:validate"`.

**Переиспользовать:** `assertProductionRuntimeReady` и `buildProductionPreflightReport`
(`apps/api/src/health/production-preflight.ts:212, 235`) — они уже покрыты тестами.
YAML-парсер: `yaml` из зависимостей репозитория; если его нет — добавить в
`devDependencies` корня, **не** писать свой парсер.

**НЕ делать в этом срезе:** не менять список `CHECKS` в `production-preflight.ts`
(добавление `SEARCH_ADMIN_TOKEN`/`METRICS_TOKEN` в preflight — отдельное решение с
последствиями для рантайма). Не валидировать `fromService`-ссылки — отдельный срез.

---

### Срез 6 — правка блюпринта инвалидирует доказательства

**Зависит от:** среза 3 (иначе аудит не стартует и результат не проверить).

**Acceptance:**
Сейчас `scripts/ecosystem-contract-audit.mjs:31-39` перечисляет `sourcePaths` без
`render.yaml`, `infra`, `docker`, `.github`. Изменение боевого блюпринта не двигает
`sourceTreeSha256` (строки 44-49) и не помечает дерево грязным (строки 51-60).
После среза: `git stash` → добавить пробел в `render.yaml` → `npm run ecosystem:audit`
сообщает о грязном дереве / другом `sourceTreeSha256`; откатить.

**Файлы:**
- `scripts/ecosystem-contract-audit.mjs:31-39` → в массив `sourcePaths` добавить
  `'render.yaml'`, `'infra'`, `'docker'`, `'.github'`.
- `scripts/ecosystem-contract-audit.mjs:51-60` → тот же список в аргументах
  `git status --porcelain`. Сейчас он продублирован литералами; вынести в константу
  `sourcePaths` и передавать её, чтобы два списка не разошлись снова.

**Переиспользовать:** `inspectHeadWorktree`, `trustedGitArgs` — как есть.

**НЕ делать в этом срезе:** не добавлять `apps/ios`/`apps/android` build-каталоги,
не менять формат отчёта, не трогать `--strict`.

---

### Срез 7 — смоук перестаёт считать пустой каталог успехом

**Зависит от:** ничего.

**Acceptance:**
Сейчас `scripts/deployment-smoke.mjs:14` утверждает только `response.ok`;
`/api/catalog/products?limit=1` на пустой базе отдаёт 200 и смоук зелёный.
После среза каталог проверяется как «200 **и** непустой массив товаров», плюс
добавляется проверка, что первая картинка первого товара реально отдаётся.
Доказательство, что умеет краснеть: подставить `API_BASE_URL`, указывающий на
локальный API с пустой БД → красный с текстом «каталог отвечает 200, но товаров нет».

**Файлы:**
- `scripts/deployment-smoke.mjs:9` → заменить вызов `check(...)` на новую функцию
  `checkCatalog(url)`, которая: (а) требует `response.ok`; (б) парсит JSON;
  (в) требует непустой список; (г) берёт первый URL изображения и делает по нему
  `HEAD`/`GET`, требуя 200 и `content-type: image/*` и `content-length > 0`.
  Пункт (г) — единственное место во всём репозитории, где вообще проверяется,
  что медиа отдаётся (см. срез 8).
- `scripts/deployment-smoke.mjs:12-16` → `check` оставить для health-эндпоинтов
  без изменений.
- `.github/workflows/uptime.yml:85` → `probe "$API_BASE_URL/api/catalog/products?limit=1"
  "catalog" || true` заменить на форму, **уже написанную в этом же файле на строках
  142-149** для `.well-known`: `curl -s -o /tmp/body -w '%{http_code}'`, затем
  `[ "$code" = 200 ]` и `grep -qE '"items"\s*:\s*\[\s*\]|^\[\]$' /tmp/body` → ошибка
  «каталог отвечает 200, но пуст». Ретраи (`probe`, строки 65-79) сохранить: вынести
  тело-проверку в параметр `probe`, а не дублировать цикл.

**Переиспользовать:** блок 142-149 `uptime.yml` — это готовая правильная форма,
её нужно перенести, а не изобрести заново. Форма ответа каталога — уточнить по
`apps/api/src/catalog/catalog.controller.ts` перед написанием grep-шаблона.

**НЕ делать в этом срезе:** не добавлять авторизованные проверки, не трогать job
`notify`, не менять расписание cron.

---

### Срез 8 — картинки начинают проверяться

**Зависит от:** среза 7 (там появляется первая проверка медиа — здесь она
переносится в Playwright).

**Acceptance:**
Сейчас `grep -rn naturalWidth e2e e2e-prod` даёт ноль совпадений на 107 тестах.
Мёртвый `media.ali.kg` не виден ни одному из них. После среза хотя бы один тест
проверяет, что все `<img>` в первом экране витрины загрузились.
Доказательство, что умеет краснеть: временно указать в
`apps/web/next.config` заведомо мёртвый хост картинок (или в тесте подменить
`page.route('**/*.{png,jpg,webp}', r => r.abort())`) → тест красный. Второй вариант
предпочтительнее: он детерминирован и остаётся в репозитории как отдельный
негативный кейс — гейт, доказывающий, что умеет краснеть, прямо в наборе.

**Файлы:**
- `e2e/media-loads.spec.ts` → новый файл, два теста:
  1. `/` и `/catalog`: собрать `img[src]` во вьюпорте, дождаться `img.complete`,
     утверждать `naturalWidth > 0` для каждого; в сообщении об ошибке — список `src`.
  2. негативный: тот же сценарий с `page.route(...).abort()` на изображениях,
     утверждать, что первый тест **упал бы** (то есть проверка ловит).
- `e2e-prod/prod-smoke.spec.ts:174` → в блоке анонимных маршрутов добавить ту же
  проверку `naturalWidth` для первых N изображений. Здесь — hard-assert, а не attach.

**Переиспользовать:** хелперы `e2e/helpers.ts`; `settlePage` из
`e2e/visual-acceptance.spec.ts`.

**НЕ делать в этом срезе:** не проверять размеры/качество изображений, не добавлять
визуальные эталоны, не трогать `next.config` постоянно.

---

### Срез 9 — prod-smoke перестаёт узаконивать поломку и начинает запускаться

**Зависит от:** среза 4 (после него `.well-known` отдают 200; до него срез 9 будет
законно красным — это и есть смысл).

**Acceptance:**
Три отдельных дефекта, каждый со своим доказательством:
1. `e2e-prod/prod-smoke.spec.ts:229` — `expect([200, 404, 503]).toContain(status)`
   объявляет сломанное состояние допустимым. После правки `.well-known` требует
   200 + непустое тело. **Прогнать до среза 4 → красный** (на 21.07.2026 прод отдавал
   503), после среза 4 → зелёный. Это и есть доказательство, что гейт умеет краснеть.
2. `:154, :174` — `consoleErrors` и `failedRequests` собираются и аттачатся, но не
   ассертятся. После правки first-party записи (`FIRST_PARTY = /(^|\.)ali\.kg$/i`,
   строка 79) становятся hard-fail; third-party остаются soft. Доказательство:
   подключить в тесте `page.route` на первый попавшийся `*.ali.kg` XHR с `abort()`
   → красный.
3. `:211` — `page.getByText(/войти|вход|log ?in|sign ?in/i)` тавтологичен:
   `apps/web/app/account/settings/page.tsx:107` рендерит строку
   «Вход по телефону и OTP» **вне** `{user && …}`, безусловно. Значит текстовый гейт
   удовлетворён даже если страница утекла бы целиком. Заменить `textGate` на
   утверждение об **отсутствии** приватных данных: для `/account/*` — нет элементов
   с `data-testid`, начинающимся на `account-`; для `/erp`, `/pos`, `/staff` — нет
   `[data-testid="kpi-metric"]` и т.п. `cssGate` (строка 208-210) оставить как
   позитивный сигнал.
   Доказательство: временно убрать `!user &&` из строки 78 `settings/page.tsx` — тест
   должен остаться зелёным (строка 78 не сигнал); временно отрендерить
   `data-testid="account-email"` безусловно — тест обязан покраснеть. Обе правки откатить.

**Сверх того:** файл **не запускается ничем**. `grep -rn prod-smoke package.json
.github/ scripts/` даёт единственное совпадение — `docs/GO-LIVE-RUNBOOK.md:37`.
Тест, который никто не запускает, — не гейт.
- `package.json` scripts → `"e2e:prod": "playwright test --config playwright.prod-smoke.config.ts"`.
- `.github/workflows/uptime.yml` job `contracts` (строка ~124, суточное расписание)
  → добавить шаг, вызывающий `npm run e2e:prod`. Именно сюда, а не в `ci.yml`:
  suite читает живой прод и в PR-CI ему не место.

**Файлы:** `e2e-prod/prod-smoke.spec.ts:154, 174, 205-217, 226-231`;
`package.json`; `.github/workflows/uptime.yml`.

**Переиспользовать:** `partition`/`hostOf`/`FIRST_PARTY` (строки 79, 101-113) —
разделение на first/third party уже написано, менять не нужно; нужно лишь
превратить first-party половину в assert.

**НЕ делать в этом срезе:** не логиниться на проде, не отправлять формы, не мутировать
данные — вся suite остаётся read-only (см. докблок, строки 3-9). Не добавлять
`.well-known` в `notFoundProbes`.

---

### Срез 10 — authz-e2e начинает проверять боевые эндпоинты

**Зависит от:** ничего.

**Acceptance:**
Сейчас `apps/api/test/authz-e2e.spec.ts:17-25` объявляет SUT внутри спека
(`@Controller('demo-danger')`), а докблок на строках 27-31 обещает
«End-to-end proof of the P0-authz chain». Любой боевой контроллер может потерять
`@RequirePermission` — три теста (`:79, :87, :95`) останутся зелёными.
После среза добавляется инвентарный тест: собрать все методы всех боевых
контроллеров, у которых в `@UseGuards` есть `PermissionGuard`, и утверждать, что у
каждого есть метаданные `RequirePermission`; плюс обратное — список опасных
эндпоинтов (`refund/approve`, `shift/close`, `payment/*`, `evidence/read`)
зафиксирован в файле-манифесте и каждый обязан быть защищён.
Доказательство, что умеет краснеть: убрать `@RequirePermission` с любого боевого
метода → тест красный, называет файл и метод. Откатить.

**Файлы:**
- `apps/api/test/authz-inventory.spec.ts` → новый. Импортирует `AppModule`, обходит
  `DiscoveryService`/`Reflector`, собирает пары (контроллер, метод, guards, permission).
- `apps/api/test/authz-manifest.json` → новый. Явный список путей, обязанных быть
  под `PermissionGuard` + `RequirePermission`. Расширяется осознанно, как
  `no-fixtures-baseline.json`, но **только вверх** — тот же принцип храповика, что в срезе 1.
- `apps/api/test/authz-e2e.spec.ts:27-31` → докблок переписать честно: это проверка
  механики guard'а на синтетическом контроллере, а не доказательство покрытия боевых
  маршрутов; ссылка на `authz-inventory.spec.ts` как на то, что покрывает второе.
  Сам `DemoController` (строки 17-25) и три теста оставить — механика тоже нужна.

**Переиспользовать:** `AuthzModule`, `PermissionGuard`, `RequirePermission` — как есть.
`@nestjs/core` `DiscoveryService` уже в зависимостях.

**НЕ делать в этом срезе:** не менять политику casbin, не добавлять `@RequirePermission`
на эндпоинты, которые тест найдёт незащищёнными — это отдельная работа с отдельным
решением по каждому. Задача среза — увидеть список, а не закрыть его.

---

### Срез 11 — авторизация Evidence получает настоящее покрытие

**Зависит от:** ничего.

**Acceptance:**
Сейчас `apps/api/src/evidence/evidence.controller.spec.ts:13-14` стабит
`assertStaffCanRead` и `assertCustomerOwnsEntity` в успех
(`jest.fn().mockResolvedValue(undefined)`), то есть проверяет проводку аргументов, а не
решение. `evidence.service.spec.ts:39, 67` передаёт `{} as AuthzService` — сама
авторизация не инстанцируется. В `apps/api/test/evidence.e2e-spec.ts` единственная
близкая проверка (строки 271-275) вызывает `assertCustomerOwnsEntity` напрямую,
минуя HTTP-слой и guard'ы.
После среза: интеграционный тест ходит по HTTP на `GET /evidence/:key` с тремя
идентичностями — владелец сущности (200), чужой клиент (403), сотрудник с
запрещённой ролью (403) — через настоящий `AuthzService`.
Доказательство, что умеет краснеть: удалить вызов `assertCustomerOwnsEntity` из
`evidence.controller.ts` → тест «чужой клиент» красный. Откатить.

**Файлы:**
- `apps/api/test/evidence-authorization.e2e-spec.ts` → новый. Реальный `AuthzService`,
  реальный `PermissionGuard`, supertest.
- `apps/api/src/evidence/evidence.service.spec.ts:39, 67` → `{} as AuthzService`
  заменить на настоящий инстанс либо на стаб, у которого метод **отклоняет** по
  умолчанию (fail-closed). Пустой объект означает, что любой вызов авторизации
  упал бы с TypeError, — и то, что тесты зелёные, доказывает, что вызова нет.
- `apps/api/src/evidence/evidence.controller.spec.ts:13-14` → оставить как unit-тест
  проводки, но в докблоке (строка 3) убрать слово «authorized»: спек проверяет
  делегирование, не авторизацию.

**Переиспользовать:** `apps/api/test/evidence.e2e-spec.ts` — bootstrap приложения и
фикстуры тикета/клиента уже написаны; хелперы ролей из `apps/api/test/`.

**НЕ делать в этом срезе:** не менять правила доступа к Evidence, не трогать
`MediaCleanupService`-тесты (строки 30-75 `evidence.service.spec.ts` — они про
другое и корректны).

---

### Срез 12 — проверка утечки ключа перестаёт быть мёртвой веткой

**Зависит от:** ничего. Самый дешёвый срез в плане.

**Acceptance:**
Сейчас `apps/api/test/health.e2e-spec.ts:90-92` — единственная проверка на утечку
ключа AI-провайдера — обёрнута в `if (process.env.AI_PROVIDER_KEY)`. На CI
(`.github/workflows/ci.yml:48-54` — переменная не задана) ветка не исполняется
никогда. После среза проверка безусловна.
Доказательство, что умеет краснеть: временно вернуть в
`apps/api/src/health/*` поле с ключом в ответе → тест красный без всяких env.

**Файлы:**
- `apps/api/test/health.e2e-spec.ts:90-92` → `if (process.env.AI_PROVIDER_KEY) {...}`
  заменить на форму, **уже написанную рядом** —
  `apps/api/test/observability-status.e2e-spec.ts:84`:
  `expect(JSON.stringify(res.body)).not.toContain(process.env.AI_PROVIDER_KEY ?? '<sentinel>')`,
  где sentinel — заведомо отсутствующая строка. Дополнительно: в `beforeAll` этого
  спека выставить `process.env.AI_PROVIDER_KEY = 'sk-test-leak-canary-<RUN>'`, чтобы
  проверка была осмысленной и на CI тоже; восстановить в `afterAll`.

**Переиспользовать:** строка 84 `observability-status.e2e-spec.ts` — готовый образец.

**НЕ делать в этом срезе:** не менять состав ответа `/health/integrations`,
не трогать проверку `pos_hardware` (строки 87-88).

---

### Срез 13 — негативный тест rate-limit перестаёт быть тавтологией

**Зависит от:** ничего.

**Acceptance:**
Сейчас `apps/api/test/public-rate-limit.e2e-spec.ts:90-95` утверждает `404` на
`POST /payments/webhooks/sandbox`. 404 — дефолт NestJS для любого несуществующего
маршрута: переименование контроллера читается как зелёное, отключение guard'а —
тоже, если маршрут заодно переехал.
После среза тест доказывает две разные вещи: (а) маршрут существует; (б) он
отвергает запрос по политике, а не по отсутствию.
Доказательство, что умеет краснеть: переименовать путь контроллера → тест красный
с текстом «маршрут не найден — проверка отключения вебхука ничего не доказала».

**Файлы:**
- `apps/api/test/public-rate-limit.e2e-spec.ts:90-95` → разбить на два утверждения:
  1. маршрут зарегистрирован — получить список маршрутов через
     `app.getHttpAdapter().getInstance()._router` (или `DiscoveryService`) и
     утверждать наличие `POST /payments/webhooks/sandbox`;
  2. ответ — `403`/`404` **с телом, содержащим код причины** (например
     `webhooks_disabled`), а не пустой дефолтный 404.
     Если сейчас контроллер и правда не регистрируется при выключенном сандбоксе —
     утверждение (1) должно проверять именно это условно, а тест — называть, какая
     из двух причин сработала.

**Переиспользовать:** `exhaust` (строки ~40-68 того же файла) и bootstrap
приложения — как есть.

**НЕ делать в этом срезе:** не включать sandbox-вебхуки, не менять лимиты
(строки 70-88), не трогать `issueGuestCheckoutCapability`.

---

### Срез 14 — визуальный эталон перестаёт маскировать то, ради чего существует

**Зависит от:** ничего. Последний по приоритету: даёт меньше всего доказательств
на единицу работы.

**Acceptance:**
Три дефекта в одном месте:
1. `e2e/visual-acceptance.spec.ts:105` — `page.locator('.h-40')` не совпадает ни с
   чем: `grep -rn 'h-40' apps/web/app apps/web/components` = 0 совпадений. Мёртвый
   селектор. Удалить.
2. `:106` — `[data-testid="kpi-metric"]` в `apps/web/components/erp/DashboardView.tsx:44`
   оборачивает **весь блок**: label (строка 45), значение (строки 46-48) и дельту
   (строки 49-51). Маскируется вся карточка целиком, включая заголовок, — то есть
   эталон не видит ни цифры, ни того, что подпись уехала. То же в
   `apps/web/components/erp/KpiView.tsx:56`.
   Исправление: `data-testid="kpi-metric"` оставить на карточке (по нему ходят другие
   тесты); добавить `data-testid="kpi-value"` на внутренний `<div>` со значением
   (`DashboardView.tsx:46`, `KpiView.tsx` соответственно) и маскировать **его**.
3. `:64, :77, и блок 100-109` — `maxDiffPixelRatio: 0.05` на `fullPage`. На странице
   высотой ~4000px это ~5% всех пикселей: пропадёт целый блок и эталон не заметит.
   Снизить до `0.002` и одновременно перевести эталон с `fullPage: true` на
   привязку к конкретным секциям, либо оставить fullPage с жёстким порогом и
   принять перегенерацию эталонов.
   Доказательство, что умеет краснеть: временно скрыть один блок ERP
   (`display:none` через `addStyleTag`) → эталон обязан упасть. При текущем 0.05 —
   почти наверняка не упадёт; это и есть измерение дефекта. Замерить **до** правки
   и записать в PROGRESS.md фактическую цифру diff-ratio.

**Файлы:** `e2e/visual-acceptance.spec.ts:64, 77, 104-109`;
`apps/web/components/erp/DashboardView.tsx:46`; `apps/web/components/erp/KpiView.tsx:56`.

**Переиспользовать:** `settlePage`, bootstrap owner-сессии (строки 80-97) — как есть.

**НЕ делать в этом срезе:** не перегенерировать эталоны вслепую
(`--update-snapshots`) до того, как замерены цифры из пункта 3. Не убирать маску с
`risk-decision` (`DashboardView.tsx:224`) — там действительно недетерминированное
содержимое.

---

## B. Пять отказов, которые пройдут через гейты сегодня

Каждый — с минимальной правкой в **существующий** гейт, без создания новых файлов.

**1. Пустой боевой каталог: витрина без единого товара.**
`/api/catalog/products?limit=1` на пустой БД отдаёт `200 {"items":[]}`.
`scripts/deployment-smoke.mjs:14` (`if (!response.ok)`) — зелёный;
`.github/workflows/uptime.yml:85` (`probe` требует только `code = 200`) — зелёный.
Ровно это и произойдёт, пока `SEARCH_ADMIN_TOKEN` отсутствует в `render.yaml`:
`catalog.service.ts:474-480` вернёт 403 на реиндексацию, индекс не наполнится.
*Минимальная правка:* в `uptime.yml:85` заменить `probe` на форму со строк **142-149
того же файла** — `curl -s -o /tmp/body`, затем `[ ! -s /tmp/body ]` / grep на пустой
массив. Одна функция, уже написанная, перенесённая на 60 строк выше.

**2. Мёртвый `media.ali.kg`: все карточки товаров без изображений.**
`grep -rn naturalWidth e2e e2e-prod` = 0 на 107 тестах. `prod-smoke.spec.ts:154`
собирает `failedRequests` — и на строке 174 **аттачит** их
(`attachSoftFindings`), не ассертя. Битые картинки уедут в артефакт отчёта,
которого никто не откроет, а `expect` в тесте только про `pageErrors` (строка 155).
*Минимальная правка:* `prod-smoke.spec.ts:174` — после `attachSoftFindings` добавить
одну строку `expect(partition(signals.failedRequests).firstParty).toEqual([])`.
`partition` и `FIRST_PARTY` уже существуют (строки 79, 101-113).

**3. Мёртвые deep links во всех восьми приложениях.**
`APPLE_TEAM_ID` и `ANDROID_APP_LINK_SHA256` отсутствуют в web-сервисе `render.yaml`,
`.well-known` route'ы отдают 503
(`apple-app-site-association/route.ts:7`, `assetlinks.json/route.ts:8`).
`prod-smoke.spec.ts:229` — `expect([200, 404, 503]).toContain(status)` — зелёный
**именно на сломанном состоянии**. `scripts/validate-deeplink-contract.mjs` грепает
исходники и зелёный при пустом окружении.
*Минимальная правка:* `prod-smoke.spec.ts:229` — убрать `503` и `404` из массива:
`expect([200]).toContain(status)`. Один литерал.

**4. Боевой эндпоинт теряет `@RequirePermission`.**
`apps/api/test/authz-e2e.spec.ts:17-25` объявляет SUT внутри спека
(`@Controller('demo-danger')`). Докблок на строках 27-31 обещает «End-to-end proof of
the P0-authz chain». Снять декоратор с реального refund-эндпоинта — три теста
(`:79, :87, :95`) останутся зелёными, потому что бьют по `demo-danger`.
*Минимальная правка (в существующий файл, без нового):* в `authz-e2e.spec.ts` в
`Test.createTestingModule` (строка 49) вместо `controllers: [DemoController]`
подключить `imports: [AppModule]` и добавить четвёртый `it`, который бьёт по
настоящему пути refund-approve тем же seller-токеном и ждёт 403. Одна секция,
переиспользующая уже написанные `staffAuth.login` и токены (строки 34-77).

**5. Ключ AI-провайдера в ответе `/health/integrations`.**
`apps/api/test/health.e2e-spec.ts:90-92` — единственная проверка утечки — внутри
`if (process.env.AI_PROVIDER_KEY)`. В `.github/workflows/ci.yml:48-54` этой
переменной нет: ветка не исполнялась ни разу за всю историю CI.
*Минимальная правка:* `health.e2e-spec.ts:90` — заменить условие на форму со
строки **84 `observability-status.e2e-spec.ts`**:
`expect(JSON.stringify(res.body)).not.toContain(process.env.AI_PROVIDER_KEY ?? 'нет-такой-строки')`.
Один вызов, без `if`.

---

## C. Чего не смог проверить

1. **Все разрушающие шаги `mvp:verify`.** `Refund/Inventory roll-forward/Exchange/
   Order-payment-mode migration upgrade path`, `Test database reset`,
   `postdeploy-indexes`, `API Jest batches` требуют
   `ALISTORE_TEST_DATABASE_CONFIRMED=1` и ресета `alistore_test`. По ограничению
   задачи не запускались; их цвет **неизвестен**. Косвенный сигнал:
   `npx tsc --noEmit -p apps/api/tsconfig.json` (включает `test/`) зелёный, значит
   спеки хотя бы компилируются.
2. **Playwright E2E** (`npm run e2e`) — поднимает API:4200 и web:3200 и пишет в БД.
   Не запускался. Значит утверждения о `e2e/visual-acceptance.spec.ts` (срез 14) —
   это чтение кода, а не наблюдение: фактический diff-ratio при скрытии блока
   **не измерен**. Срез 14 требует измерить его первым действием.
3. **`e2e-prod/prod-smoke.spec.ts` против живого прода** — не запускался
   (внешняя сеть, чужой сервис). Утверждение «на 21.07.2026 обе `.well-known`
   ссылки отдавали 503» взято из комментария `.github/workflows/uptime.yml:138`,
   не из собственного наблюдения.
4. **`ecosystem:audit` за пределами точки отказа.** Скрипт умирает в
   `resolveTrustedNpm` (`trusted-npm.mjs:210`) до собственной логики аудита.
   Расхождение локализовано до одного поля (`packageLockSha256`), но какие ещё
   проверки внутри `ecosystem-contract-audit.mjs` покраснеют после регенерации —
   неизвестно. Срез 3 может открыть новые отказы; это ожидаемо и правильно.
5. **`npm run launch:check`** — `.env.production` отсутствует
   (`ls .env.production` → No such file). Оба подшага (`launch:preflight:strict`,
   `launch:readiness:strict`) не запускались никогда. Файл содержит боевые секреты;
   создавать его агенту нельзя. Это не срез в плане — это действие владельца:
   скопировать `apps/api/.env.production.example` в `.env.production` (репозиторный
   корень, не `apps/api/`), заполнить и держать вне git. **Проверить, что
   `.env.production` в `.gitignore`, до создания файла.**
6. **`infra/render.staging.yaml`** — не читал. Срез 5 будет валидировать и его;
   валидатор может покраснеть там по причинам, не разобранным в этом плане.
7. **Рабочее дерево грязное параллельной работой другого инструмента**
   (`M apps/api/src/hr/hr.service.ts`, `M apps/api/src/reports/reports.service.ts`,
   `?? apps/api/src/reports/seller-revenue.ts`,
   `?? apps/api/test/reports-money-truth.e2e-spec.ts`). Все прогоны выполнены на
   этом состоянии, а не на чистом HEAD. Перед исполнением плана — `git status`.

---

## D. Порядок исполнения

```
1  →  2                     (гейт умеет краснеть; гейт можно частично прогнать)
3                           (независим; открывает ecosystem:audit)
4 + 5  одним коммитом       (переменные + валидатор, который их проверяет)
6                           (после 3)
7  →  8                     (каталог, затем медиа)
9                           (после 4: .well-known отдают 200)
10, 11, 12, 13              (независимы друг от друга и от всего выше)
14                          (последний; сначала измерить, потом править)
```

Один вертикальный срез = один коммит. Итоги — в `PROGRESS.md` / `BACKLOG.md` /
`docs/READINESS.md`, новый changelog не заводить.

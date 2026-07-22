# OWNER-LAUNCH-CHECKLIST — что сделать владельцу для запуска

Инженерная часть подготовлена: staging-деплой автоматизирован
(`.github/workflows/cd-staging.yml`), env-шаблоны полные
(`apps/api/.env.production.example`, корневой `.env.example`), Blueprint лежит в
`infra/render.staging.yaml`. Осталось создать аккаунты и вставить секреты — это
может сделать только владелец.

**Бюджет времени:** пункты 1, 2, 3, 5, 6 — примерно **30–40 минут** суммарно.
Пункт 4 (Apple/Google) — отдельный трек на дни: оплата, проверка документов и
ревью сторов не ускоряются.

**Правило №1:** никакие значения секретов не попадают в git, issues или чаты.
Секреты вводятся только в Render Dashboard и GitHub Secrets. Файлы-ключи
(`.p8`, `google-services.json`, `GoogleService-Info.plist`, service-account JSON)
уже покрыты `.gitignore` — проверить можно командой
`git check-ignore <путь>` (должна напечатать путь).

---

## 0. СЕЙЧАС: сайт открывается, но каталог пуст (~15 мин)

Проверено 2026-07-21 запросами к живым адресам:

| Адрес | Ответ | Что это значит |
|---|---|---|
| `https://ali.kg/` | `200` | витрина развёрнута и отдаётся |
| `https://ali.kg/catalog` | `200`, ноль карточек | страница есть, товаров нет |
| `https://api.ali.kg/api/health` | `502`, тело `error code: 502` | **API не отвечает** |

Тело `error code: 502` — ответ Cloudflare, а не Render: домен проксируется,
запрос доходит до Cloudflare, а origin молчит. Витрина не «сломана» — ей
неоткуда взять данные. Пока API не поднимется, каталог будет пустым при любых
правках фронтенда.

**Что нужно сделать (только владелец — нужны панели Render и Cloudflare):**

- [ ] Render → сервис `alistore-api-prod` → вкладка **Logs**. Смотреть на
      причину последнего падения: чаще всего это упавшая миграция, отсутствующая
      переменная окружения или превышение памяти на плане.
- [ ] Там же вкладка **Events**: если сервис suspended (неоплата или ручная
      остановка) — возобновить.
- [ ] Проверить, что сервис действительно слушает: Render → **Manual Deploy** →
      *Deploy latest commit*. В блюпринте стоит `autoDeployTrigger: off`, поэтому
      ни один коммит не выкатывается сам — это осознанная настройка, но она
      означает, что все накопленные исправления ждут ручного нажатия.
- [ ] После того как `https://api.ali.kg/api/health` начнёт отдавать `200` —
      выкатить и веб-сервис `alistore-web-prod` тем же способом. Это нужно
      обязательно: адрес API вшивается в бандл на этапе сборки, и переменная
      `NEXT_PUBLIC_API_BASE` (добавлена в `render.yaml` коммитом `9791071`)
      попадёт в витрину только после пересборки.
- [ ] Проверить результат теми же тремя запросами из таблицы выше. Каталог
      должен показать товары.

**Если логи Render показывают, что API стартует, но Cloudflare всё равно отдаёт
502** — расхождение в DNS: в Cloudflare запись `api` должна указывать на
`alistore-api-prod.onrender.com` (CNAME), а сам домен `api.ali.kg` должен быть
добавлен в Render → Settings → Custom Domains. Без второй половины Render не
принимает запрос от Cloudflare.

---

## 1. GitHub Organization + приватный репозиторий (~5 мин)

Зачем: Render и CI/CD работают от репозитория; секреты деплоя живут в GitHub
Secrets. Детали учётных записей и 2FA — также в `docs/MANAGED-CLOUD-LAUNCH.md` §1.

- [ ] Создать аккаунт/организацию на github.com, включить 2FA и сохранить
      recovery-коды в менеджер паролей (не в git).
- [ ] Создать **приватный** репозиторий, например `alistore-erp`, без README.
- [ ] Запушить код с локальной машины (из каталога репозитория):

  ```bash
  git checkout -b main                      # локальная main от текущего HEAD
  git remote add origin git@github.com:<ORG>/alistore-erp.git
  git push -u origin main
  ```

  После пуша CI (`.github/workflows/ci.yml`) запустится автоматически на push в
  `main`; CD (`.github/workflows/cd-staging.yml`) сработает, когда будут
  заполнены секреты из пункта 2.
- [ ] Repo → Settings → Secrets and variables → Actions. Пока оставить пустым —
      секреты `RENDER_DEPLOY_HOOK_API`, `RENDER_DEPLOY_HOOK_WEB`,
      `RENDER_DEPLOY_HOOK_WORKER` появятся в пункте 2, шаг «Deploy Hook».

Готово, когда: `git ls-remote origin main` возвращает hash, вкладка Actions
показывает зелёный CI.

---

## 2. Render Pro: staging из Blueprint (~10–15 мин)

Зачем: поднять api/web/worker + Postgres + Redis + Meilisearch по готовому
Blueprint `infra/render.staging.yaml` (регион Frankfurt). Общий контекст —
`docs/MANAGED-CLOUD-LAUNCH.md` §3.

- [ ] render.com → создать workspace (план Pro), подключить GitHub-организацию.
- [ ] Blueprints → **New Blueprint Instance** → выбрать репозиторий → указать
      файл `infra/render.staging.yaml` (НЕ корневой `render.yaml` — это
      production-Blueprint, его импортируют позже и отдельно).
- [ ] После импорта открыть каждый сервис → Environment и заполнить все
      `sync: false` значения (значения появятся в пункте 3):
      `S3_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` — из Cloudflare R2;
      `SENTRY_DSN` — из Sentry. Полную расшифровку каждой переменной и «где
      взять» даёт `apps/api/.env.production.example`.
- [ ] На Key Value `alistore-redis-staging` включить **Internal Authentication**
      и сделать Resync Blueprint — иначе `REDIS_URL` без пароля не пройдёт
      production-preflight API.
- [ ] Custom domains (каждый сервис → Settings → Custom Domains):
      `api-staging.ali.kg` → api, `staging.ali.kg` и
      `admin-staging.ali.kg` → web. DNS-записи — в пункте 3 (Cloudflare).
- [ ] Deploy hooks: каждый из трёх сервисов → Settings → **Deploy Hook** →
      скопировать URL → вставить в GitHub Secrets из пункта 1
      (`RENDER_DEPLOY_HOOK_API` / `_WEB` / `_WORKER` соответственно).
- [ ] Дождаться первого деплоя. Миграции применятся сами: у api в Blueprint
      стоит `preDeployCommand: npm run db:deploy -w @alistore/api`.
- [ ] Проверка с локальной машины:

  ```bash
  WEB_BASE_URL=https://staging.ali.kg \
  API_BASE_URL=https://api-staging.ali.kg \
  node scripts/deployment-smoke.mjs
  ```

Готово, когда: smoke-скрипт печатает `Deployment smoke passed.`, а workflow
«CD — Staging» в GitHub Actions зелёный (миграции → deploy hooks → health-check).

Откат: Render Dashboard → сервис → Events → Rollback на предыдущий успешный
деплой. Базу назад не откатывать — только прямые миграции
(`docs/MANAGED-CLOUD-LAUNCH.md` §5).

---

## 3. Sentry + Cloudflare + R2 EU (~10 мин)

Зачем: мониторинг ошибок (Sentry), DNS/TLS/WAF (Cloudflare), приватное
S3-хранилище Evidence Vault и медиа в EU (R2). Подробности и ограничения —
`docs/MANAGED-CLOUD-LAUNCH.md` §2 и §4.

**Sentry**

- [ ] sentry.io → создать организацию → New Project → платформа **Node.js** →
      скопировать DSN.
- [ ] Вставить DSN в Render: сервис `alistore-api-staging` → Environment →
      `SENTRY_DSN` (web и worker подтянут его автоматически через Blueprint
      `fromService`). `SENTRY_ENVIRONMENT=staging` уже задан в Blueprint.

**Cloudflare**

- [ ] dash.cloudflare.com → Add site → `ali.kg` → выдать два NS-сервера →
      вписать их у регистратора (пункт 6).
- [ ] SSL/TLS → режим **Full (Strict)**. HSTS включать только после того, как
      staging-домены отвечают по HTTPS.
- [ ] DNS → добавить CNAME-записи (Proxied) на таргеты из Render Custom Domains:
      `staging`, `admin-staging`, `api-staging`. Origin-хосты `*.onrender.com`
      нигде не публиковать.
- [ ] Позже (перед продом, по `docs/MANAGED-CLOUD-LAUNCH.md` §4): WAF managed
      rules, rate-limit на OTP/checkout/webhook, Access для `admin.*`.

**Cloudflare R2 (EU)**

- [ ] R2 → Create bucket: `alistore-media-staging` и `alistore-backups-staging`,
      юрисдикция **EU**, оба приватные.
- [ ] R2 → Manage R2 API Tokens → Create API token: Object Read & Write, scope —
      только эти два бакета. Скопировать: endpoint
      `https://<account-id>.r2.cloudflarestorage.com`, Access Key ID, Secret.
- [ ] Вставить в Render (`alistore-api-staging` → Environment):
      `S3_ENDPOINT` = endpoint, `MINIO_ROOT_USER` = Access Key ID,
      `MINIO_ROOT_PASSWORD` = Secret. Имена бакетов (`MINIO_BUCKET`,
      `S3_BACKUP_BUCKET`) уже заданы в Blueprint — сверить с фактическими.

Готово, когда: в Sentry видно тестовое событие со staging, `dig staging.ali.kg`
резолвится в Cloudflare, а в Render все `sync: false` поля заполнены.

---

## 4. Apple Developer ($99) и Google Play ($25) — отдельный трек на дни

Активных действий примерно час, но оплата, выдача D-U-N-S и проверка документов
занимают дни. Релизные детали — `apps/ios/store/release-runbook.md`,
метаданные — `apps/ios/store/client-metadata.json` и
`apps/android/store/data-safety.json`.

**Apple Developer**

- [ ] Получить D-U-N-S номер для ИП/ОсОО (бесплатно, до нескольких дней):
      данные должны точно совпадать с регистрационными документами.
- [ ] developer.apple.com → Enroll ($99/год) от имени ИП/ОсОО.
- [ ] App Store Connect → Agreements, Tax, Banking заполнить полностью.
- [ ] My Apps → New App для каждого bundle id (уже зашиты в проект):
      `kg.alistore.client`, `kg.alistore.staff`, `kg.alistore.courier`,
      `kg.alistore.pos`.
- [ ] Users and Access → Integrations → App Store Connect API → создать ключ →
      скачать `AuthKey_<KEYID>.p8` → положить в
      **`~/.appstoreconnect/private_keys/`** — именно оттуда его читает
      `apps/ios/store/release-runbook.md` через `ASC_API_KEY_PATH`. (Путь
      `apps/mobile/` из прежней редакции — мёртвая папка, там только README.)
      Issuer ID и Key ID передаются через `ASC_ISSUER_ID` / `ASC_KEY_ID`, в git
      их нет.
- [ ] TestFlight: собрать архив по `apps/ios/store/release-runbook.md`
      (`npm run ios:store-preflight`, затем `xcodebuild archive` + upload),
      добавить внутренних тестировщиков.

**Google Play**

- [ ] play.google.com/console → регистрация ($25, разово) → верификация личности
      по документам ИП/ОсОО.
- [ ] Create app → package name `kg.alistore.client` (затем `.staff`,
      `.courier`, `.pos`) → Internal testing track.
- [ ] **Адрес API для release-сборки.** Все четыре модуля падают на сборке
      release без `ALISTORE_API_BASE_URL` (`require(... startsWith("https://"))`).
      Это Gradle-property, **не** переменная окружения: задаётся флагом
      `-PALISTORE_API_BASE_URL=https://api.ali.kg` при сборке **или** строкой
      `ALISTORE_API_BASE_URL=https://api.ali.kg` в `~/.gradle/gradle.properties`.
      В `apps/android/gradle.properties` (он под git) прописывать боевой адрес не
      нужно; `local.properties` тут не читается.
- [ ] Data safety: форма заполняется по готовому листу
      `apps/android/store/data-safety.json` (перед отправкой — review
      владельцем/юристом). Проверка локально: `npm run android:store-preflight`.
- [ ] Google Cloud Console → Service account → JSON-ключ → хранить **вне git**
      (не в `apps/mobile/` — это мёртвая папка). Файл нужен только вашему
      инструменту загрузки в Play, репозиторий его не читает; привязать к Play
      Console (Setup → API access).
- [ ] Для обоих сторов нужен публичный URL политики конфиденциальности —
      финальные тексты даёт юрист (скелет роутов уже есть в коде).

Готово, когда: сборка видна в TestFlight и в Play Internal testing, тестировщик
ставит приложение на физическое устройство.

---

## 5. Push-уведомления: Firebase (~10 мин)

Зачем: FCM для Android и APNs-транспорт для iOS. Код регистрации токенов уже
есть; не хватает только файлов конфигурации (это `GAP-PUSH-CONFIG-001`).
Bundle/package id перечислены в пункте 4.

- [ ] console.firebase.google.com → Create project (например `alistore`).
- [ ] Add Android app для **трёх** package name с Firebase → скачать
      `google-services.json` и положить в свой модуль (файл читается на сборке,
      путь покрыт `.gitignore`):
      - `kg.alistore.client` → **`apps/android/app/google-services.json`**
      - `kg.alistore.staff` → **`apps/android/staff/google-services.json`**
      - `kg.alistore.courier` → **`apps/android/courier/google-services.json`**
      Модуль **`pos` Firebase не использует** — для `kg.alistore.pos` файл не
      нужен, и `require` на него не сработает. Проверка:
      `git check-ignore apps/android/app/google-services.json`.
- [ ] iOS **Firebase не использует** — пуш идёт напрямую через APNs, файл
      `GoogleService-Info.plist` не нужен ни одному iOS-таргету (в `apps/ios`
      нет ни одной ссылки на Firebase). Прежний шаг с `apps/mobile/` был неверен.
- [ ] Project settings → Service accounts → Generate new private key → JSON →
      содержимое в Render env `FCM_SERVICE_ACCOUNT_JSON` (либо файл вне git +
      `FCM_SERVICE_ACCOUNT_KEY_PATH`). Сам JSON в git НЕ коммитить.
- [ ] APNs: developer.apple.com → Keys → новый ключ с Apple Push Notifications →
      `.p8` загрузить в Firebase (iOS app → Cloud Messaging → APNs
      authentication key). `APNS_KEY_ID` и `APNS_TEAM_ID` — в Render env
      (см. `apps/api/.env.production.example`).

Готово, когда: файлы лежат по указанным путям, `git status` их не показывает, а
`FCM_SERVICE_ACCOUNT_JSON` заполнен в Render.

---

## 6. Регистратор ali.kg (~3 мин + ожидание делегирования)

- [ ] В панели регистратора `.kg` проверить, что домен `ali.kg` активен и
      продлён.
- [ ] Заменить NS на два сервера из пункта 3 (Cloudflare).
- [ ] Проверить с локальной машины:

  ```bash
  dig NS ali.kg +short        # должны вернуться NS Cloudflare
  dig staging.ali.kg +short   # после настройки DNS — CNAME на Render
  ```

Готово, когда: Cloudflare показывает домен Active, staging-хосты резолвятся.
Делегирование NS может занимать до 24 часов — это нормально.

---

## Что остаётся после этого чек-листа (не владелец, а следующие гейты)

- Production-Blueprint `render.yaml` импортируется отдельно и вручную, после
  staging-soak (rollback/backup drills по `docs/MANAGED-CLOUD-LAUNCH.md` §5 и
  `infra/RUNBOOK.md`).
- Живые провайдеры (SMS, платёж, фискализация) включаются только после контрактов
  и сертификации — см. `GET /api/health/integrations` на staging и
  `docs/PRODUCTION-ACTIVATION.md`.
- Финальный гейт перед продом: `npm run launch:check` на машине разработчика.

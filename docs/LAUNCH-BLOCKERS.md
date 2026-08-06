# AliStore — полная карта готовности (что мешает открыться)

> Что мешает открыться и что осталось до зрелой экосистемы. Gate 0 truth refresh: 2026-08-06.
> Дополняет [`READINESS.md`](./READINESS.md) (снимок фаз) и [`MASTER-PLAN.md`](./MASTER-PLAN.md)
> (гейты). Источники: `apps/api/src/health/external-readiness.ts`,
> `OWNER-LAUNCH-CHECKLIST.md`, `BACKLOG.md`, инвентарь кода (61 backend module file по
> `find apps/api/src -mindepth 2 -maxdepth 2 -name '*.module.ts'`, 43
> web-роута, 4 нативных приложения ×2 платформы).

## Как читать

- **Владелец ответственности:** 🟦 КОД (строим сами) · 🟨 ВЛАДЕЛЕЦ (решения/договоры) · 🟥 ВНЕШНЕЕ (провайдеры/аккаунты/железо)
- **Приоритет:** P0 = блокер запуска · P1 = сильно влияет · P2 = важно, не блокер
- **Объём:** S = < дня · M = дни · L = недели / много сессий
- **Горизонт:** [ЗАПУСК] 1-й магазин · [АВАРИЯ] переживёт сбой · [РОСТ] зрелая экосистема

**Главное:** локальная software-проверка и production certification — разные гейты.
Исторические счётчики тестов ниже не являются текущим acceptance; актуальные команды и
результаты привязаны к SHA в `docs/acceptance/gate-0-final-2026-08-06.md`.
Магазин **не готов** к запуску: критический путь упирается в владельца и внешние
договоры, не в код.

---

## Слой 1 — Легально открыть первый магазин [ЗАПУСК]

Без этого слоя торговать нельзя. Это самый долгий путь — начинать первым.

| Пункт | Кто | P | Объём | Состояние |
|---|---|---|---|---|
| **Фискализация ОФД/ККМ** (`GAP-FISCAL-001`) | 🟨+🟥 | P0 | L | чеки «информационные»; нужен договор с ОФД КР + `FISCAL_PROVIDER*` |
| — честный гейт фискализации | 🟦 | P0 | — | **сделано 24.07.** `external-readiness.ts` теперь содержит blocking-проверку `fiscal_provider` → `launch:check` краснеет без сертифицированного ОФД. Реальный адаптер `provider.issue()` — когда владелец выберет ОФД |
| **Юр-документы** (оферта, ПДн, паспорт при Б/У, ЗПП) | 🟨 | P0 | M | пакет юристу готов — `docs/review/LAWYER-PACKAGE.md` |
| **Платёжный шлюз** | 🟥 | P0 | M | прод-провайдер — заглушка 503; сейчас только наличные. `PAYMENT_PROVIDER_CERTIFIED` |
| **SMS/OTP боевой** | 🟥 | P0 | S | прод-отправитель не активирован. `SMS_PROVIDER_CERTIFIED` |
| **Push Android** (`GAP-PUSH-CONFIG-001`) | 🟨+🟥 | P0 | S | нет `google-services.json`/`FCM_SERVICE_ACCOUNT_JSON` |
| **Аккаунты и отправка в сторы** | 🟨 | P0 | M | Apple($99,D-U-N-S)+Google($25); 4 приложения собраны, в `PREPARE_FOR_SUBMISSION`, но **не отправлены** |
| **Вход ревьюера сторов** | 🟦 | P0 | S | **схема решена и достижима с 31.07.** Эхо OTP в проде по-прежнему выключено — вместо него `AUTH_REVIEW_PHONE/OTP/UNTIL`: один согласованный номер, фиксированный код, окно ≤7 дней. Раньше механизм жил только в `verifyOtp`, а `requestOtp` отдавал 503 при `SMS_PROVIDER=disabled` — поле кода на клиентах не появлялось; теперь запрос кода для этого номера проходит. Осталось владельцу: выставить три переменные перед Submit и погасить после ревью |

---

## Слой 2 — Технически живой: внешние доступы [ЗАПУСК]

Машинный гейт `npm run launch:check` = **21 блокирующая проверка**
(`external-readiness.ts`). **Фискализация теперь среди них** (blocking-проверка
`fiscal_provider`, добавлена 24.07) — гейт больше не проходит зелёным без ОФД.

| Проверка | Кто | P |
|---|---|---|
| payment_gateway / sms_provider / native_push_android | 🟥 | P0 (см. Слой 1) |
| telegram_bot · whatsapp_business · apple/telegram social login | 🟥 | P1 — токены каналов/клиентов |
| s3_media_storage (R2) · observability (Sentry `SENTRY_DSN`) | 🟨 | P1 |
| campaign_delivery (Novu/SMTP/Telegram/WhatsApp/Expo/FCM) | 🟥 | P1 |
| native_push_ios (APNs) | 🟨+🟥 | P0 — ключ + физическая доставка/роутинг |
| outbox_health (pending/DLQ age) | 🟦+🟨 | P0 — текущая наблюдаемость и delivery evidence |
| meilisearch | 🟦+🟨 | P1 — индекс/rebuild/fallback evidence |
| native_links | 🟨+🟥 | P0 — production domain + physical release builds |
| backup_restore | 🟦+🟨 | P0 — recorded production-shaped restore |
| partner_payout_provider | 🟨+🟥 | P0 — idempotent payout + statement reconciliation |
| pos_hardware (сканер/ESC-POS-принтер/терминал) `POS_HARDWARE_CERTIFIED` | 🟥 | P1 |
| ai_provider (keyless-fallback работает и без ключа) | 🟥 | P2 |

Статус каждой строки имеет ровно четыре значения: `missing` (нет обязательной
конфигурации), `configured` (настроено, но live evidence ещё нет), `certified`
(явная operator/deployment attestation после ручной проверки) или `blocked` (конфигурация/ручной
гейт не позволяет продолжать). Credentials и наличие адаптера никогда не дают
`certified` автоматически.

`*_CERTIFIED=true` — изменяемая deploy-owned аттестация, а не immutable evidence и не
криптографическая привязка к SHA. Она означает, что названный owner/operator проверил
close criteria и записал reference по указанному пути. API не открывает и не валидирует
этот файл или SHA. Маркер обязан быть сброшен при release-зависимой смене провайдера,
модели, credentials, callback/domain, политики или проверяемого устройства.

### Gate 0: owner, close criteria and evidence

| Row | Exact owner | Close criteria | Evidence location |
|---|---|---|---|
| `ai_provider` | AI/Product owner + Security reviewer | Reference prompts cover grading/pricing/moderation/tool boundaries; production-shaped calls redact secrets/PII and cannot mutate money/stock/RBAC; operator records provider/model/config and may then attest `AI_PROVIDER_CERTIFIED=true` | `docs/acceptance/provider/ai-provider-<release-sha>.md` |
| `telegram_bot` | Channels owner + AliStore BotFather owner | HTTPS webhook secret header, production message and Mini App tenant/account routing pass; operator may then attest `TELEGRAM_BOT_CERTIFIED=true` | `docs/acceptance/provider/telegram-bot-<release-sha>.md` |
| `whatsapp_business` | Channels owner + AliStore Meta Business owner | Webhook verification/callback handling and production-shaped inbound/outbound customer/order reconciliation pass; operator may then attest `WHATSAPP_BUSINESS_CERTIFIED=true` | `docs/acceptance/provider/whatsapp-business-<release-sha>.md` |
| `apple_social_login` | Identity/Mobile owner + AliStore Apple owner | Production web/native intended audience succeeds, wrong audience fails, private-email relay links once; operator may then attest `APPLE_SOCIAL_LOGIN_CERTIFIED=true` | `docs/acceptance/provider/apple-login-<release-sha>.md` |
| `google_social_login` | Identity/Web owner + AliStore Google Cloud owner | Every intended web/native audience and production origin/redirect succeeds, wrong audience fails, identity links once; operator may then attest `GOOGLE_SOCIAL_LOGIN_CERTIFIED=true` | `docs/acceptance/provider/google-login-<release-sha>.md` |
| `telegram_social_login` | Identity/Channels owner | Current signed production initData succeeds, tampered/expired payload fails, customer identity links once; operator may then attest `TELEGRAM_SOCIAL_LOGIN_CERTIFIED=true` | `docs/acceptance/provider/telegram-login-<release-sha>.md` |
| `campaign_delivery` | Growth/Channels owner | Production-shaped consented segment delivery, provider rejection/retry/idempotency and unsubscribe reconciliation pass; operator may then attest `CAMPAIGN_DELIVERY_CERTIFIED=true` | `docs/acceptance/provider/campaign-delivery-<release-sha>.md` |
| `s3_media_storage` | Platform/Operations owner + AliStore R2 owner | Production bucket upload/download/delete, least privilege, URL/retention and outage behavior pass; operator may then attest `S3_MEDIA_STORAGE_CERTIFIED=true` | `docs/acceptance/operations/s3-media-<release-sha>.md` |
| `observability` | Platform/Operations owner | Controlled API/Web error reaches the production project without secrets/PII and alerts the on-call route; operator may then attest `OBSERVABILITY_CERTIFIED=true` | `docs/acceptance/operations/observability-<release-sha>.md` |
| `native_push_ios` | Mobile Release owner + AliStore owner (Apple account) | `APNS_KEY_ID`/`APNS_TEAM_ID`; physical iPhone receives foreground/background push and opens the owner-scoped route on the release build; operator may then attest `APNS_CERTIFIED=true` | `docs/acceptance/provider/apns-<release-sha>.md` |
| `outbox_health` | Platform/Operations owner | Relay enabled with non-log transport; `/api/observability/status` observation records pending depth/oldest pending age under policy, failed/DLQ depth, worker heartbeat and one delivered/redriven message. The endpoint currently lacks oldest failed age, so certification remains blocked until that age is captured by an extended endpoint or an attached query artifact | `docs/acceptance/operations/outbox-health-<release-sha>.md` |
| `meilisearch` | Search/Platform owner | Rebuild from PostgreSQL succeeds; typo/facet query reports Meilisearch; outage falls back to PostgreSQL; restore runbook rebuilds index; operator may then attest `MEILISEARCH_CERTIFIED=true` | `docs/acceptance/operations/meilisearch-<release-sha>.md` |
| `native_links` | Mobile Release owner + Domain/Cloudflare owner | Production AASA/assetlinks contain exact release identifiers; physical iOS/Android release builds open trusted HTTPS links and reject wrong hosts; operator may then attest `NATIVE_LINKS_CERTIFIED=true` | `docs/acceptance/native/native-links-<release-sha>.md` |
| `backup_restore` | Platform/Operations owner + AliStore owner (R2 credentials) | Fresh production-shaped bucket backup restores to isolation; schema/triggers/accounting/table counts reconcile; Evidence objects are restored or independently verified; operator may then attest `BACKUP_RESTORE_CERTIFIED=true` | `docs/acceptance/operations/backup-restore-<release-sha>.md` |
| `partner_payout_provider` | Finance owner + AliStore owner + selected bank/provider | Retry is idempotent, unique external reference persists, rejection cannot double-settle, provider statement reconciles gross/commission/partner amount; operator may then attest `PARTNER_PAYOUT_PROVIDER_CERTIFIED=true` | `docs/acceptance/provider/partner-payout-<release-sha>.md` |

---

## Слой 3 — Переживёт аварию: надёжность и эксплуатация [АВАРИЯ]

Опаснее любой недостающей фичи — невосстановимый день продаж дороже.

| Пункт | Кто | P | Состояние |
|---|---|---|---|
| Бэкап: продовый путь + hardening | 🟦 | — | **сделано 24.07** (drill, 5 дефектов, `verify-restored-database.mjs`) |
| Восстановление из **прод-бакета R2** | 🟨 | P1 | инструмент доказан, из самого бакета не восстанавливали — ключи владельца |
| Бэкап staging + R2-evidence + Meilisearch (`GAP-BACKUP-OPS-001/002`) | 🟦+🟨 | P1 | нет джобы на staging; PITR (wal-g/pgBackRest) открыт |
| Наблюдаемость: uptime-монитор, агрегация логов, доставка алертов (`GAP-OBSERVE-*`) | 🟦+🟥 | P1 | софт-слой есть; **доставка алертов не доказана** (нет живых кредов) |
| DLQ-видимость + добить BullMQ (`GAP-JOBS-OBS-001`) | 🟦 | P2 | reservation/debt-шедулеры ещё на pg-boss |
| Тест-изоляция (`VERIFY-078`) | 🟦 | — | **сделано** (`api:test:isolated`, шаблон-БД) |
| Остаточные флаки (`FLAKE-001..003`) | 🟦 | P2 | ~40% прогонов 1–2 флака; источник не диагностирован |
| Load/soak тест (`GAP-LOAD-001`) | 🟦 | P2 | нет; отчёты агрегируют неограниченную историю |
| Nonce-CSP вместо `unsafe-inline` (`GAP-CSP-001`) | 🟦 | P2 | `config/runtime-security.ts` |

---

## Слой 4 — Продукт, который можно строить сейчас (без владельца/внешних) [ЗАПУСК/РОСТ]

| Пункт | P | Объём | Состояние |
|---|---|---|---|
| Клиентская аналитика/воронка (`GAP-ANALYTICS-001`) | P1 | M | **сделано 24.07** |
| i18n + кыргызский (`GAP-I18N-001`) | P1 | L | стека нет, RU захардкожен ~40 роутов + 8 нативных; **не начато** |
| Нативные пробелы (`MOB-018..020`): гостевой checkout, approvals+2FA в Staff, UTM | P1 | L | не начато (нужен симулятор-тулинг) |
| ERP-UI остаток: scorecard/spend/tasks-create — **сделано**; Z-отчёт/waitlist/handover — нужен бэкенд | P2 | M | 3 экрана сделано 24.07; остальное — `UI-010-REMAINDER`, `UI-SHIFT-HANDOVER-001` |
| Абандон-заказы (законно уже сейчас) | P2 | S | не начато |

---

## Слой 5 — Финансовая и учётная зрелость [РОСТ]

Домены реализованы (двойная запись реальна), но «принято бухгалтером реального
магазина» — нет.

| Пункт | Кто | P |
|---|---|---|
| `ACC-003` — полный GL-цикл: приёмка бухгалтера/налоговой КР, проведённая FX-переоценка, закрытие периода до неизменяемой первички | 🟨+🟦 | P1 |
| `AP-001` — счета поставщиков, 3-way match, AP-aging: приняты локально, нужна живая валидация учёта | 🟨+🟦 | P1 |
| Trade-in без проводки/прихода — решение бухгалтера по счетам | 🟨 | P2 |

---

## Слой 6 — Дизайн-корпус и консистентность документации [РОСТ]

| Пункт | Кто | P |
|---|---|---|
| `ECO-001` — 64 недостающих `.dc.html` (23 handoff'а ссылаются): **restore или явный retire**; strict-audit красный до подписи (`docs/acceptance/DESIGN-CORPUS-RETIRE-PROPOSAL.md`) | 🟨+🟦 | P1 |
| ERP-shell polish: токены, radius, topbar/sidebar/logout | 🟦 | P2 |
| `DOC-CONFLICT-002` — противоречия в доках (фискализация, счётчики, CASL vs casbin, realtime CORS `*`) | 🟨 | P2 |

---

## Слой 7 — Структурные пробелы под рост [РОСТ]

Ожидаемое для розницы электроники, чего в коде нет вовсе. Крупные, поздние.

| Пункт | Кто | Объём |
|---|---|---|
| SMS как канал рассылок (сейчас только OTP; в Outbox SMS-транспорта нет) | 🟦+🟥 | M |
| Постоянные B2B-прайс-листы/тиры (сейчас только котировки под заявку) | 🟦 | M |
| Складская адресация до ячейки (bin-level WMS; сейчас до точки) | 🟦 | L |
| Интеграции маркетплейсов (Kaspi и пр.) + экспорт прайс-фидов | 🟦+🟥 | L |
| Выгрузка в 1С / внешнюю бухгалтерию | 🟦 | M |
| Крипто-целостность аудита (hash-chain; сейчас append-only только по соглашению ORM) | 🟦 | M |
| `MKT-008` — сертифицированные рекламные/мессенджер-провайдеры к lifecycle кампаний | 🟥+🟦 | M |
| `WAVE-C-002` — обучение+допуск, рефералка, Q&A, живой чат, WhatsApp-логин, супер-админ, BI (без кода/трекинга) | 🟦 | L |

---

## Что уже сделано (баланс — чтобы карта не читалась как «ничего нет»)

Полноценно реализовано и протестировано: касса/смены, склад (серийный+количественный,
Evidence Vault), заказы, **двойная бухгалтерия** (план счетов, расходы, банк-сверка,
периоды, ОС+амортизация, долги), CRM+лояльность, закупки+поставщики+консигнация,
сервис/гарантия/трейд-ин/подменный фонд, HR+зарплата, доступ (10 ролей, four-eyes,
2FA), уведомления (Outbox multi-channel + consent). 2026-07-24 добавлено:
воспроизводимый гейт + изоляция БД, hardening бэкапов, `StaffUser.point`→FK,
аналитика-воронка, 3 ERP-экрана (supplier scorecard, campaign spend, staff-tasks create).

---

## Критический путь и порядок

1. **🟨 Владелец — сразу, параллельно (самое долгое):** выбрать ОФД; юрист+бухгалтер
   (пакеты готовы); Render/домены/каталог; аккаунты Apple/Google.
2. **🟦 Код — не дожидаясь владельца:** каркас фискализации (чтобы гейт честно
   краснел) → нативный вход ревьюера → i18n/KY → нативные пробелы.
3. **🟥 Внешнее — по мере договоров:** активировать платежи/SMS/push → `launch:check`
   до зелёного (уже с фискализацией).
4. **🟦+🟨 Перед запуском [АВАРИЯ]:** восстановление из R2-бакета; staging-бэкап;
   отправка 4 приложений; staging-soak.
5. **[РОСТ] после запуска:** финансовая зрелость (Слой 5), дизайн-корпус (Слой 6),
   структурные пробелы (Слой 7).

**Вывод:** «функционирует» — по коду в основном да. «Готово открыться» — нет; и почти
весь блокирующий путь (Слои 1–2) — это владелец и внешние договоры, а не код. Код
может двигаться параллельно по Слоям 3–4 и каркасу фискализации, не дожидаясь никого.

# Анализ «что мы забыли» — срез 2026-07-17

Независимая проверка поверх собственных аудитов репо (`AUDIT-FINDINGS.md` G4, `READINESS.md`,
`ARCHITECTURE-GAP-MAP.md`, `MASTER-EXECUTION-PLAN-CURRENT.md`). Проверялись: `main.ts`,
`config/runtime-security.ts`, `payments/payments.controller.ts`, `outbox/transports/`,
`observability/`, `infra/backup.sh`, `.github/workflows/`, `apps/web/app`, `apps/mobile/app.json`,
`apps/ios/store`, `apps/android`, `apps/api/.env.example`.

Проект хорошо отслеживает свои внешние блокеры (платёжный шлюз, SMS, APNs/FCM, POS-железо,
staging-деплой) — они в `READINESS.md` и `/health/integrations`. Ниже — то, чего в этих списках
**нет или что недооценено**. Задачи внесены в `BACKLOG.md`, раздел «Gap Analysis 2026-07-17».

---

## A. Юридика и фискализация (самый слепой угол)

1. **P0 — Фискализация ККМ/ОФД для Кыргызстана отсутствует как модуль.** Розничная продажа в КР
   обязана идти через ККМ с передачей в ОФД/ГНС. В коде только `documents/roboto-font.ts`
   (PDF-чек) — нет fiscal-регистратора, фискальных номеров, НДС-реквизитов в чеке, Z-отчётов.
   `READINESS.md` упоминает «fiscal certification» как внешний гейт, но интеграционного слоя
   (драйвер ККМ / API ОФД) нет вообще — это не «подставить ключи», это модуль, который надо
   проектировать: fiscal line в чеке, связка с refund/exchange, офлайн-ККМ.
2. **P0 — Юридические страницы отсутствуют.** В `apps/web/app` есть только `about`; не найдено
   privacy policy, публичной оферты, согласия на обработку персональных данных (закон КР о ПД +
   требование App Store / Google Play — без privacy URL приложение не пройдёт review).
   Cookie-consent отсутствует.
3. **P1 — Retention-политика для сканов паспортов в Evidence Vault** не определена (доступ
   кассиров к нац. ID уже отмечен в G4).

## B. Маркетинг, SEO, аналитика

4. **P1 — Нет SEO-фундамента витрины.** Не найдено `sitemap.xml`, `robots.txt`, JSON-LD
   (Product/Offer/Breadcrumb), hreflang. В Next.js решается через `app/sitemap.ts` / `app/robots.ts`.
5. **P1 — Нет клиентской аналитики.** Ни gtag/Метрики/PostHog в `apps/web`, ни аналитики в
   нативных приложениях. Серверный privacy-safe funnel есть, но без клиентских событий
   (просмотр карточки, корзина, брошенная корзина) UTM/ROAS-модуль кампаний не получит реальные
   конверсии с витрины.
6. **P2 — Нет механики брошенной корзины** (напоминание через outbox/SMS/push) — инфраструктура
   уведомлений уже есть.

## C. Локализация

7. **P1 — i18n отсутствует как система.** Ни `next-intl`/`i18next` в web/mobile, ни словарей —
   строки зашиты в код по-русски. Кыргызский язык — государственный; плюс SEO RU/KG. Чем дальше,
   тем дороже выковыривать строки из ~40 роутов и 8 приложений. Решение о стеке i18n нужно до
   релиза, даже если KG-перевод сделать позже.

## D. Мобильные релизы

8. **P0 — Push не взлетит без артефактов:** `google-services.json` / `GoogleService-Info.plist`
   отсутствуют (FCM-каркас и серверные транспорты есть, но без конфигурации доставка невозможна);
   APNs-ключи — внешний гейт (отслеживается).
9. **P1 — App Store / Google Play пакет неполон:** `apps/ios/store` = только
   `client-metadata.json` + `release-runbook.md`. Нет privacy manifest (Apple обязует),
   data-safety формы (Google обязует), privacy policy URL (см. п.2 — блокер). Скриншоты
   генерируются скриптом `ios:store-screenshots` из принятых visual evidence.
10. **P1 — Universal Links / App Links не настроены** — только custom scheme `alistore://`.
    Возврат из платёжного шлюза и ссылки из SMS/email в проде надёжнее через HTTPS-ссылки.
11. **P2 — Expo-клиент `kg.alistore.mobile`** выглядит живым артефактом (app.json, eas
    build/submit), хотя документы объявляют его legacy reference. Либо архивировать с
    deprecated-маркером, либо явно зафиксировать роль.

## E. Операции / инфраструктура

12. **P1 — Нет CD-пайплайна.** Единственный workflow — `ci.yml` (тесты+trivy+gitleaks). Деплой
    на Render ручной, нет staging auto-deploy, нет release-workflow для нативных сборок
    (`ARCHITECTURE-GAP-MAP`: «add native builds and signed release workflows»).
13. **P1 — Наблюдаемость тонкая.** Observability = только Sentry-фильтр ошибок. Нет метрик
    (Prometheus-эндпоинта), uptime-мониторинга, алерт-канала (Telegram/email при падении
    API/worker), дашбордов по outbox/jobs, лог-агрегации.
14. **P1 — Бэкапы не операционализированы.** `infra/backup.sh` сам признаёт «Authored, NOT run» —
    не подключён к cron, нет restore-дреля, нет PITR (wal-g/pgBackRest), нет бэкапа
    Evidence-объектов (S3/MinIO).
15. **P2 — Job-наблюдаемость:** BullMQ-миграция не завершена (reservation/debt на pg-boss),
    DLQ-дашборда и метрик задач нет.

## F. Безопасность — остатки после G4 (проверено по коду)

16. **P1 — `POST /payments` (пометить оплаченным) всё ещё `OptionalJwtAuthGuard`**
    (`payments.controller.ts:73-74`) — находка G4 №1 закрыта наполовину (GET уже под guard).
    CSP содержит `scriptSrc 'unsafe-inline'` (`runtime-security.ts`) — для ERP желательна
    nonce-based CSP.
17. **P2 — Rate-limit staff-auth** (брутфорс пароля/TOTP) — по G4 был без throttle; перепроверить
    и закрыть.
18. **P2 — Проверить in-app удаление аккаунта** (требование Apple): e2e
    `customer-account-data.spec.ts` намекает, что export/delete есть, — убедиться, что delete
    доступен из мобильного клиента, а не только по API.

## G. Тесты и качество

19. **P1 — Только Chromium** в Playwright; checkout не проверен в WebKit/Firefox (клиенты на
    iPhone = Safari).
20. **P2 — Единый FK-safe reset-helper для тестов** не сделан (флейк-вектор ~93 спеков, инцидент
    `eeb616f`).
21. **P2 — Нагрузочного/soak-теста нет.** Отчёты считают по всей истории (G4 HIGH №11) — под
    нагрузкой первый же месяц покажет.

## H. Процесс/документация

22. **P2 — Документы расходятся с кодом:** `READINESS.md` говорит «53 модуля / 39 роутов / 100
    миграций», фактически уже 62 модуля. Статусные документы стоит регенерировать из кода, а не
    вести руками.
23. **P2 — Нет CHANGELOG/версионирования релизов** и версии API-контракта для нативных клиентов
    (при расхождении версий приложение и API разъедутся молча).

---

## Что код не решит — нужны владелец/внешний мир

- выбор фискального провайдера (ККМ/ОФД в КР) и юрист/бухгалтер для оферты/privacy/НДС-реквизитов;
- SMS sender ID, боевой платёжный шлюз, Apple/Google-аккаунты (уже отслеживаются в
  `READINESS.md` → `/health/integrations`);
- POS-железо для сертификации.

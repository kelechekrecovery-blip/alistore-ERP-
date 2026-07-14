# Codex Handoff — остаток до конца MVP

> Исторический handoff Claude, сохранённый как контекст. Он не является текущим отчётом
> готовности. Актуальные доказательства и остаток находятся в `BACKLOG.md`,
> `ECOSYSTEM-COMPLETION-AUDIT.md` и `ECOSYSTEM-TRACEABILITY-MATRIX.md`.

## A. Лана Codex — можно делать сейчас (без внешних блокеров)

Старая фраза об отсутствии открытых software-задач больше не применима: Service Center,
Store Operations, CMS, Analytics, Legal, all-role E2E, native app-level E2E и visual
acceptance имеют незаблокированный объём работ.

Закрыто Codex-итерациями: transactional outbox + Novu/email/realtime/channel transport switch,
consent-filtered transactional templates for orders/warranty/reservations/debt reminders,
consent-filtered Campaign Segment Builder + Campaign ROI,
Excel import idempotency, OTP access recovery with refresh-session revocation,
receipt split tenders, order invoice/waybill PDF, infra runbook for Caddy/backups/restore,
trade-in IMEI intake + `imei_reuse` risk activation, realtime/socket.io, Sentry/GlitchTip hook,
i18n, health-checks, public endpoint rate limits, print/PDF polish for receipts/labels/contracts,
gift cards/store credit with checkout redemption, Playwright E2E smoke pack + CI workflow,
Admin Product Management UI (`/admin/products`) with staff-only product CRUD, keyless AI
category/description enrichment, approval-gated price/archive actions, and Telegram Mini App
shell (`/tg`) with shared catalog/checkout API and `channel=telegram` order flow,
click&collect fulfillment metadata (`fulfillmentType`, pickup point/address/slot, pickup code)
surfaced through checkout/account/staff/warehouse queues,
plus `GET /health/integrations` external-readiness report for provider keys/manual hardware
gates without exposing secret values, and P0 owner data hardening: `/reports/*` + `/ai/*`
are staff-RBAC protected with shared staff-session web token handoff; customer order timeline
uses scoped `GET /orders/:id/ledger` instead of the owner ledger feed. Social auth backend is
provider-ready: `CustomerIdentity`, Telegram signed initData verifier, Apple identityToken JWKS
verifier, and `/login` Telegram Mini App session handoff.

## B. Требуют миграции схемы (Prisma) — координировать аддитивно

10. **Повтор IMEI (скупка + продажа) как риск.** ✅ ЗАКРЫТО Codex.
    `CreateTradeInDto` и `POST /tradeins/intake` принимают `imei`, `TradeInsService.create()`
    пишет его в `TradeInDevice.imei`, ledger refs включают IMEI, `/staff` и `/trade-in`
    умеют передать номер. Приёмка покрыта: intake с `imei` заполняет колонку; тот же `imei`
    среди `DeviceUnit(status=sold)` даёт high-риск `imei_reuse` в Risk Center.
11. **Споры v2 (если нужна отдельная модель).** MVP уже использует refund/return approval flow
    и `/approvals` Refund Money Flow; отдельный `Dispute` нужен только для расширенной машины
    статусов. Приёмка: открыть спор → машина статусов → решение пишет ledger.

## C. Внешние блокеры — ждут ключ/аккаунт/железо (действие пользователя)

Проверка текущего статуса: `GET /health/integrations` возвращает `ready|blocked`, список
missing/configured env-имён и ручные проверки. Значения секретов endpoint не отдаёт.

13. **AI vision-грейдинг Б/У по фото / разведка рыночных цен / оффлайн-eval** — scaffold готов:
    `POST /ai/grade-photos` и `POST /ai/price-scout` закрыты staff RBAC, без ключа отвечают
    детерминированными правилами, а при `AI_PROVIDER_KEY`/`OPENROUTER_API_KEY` (+`AI_MODEL`)
    пробуют OpenRouter и откатываются на правила при сбое. Production activation всё ещё требует
    реальный provider key, reference photo/listing dataset и offline-eval пороги.
14. **Каналы (Phase 12)** — Telegram Mini App / WhatsApp-магазин: campaign delivery code
    готов (`NOTIFICATION_TRANSPORT=channels` + Novu/SMTP/Telegram/WhatsApp env); для production
    нужны аккаунты/токены, webhook/callback QA и WhatsApp storefront activation.
    B2B/опт уже закрыт: customer profile + invoice quote request, staff queue/КП, acceptance
    и Event Ledger доступны через `/b2b` и `/api/b2b/*`.
15. **Соцвход через реальные провайдеры** — backend готов; нужны Apple/Telegram app credentials,
    callback/client SDK QA и production rollout.
16. **Физическое железо (Phase 13)** — ESC/POS/QZ печать, банковские терминалы, реальный сканер:
    нужны устройства и SDK. Софт-слой offline POS + catalog delta-sync + browser-fallback уже готов.

## Гейт приёмки (для КАЖДОГО пункта)
`npm run api:test` зелёный (+ новый тест) · `npm run api:build` + `next build` · живой прогон
(браузер/HTTP) + сверка в БД · атомарный коммит явными путями.

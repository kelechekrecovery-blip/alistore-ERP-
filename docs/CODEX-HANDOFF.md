# Codex Handoff — остаток до конца MVP

> Составлено Claude. Claude-лана (Event Ledger ядро, деньги, витрина, POS, склад,
> approval-цикл, возвраты/обмены, owner ERP + Risk/Command Center, весь keyless AI-слой)
> закрыта и зелёная. Ниже — то, что осталось до полного MVP и относится к **лане Codex**,
> требует **миграции схемы**, либо ждёт **внешнего ключа/аккаунта**. Каждый пункт — с
> критерием приёмки. Коммитить явными путями, не переписывать историю.

## A. Лана Codex — можно делать сейчас (без внешних блокеров)

1. **Infra runbook** — Caddy + бэкапы + запуск self-hosted окружения.
   - Приёмка: документированный запуск и restore-check.

Закрыто Codex-итерациями: transactional outbox + Novu/email/realtime transport switch,
debt reminders через outbox, consent-filtered Campaign Segment Builder + Campaign ROI,
Excel import idempotency, OTP access recovery with refresh-session revocation,
receipt split tenders, order invoice/waybill PDF, realtime/socket.io, Sentry/GlitchTip hook,
i18n, health-checks.

## B. Требуют миграции схемы (Prisma) — координировать аддитивно

10. **Повтор IMEI (скупка + продажа) как риск.** ✅ Схема (`TradeInDevice.imei`, миграция
    `20260707173249_tradein_imei`) и детектор (`reports/risk-signals.ts` → `imei_reuse`,
    сопоставление с проданными `DeviceUnit.imei`) — СДЕЛАНО Claude, работает вживую.
    **Остаток для Codex (owns tradeins):** принимать `imei` в `POST /tradeins/intake` (DTO +
    сервис) и писать в `TradeInDevice.imei`. Поле nullable — до этого детектор просто пуст.
    - Приёмка: staff intake с imei → запись в БД; тот же imei и в скупке, и в продаже →
      high-риск `imei_reuse` в Risk Center (детектор уже готов).
11. **Споры v2 (если нужна отдельная модель).** MVP уже использует refund/return approval flow
    и `/approvals` Refund Money Flow; отдельный `Dispute` нужен только для расширенной машины
    статусов. Приёмка: открыть спор → машина статусов → решение пишет ledger.

## C. Внешние блокеры — ждут ключ/аккаунт/железо (действие пользователя)

13. **AI vision-грейдинг Б/У по фото / разведка рыночных цен / оффлайн-eval** — нужен AI-ключ.
    Плуминг LLM готов (`ai/openrouter-provider.ts`, порт `InsightProvider`); vision/scout —
    расширение того же паттерна. Активация: `AI_PROVIDER_KEY`/`OPENROUTER_API_KEY` (+`AI_MODEL`).
14. **Каналы (Phase 12)** — Telegram Mini App / WhatsApp-магазин: нужны аккаунты/токены ботов.
15. **Соцвход через реальные провайдеры** — нужны Apple/Telegram app credentials и callback URLs.
16. **Физическое железо (Phase 13)** — ESC/POS/QZ печать, банковские терминалы, реальный сканер:
    нужны устройства и SDK. Софт-слой offline POS + browser-fallback уже готов.

## Гейт приёмки (для КАЖДОГО пункта)
`npm run api:test` зелёный (+ новый тест) · `nest build` + `next build` · живой прогон
(браузер/HTTP) + сверка в БД · атомарный коммит явными путями.

# Handoff: AliStore — экосистема интернет-магазина электроники (КР)

## Overview
AliStore — операционная система для розничной торговли электроникой (новое + Б/У) в Кыргызстане: сайт-маркетплейс, клиентское приложение, приложение сотрудника, POS для оффлайн-точек и ERP владельца, всё поверх единого ядра данных (Event Ledger). Этот пакет — переход от прототипа к разработке.

## About the Design Files
Файлы в пакете — **дизайн-референсы, созданные в HTML** (`.dc.html` — самодостаточные прототипы, показывающие внешний вид и поведение). Это **не production-код для копирования**. Задача — **воссоздать эти дизайны в целевой кодовой базе** её средствами и паттернами. **Целевой стек (Вариант B — нативно):** Backend — NestJS + PostgreSQL + Prisma + REST/WebSocket; веб-витрина — Next.js/React; **мобильные приложения нативные** — iOS (Swift + SwiftUI), Android (Kotlin + Jetpack Compose); 4 приложения (Клиент, Сотрудник, Курьер, POS) поверх общего API; AI-слой — LLM/Vision API. Нативка выбрана ради «родного» UX и надёжного доступа к железу (сканер, печать, push, биометрия, офлайн, геотрекинг). Подробности — в `CLAUDE_CODE_PROMPT.md` и `docs/Roadmap запуска.md`.

## Fidelity
**High-fidelity.** Финальные цвета, типографика, отступы и интеракции. Воссоздавать пиксель-в-пиксель средствами кодовой базы. Живые прототипы (Клиент/POS/Сотрудник/ERP 2.0, операционные экраны) содержат рабочую логику состояний — она описывает целевое поведение, но серверные проверки прав/лимитов/событий надо реализовывать на бэкенде (нельзя доверять клиенту).

## Design Tokens
- **Бренд-цвета:** Coral `#FF5B2E`, Deep `#E8410F`, Ink `#201B17` / тёмный фон `#16130F`/`#0E0C0A`, Tint `#FFEFE7`, нейтральный фон `#F7F2EC`.
- **Action-акцент (тёмные экраны):** Lime `#C6FF3D` (основное действие), `#14110E` (текст на lime).
- **Функциональные:** успех `#2E7D46`/`#7FD3A0`/`#C6FF3D`, внимание `#E5B23C`, риск/ошибка `#C6362C`/`#FF8A7A`, инфо `#7FB0EC`.
- **Типографика:** Sora (заголовки, 700–800), Golos Text (интерфейс/текст, 400–700), JetBrains Mono (числа, SKU, статусы, события).
- **Радиусы:** карточки 14–22px, кнопки 9–13px, чипы/бейджи 6–999px.
- **Сетки:** контент max-width 1080–1280px; телефоны 402×858; планшет POS 1180×800.

## Ключевые архитектурные принципы (обязательны в коде)
1. **Event Ledger** — единый append-only источник правды. Каждое значимое действие пишет неизменяемое событие; отчёты/Risk/Command Center читают оттуда → цифры не расходятся.
2. **Исправления — компенсирующими событиями**, не правкой/удалением истории (soft-delete для товаров).
3. **Опасные действия** (refund, скидка/цена сверх порога, списание, изменение остатка, продажа в долг, удаление, доступ к PII) → цикл **start → action → approval → event → final** с обязательным evidence и audit. Правила — в Approval Rules Matrix.
4. **Роли и доступ** — Role Permission Matrix (9 ролей), серверная проверка, 2FA на опасное, PII-маскирование младшим ролям.
5. **IMEI/SN** — учёт поштучно; один IMEI нельзя продать дважды; повтор в trade-in+продаже → риск-флаг.
6. **Деньги** — Payment Ledger: где каждый сом, сверка кассы и курьерских COD, идемпотентность webhook по txnId.
7. **Graceful degradation** — offline POS (очередь+синк+разрешение конфликтов), ручной fallback при отсутствии железа/сети.
8. **Consent** — маркетинг только с согласием; отписка мгновенна и логируется.
9. **Фискализация ГНС — вне системы** (ведёт владелец), не реализовывать.

## Модель данных (см. «AliStore API Data Contracts» — 18 сущностей)
Customer(PII), Product/SKU, DeviceUnit(IMEI), Order+OrderItem, Payment, CashShift, InventoryMovement, Return/Exchange, WarrantyCase, TradeInDevice(PII), CourierRun, Approval, AuditEvent(append-only), Campaign, SupportTicket. Поля, связи, endpoints, события, idempotency и права доступа — в этом экране.

## Order State Machine (ядро)
Статусы: draft → created → awaiting_confirmation → confirmed → reserved → awaiting_payment → paid → picking → packed → (ready_for_pickup | courier_assigned → out_for_delivery → delivered) → completed; альтернативные: cancelled, return_requested, returned, exchanged, refunded. Для каждого: кто переводит, условие, кнопки, уведомления, событие Ledger, видимость по ролям (экран «Order State Machine»).

## Порядок реализации (спринты)
1. **Ядро:** AuditEvent(append-only) + Customer + Product/SKU + DeviceUnit + Order + Reservation + Payment. Закрепить Business Invariants.
2. **State-machine заказа** + Approval + Role permissions (серверная проверка прав/лимитов).
3. **Деньги:** CashShift (открытие/закрытие+сверка) + Courier handover + Refund/Exchange.
4. **Склад:** Inventory Count + движения + Warranty + Supplier RMA.
5. **Клиентский путь:** каталог→карточка→корзина→checkout→оплата→статус→кабинет (устройства/гарантии/возвраты/бонусы).
6. **Рост:** Support Inbox + Notifications Outbox (+ Telegram/WhatsApp, env-ключи на сервере) + Campaign/Segment (consent).
7. **AI-слой** по API: оценка Б/У, динамические цены, ассистент владельца, обогащение карточек.
8. **Инфра:** offline POS-агент, hardware (сканер/принтеры/терминал), Импорт данных при запуске.
9. **QA:** прогнать «AliStore QA Test Scenarios» как приёмочные тесты.

## Экраны (карта — в файлах пакета)
Полный список экранов, их назначение, layout и поведение — в самих `.dc.html` (высокая детализация, рабочая логика внутри `<script data-dc-script>`). Начинать с «AliStore Обзор проекта.dc.html» (навигационный хаб) и «AliStore Process Map 2.0.dc.html» (карта процессов: владелец, старт→результат, статусы, экраны, доказательства).

## Assets
`assets/p-*.png` — плейсхолдеры фото товаров (iPhone, MacBook, AirPods, Watch, Samsung, iPad). Заменить реальными фото/логотипами при интеграции. Шрифты — Google Fonts (Sora, Golos Text, JetBrains Mono).

## Files
Ключевые референс-файлы (все в корне проекта, `.dc.html`):
- **Навигация/архитектура:** Обзор проекта, Process Map 2.0, Карта системы, Экосистема, API Data Contracts, QA Test Scenarios.
- **Флагманы 2.0:** Клиент App 2.0, POS 2.0, Сотрудник App 2.0, ERP 2.0.
- **Процессы:** Order State Machine, Payment Ledger, Cash Shift Opening/Closing, Approval/Role Matrix, Inventory Count, IMEI Lifecycle, Courier Cash Handover, Failed Delivery, Refund Money Flow, Warranty Case Detail, Возврат, Обмен товара, Резервы, Перемещения, Event Ledger, Evidence Vault, Incident Recovery, Risk Center, Command Center.
- **Опасные действия:** Списание/Долг/Изменение цены/Изменение остатка/Удаление товара.
- **CRM/поддержка:** Support Inbox, Notification Preferences, Segment Builder, Campaign ROI, Customer 360, Supplier Scorecard, Franchise Audit.
- **Документы:** HANDOFF Process Completion, HANDOFF Operational Actions, HANDOFF RUN STATE, Business Invariants, Self-Review, README проекта.

Все `.dc.html` открываются в браузере напрямую; логику смотреть в блоке `<script type="text/x-dc" data-dc-script>` внутри файла.

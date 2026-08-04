# GAP-360-CODEX — карта пробелов ветки codex/open-source-integrations

Снимок: 2026-07-17, HEAD `aaabf18`, `/Users/alistore/Desktop/alistore-erp`. Метод: пять
параллельных аудитов по коду (роли / ситуации-сбои / паритет платформ / сквозные слои /
собственные планы) + ручная перепроверка топ-P0. Дельта дана к аудиту worktree
`integration/alistore` (`docs/GAP-360.md` там) — ветки разошлись на 154/85 коммитов.
Не дублирует `docs/GAP-ANALYSIS-2026-07-17.md` (GAP-* в BACKLOG): там — фискализация,
legal, SEO, i18n-стек, observability, backups, push-конфиг и пр.; здесь — дефекты
логики денег/стока, RBAC, паритет и мёртвые поверхности.

## Верификация

Перепроверено вручную по коду этой ветки 2026-07-17: `checkout/page.tsx:177,219`
(randomUUID на каждую попытку), `shifts.service.ts` (handover :229 проверяет роль,
close — нет), `pos.service.ts` (нет requestHash), `approvals.controller.ts` (нет
PermissionGuard), `giftcards.controller.ts:40-45` (throttle есть, auth нет),
`staff-auth.controller.ts` (нет totp-reset), `POSOperationsView.swift:215` (шлёт
`received`), `order-state-machine.ts:20-36` (picking/courier_assigned/out_for_delivery
→ cancelled), ветка cancel в `orders.service.ts:647-704` (снимает только активные
резервы), `reservations.service.ts:128-152` (sweep откатывает заказ + уведомляет),
`payments.service.ts:308-315` (PAYABLE_STATUSES), `import.controller.ts:10-19`
(только JwtAuthGuard), `payment-intents.service.ts:55-74` (повторный create без дедупа),
`staff-screen.tsx:164` (mobile clientSaleId = Date.now()).

---

## Дельта: что из прошлого аудита ЗАКРЫТО в этой ветке

- **Store operations модуль** — есть API (`store-operations/*`: overview, checklists,
  incidents + Ledger + casbin-права) и web-UI (`StoreOperationsView` в /erp). Остаток
  ниже по углам.
- **Customer notifications inbox** — таблица `CustomerNotification`, consent-фильтр,
  7 шаблонов (`order_confirmed/ready`, `warranty_created/closed`, `reservation_expired`,
  `debt_due_soon/overdue`), inbox API `notifications/mine`.
- **LOGIC-001 (ядро)** — sweep откатывает `reserved/awaiting_payment → confirmed` с
  событием и уведомлением клиенту; оплата после истечения резерва → 409
  `order_reservation_expired`. TTL 30 мин по-прежнему не продлевается (остаток:
  `reserved→picking` позже 30 мин даёт 409 — операционный шум).
- **LOGIC-008** — `in_transit` устранён; перемещения атомарны (FOR UPDATE + идемпотентность).
- **iOS Client**: возвраты/бонусы/адреса/настройки/фильтры каталога — есть.
- **Android Client push** — FCM-сервис и регистратор есть.
- **Trade-in нативный** (обе платформы), **Android-курьер офлайн-очередь** — есть.
- **Customer 360**: маскирование телефона для не-admin/owner (PII частично).
- **Rate-limit**: OTP/staff-login/customers upsert/push-tokens покрыты; giftcard balance
  throttled 30/мин. Отзыв согласия — есть. Head-of-line blocking в outbox — закрыт
  (изоляция per-message).
- **Loyalty levels** — derived Base/Silver/Gold/Platinum по ltv (минимум).

## Угол 1. РОЛИ — топ пробелов этой ветки

1. **Debts create/pay без UI на всех клиентах** — API `debts.controller.ts:30-47` жив,
   права у cashier/seller/senior_seller/franchise/admin/owner; оформить рассрочку/принять
   платёж неоткуда (только read в Customer 360). Для розницы КР — блокирующий сценарий.
2. **Печать мертва для 5 ролей** — `documents/*` (5 эндпоинтов), `labels/*` (3),
   `receipts/render`: 0 вызовов; даже хелпер `downloadAuthFile` мёртв (`web/lib/api/http.ts:113`).
3. **Веб-POS `/pos` — только продажа**; обмен вынесен в `/exchange`, возвраты/refund в
   `/approvals` — кассир на веб-терминале не принимает возврат (нативные POS умеют).
4. **Подарочные карты нельзя выпустить** — `POST /giftcards` без UI (только balance-check
   в checkout).
5. **Refunds retry/cancel/status без UI** — застрявший refund не разрулить (admin/owner).
6. **Staff-учётки**: создание — API без UI (owner через curl); **деактивация отсутствует
   даже в API**; роль/пароль не меняются штатно (смена роли через БД выкидывает человека
   мгновенно, без уведомления).
7. **Suppliers RMA/scorecard без UI** — брак поставщику не вернуть.
8. **Franchise — роль-пустышка**: права есть (pos/shift/debts/tradeins/store_operations),
   экранов ноль; даже `reports`/`finance` read нет.
9. **Store operations**: только web (нативных экранов нет при manage-правах у 5 ролей);
   **Z-отчёта нет в принципе**; waitlist отсутствует; эскалаций инцидентов нет (только
   create/resolve); resolve-кнопка не гейтится по роли (`StoreOperationsView.tsx:106` →
   гарантированный 403 у seller/cashier/warehouse/service/franchise); technician без
   доступа вообще.
10. **403-вкладки на трёх staff-клиентах**: iOS/Android Staff («Заказы» warehouse-only,
    «Поддержка» admin/owner-only) и web `/staff` (очередь заказов) — seller/service/
    technician/courier видят мёртвые разделы. Регресс WEB-005 живёт на нативных.
11. **ERP-сайдбар не фильтруется по роли** (`erp/page.tsx:271-307`).
12. **Marketer**: нет update кампании (`:id/update` — в lib нет функции), нет spend UI,
    conversion-функция не импортируется ни одним экраном; marketer без `ai/read` — все
    AI-инструменты (`/ai/price-scout`, `/ai/moderation`, `/ai/grading`) мертвы архитектурно.
13. **Техник без нативного экрана** (service-center только в web-ERP).
14. **Веб-Staff без self-service HR** (`hr/me/*` — нативные имеют, web нет); `hr/me/absences`
    без клиентов вообще; `staff-tasks` create — без UI; shift `handover` — без UI на всех
    платформах.

## Угол 2. СИТУАЦИИ И СБОИ — топ этой ветки

**Новые дефекты (не было в прошлом аудите):**
1. **N1. Отмена оплаченного заказа без компенсаций.** `order-state-machine.ts` разрешает
   `picking/courier_assigned/out_for_delivery → cancelled`; ветка cancel
   (`orders.service.ts:647-704`) снимает только активные резервы — у оплаченного заказа
   юниты остаются `sold`, платежи `received`, return из `cancelled` невозможен
   (`cancelled: []`). Ни refund, ни рестока, ни событий. Молчаливая недостача + «лишняя»
   выручка навсегда.
2. **N2. Отмена с частичной оплатой/бонусами — сироты.** Деньги/баллы висят на
   cancelled-заказе; восстановление лояльности есть только через refund.
3. **N3. Множественные payment-intents на один заказ** (`payment-intents.service.ts:55-74`
   — повторный create без дедупа): клиент платит дважды → второй webhook ловит 409,
   деньги у провайдера, авто-возврата нет.
4. **N4. POS-продажа замирает после сбоя на оплате** (`pos.service.ts:182-243` — три
   отдельные транзакции): retry падает на `reserved→reserved` 422; дожать продажу нельзя.
5. **N5. Mobile POS генерирует clientSaleId на каждую попытку**
   (`apps/mobile/src/screens/staff-screen.tsx:164` — `mobile-${staffId}-${Date.now()}`):
   таймаут → повторный тап = вторая продажа.
6. **N6. Refund-тупик при provider 500 без callback**: доходит до `failed`, и ни retry,
   ни cancel невозможны (cancel требует событие, которое пишет только webhook).
7. **N7. Push «sent» при нуле токенов** (`expo-push.transport.ts:34-36` — успех при
   пустом списке) + **N8. Outbox retry без backoff** (5 попыток за ~5 минут → failed
   навсегда; деградация канала >5 мин = массовая потеря уведомлений).
8. **N9. Смена роли/пароля сотрудника — только SQL** (см. STAFF-001).

**Актуальные из прошлого аудита:**
9. **LOGIC-002 (усугубился). Deadlock рейса**: `failDelivery` не двигает статус; снять
   заказ с рейса невозможно; `handover` требует `collectedTotal === codTotal`
   (`courier.service.ts:277-279`); отмена не пересчитывает `codTotal`; теперь ещё и
   `out_for_delivery → cancelled` разрешён — рейс навсегда не сдаёт COD.
10. **LOGIC-003. Дубль заказа при retry checkout** (`checkout/page.tsx:177,219` —
    randomUUID на каждую попытку; gift-card оседает на заказе-сироте).
11. **LOGIC-004. Webhook по отменённому/swept-заказу — 409 навсегда**; Payment не создан,
    вернуть нечего. Доступность сценария выросла из-за sweep-отката.
12. **LOGIC-005. `shifts.close()` без владельца** — любой с `shift.close` закрывает чужую
    смену с произвольным `closeCash` (handover владельца проверяет — асимметрия).
13. **LOGIC-006. POS replay без requestHash** — чужой `clientSaleId` вернёт чужой чек;
    fingerprint 60 сек схлопывает разные продажи с одинаковой корзиной.
14. **LOGIC-007. Refund `provider_pending` ждёт webhook бессрочно**, блокирует аллокации.
15. **Частичная COD у двери непредставима** (`courier.service.ts:165-168` — точно до сома
    или fail).
16. **LOGIC-009. Деактивация точки без проверок** (смены/заказы/сток не проверяются).
17. **STAFF-001/002** — нет деактивации (+каскадов), нет admin-reset TOTP.
18. **TZ-001** — отчёты/payroll в UTC, логистика уже на Asia/Bishkek — внутренний рассинхрон.
19. **NOTIF-002** — outbox `failed` без re-drive/алертов.
20. **HTTP-001 (остаток)** — все внешние fetch без таймаутов; OTP: боевого канала нет
    (`production-otp.sender.ts` всегда 503, дефолт Noop) — логин клиентов в проде лежит
    до кредов.

**Проверено и НЕ подтвердилось (гонки закрыты):** IMEI double-reserve, количественный
резерв, переплата, gift-card двойное списание, delivery-slot овербукинг, отзыв прав
посреди сессии.

## Угол 3. ПАРИТЕТ ПЛАТФОРМ — топ этой ветки

1. **Возвратный флоу POS нерабочий на обеих платформах**: iOS шлёт `received` → 400
   (`POSOperationsView.swift:215`); Android предлагает `processing → reconciled` → 422
   (`PosOperationsScreens.kt:554` vs `returns.service.ts:685`).
2. **Нативный checkout дороже и беднее web**: нет промокода/бонусов/подарочных карт, нет
   `paymentMode` (**COD курьеру уходит как prepaid**), нет слотов/зон, нет attribution,
   нет гостевого checkout.
3. **Approvals-инбокс и 2FA-setup отсутствуют во всех нативных staff-приложениях** —
   refund/скидки/обмены некому аппрувить с устройств.
4. **Staff без операционных консолей**: service-center (24 эндпоинта web-only),
   `tradeins/intake`, shift handover, margin-KPI.
5. **Клиентские деньги/доверие**: нет отзывов PDP, нет approve-estimate/статуса ремонта,
   нет protection, нет B2B, recovery/соц-вход — кнопки-пустышки (iOS :284-298);
   iOS-таймлайн заказа захардкожен, у Android деталей нет вовсе; гостевой трекинг —
   только web.
6. **Android-курьер не сдаёт COD с расхождением** (reason не шлётся, кнопка заблокирована
   при diff≠0).
7. **Android POS без `qr_odengi`; обе нативные POS без `bakai_pos`/`obank`/`installment`**
   (web POS — 6 тендеров).
8. **CMS-витрина не доходит до нативных Home** — баннеры/категории захардкожены
   (`AliStoreClientApp.swift:5220-5306`, `AliStoreApp.kt:261-315`).
9. **Store-operations, transfers/stocktake, debts — web-only или вообще без клиентов**.
10. **~25 мёртвых эндпоинтов**: documents(5), labels(3), receipts/render, import/products,
    POST /media, catalog/search/reindex, realtime WebSocket, ai/grade-photos, ai/price-scout,
    ai/moderate, i18n/greeting, debts(3), auth/social/apple (обёртка без вызова),
    5 procurement-саброутеров, suppliers POST/scorecard/RMA, POST /staff-tasks,
    hr/me/absences, shifts/:id/handover.

**Фейковый UI (критично для доверия):** iOS Client — карточка лояльности «Gold · 4 820»
захардкожена (:3332-3348), имя из суффикса телефона (:3492-3500), «Наличие в магазинах»
и описание PDP хардкод (:5444-5456), таймлайн заказа (:1831-1837), кнопки «Повторить»/
«Отменить заказ» — тосты без API (:1944-1982); iOS Staff «Добавить товар» — локальный
фейк «AI заполнил», «Отправить на модерацию» = флаг, «Печать этикетки» — пустая кнопка
(`StaffScannerView.swift:118-236`) при живом labels API.

## Угол 4. СКВОЗНЫЕ СЛОИ — топ этой ветки

1. **IMPORT без staff-гварда и без событий (P0).** `import.controller.ts:14` — только
   JwtAuthGuard: **любой customer JWT может массово перезаписать price/cost Excel'ем**,
   и всё это мимо Event Ledger (`import.service.ts:79-112`). Пересечение RBAC + инварианта #10.
2. **Push-token hijack.** `notifications.controller.ts:22` OptionalJwtAuthGuard +
   upsert по токену с перезаписью customerId (`notifications.service.ts:13-33`) — аноним
   перебиндит чужой токен или «отпишет» жертву.
3. **Sandbox-подтверждение оплаты без auth и rate-limit**
   (`sandbox-payments.controller.ts:27-37`) — конфигурационный риск в проде.
4. **Уведомления покрывают ~15% доменных событий**: нет paid / delivered / completed /
   refund (approved/succeeded/failed) / return / exchange / trade-in / shift open-close +
   shortage / approval.requested / service estimate+repair+loaner / ticket / delivery.failed.
   Outbox импортируют только 7 сервисов.
5. **Approvals читаются любой staff-ролью** (`approvals.controller.ts:29,37-41`) — суммы
   и причины заявок видны кассиру; decide уже по матрице (частично закрыто).
6. **Customer 360 любой роли** — маскируется только телефон; заказы/долги/тикеты видны
   курьеру (`customers.controller.ts:165-175`).
7. **Ledger bypass в базовых сущностях**: `units.receive()` (:71-92, AuditService не
   инжектирован), `customers.upsert()` (:171-177), `import` (выше).
8. **PII в outbox-payload**: телефон+суммы долга в detail при LogNotificationTransport
   попадают в логи (`customer-notifications.ts:99-133`).
9. **UX**: confirm — в 1 файле из ~23 с delete-действиями; 401: iOS без retry-on-401
   вообще, Android — 6+ разрозненных обработчиков, web централизован.
10. **Удаление аккаунта/экспорт** — покрыто `GAP-ACCOUNT-DELETE-001` (проверить нативный
    UI); **ретенция Evidence** — `GAP-PII-RETENTION-001`. Здесь не дублируем.
11. **Наблюдаемость/DLQ** — покрыто `GAP-OBSERVE-001`/`GAP-JOBS-OBS-001`.

## Угол 5. ПЛАНЫ ПРОЕКТА — забыто/противоречия этой ветки

**Всё ещё без кода и без трекинга:** обучение сотрудников + допуск к опасным действиям
(handoff Role Permission Matrix); **Z-отчёт** (декларирован в Cash Shift Closing /
CODEX-NOW C-6 — нет в коде и в remaining матрицы); **waitlist «сообщить о поступлении»**
(таб Операционка точки, авто-push при приходе PO); **учёт брака** (таб defect:
фото → списание/возврат/уценка → approval); рефералка; Q&A; маркетплейс продавцов;
взаиморасчёты филиалов; cashflow-прогноз (есть только statement); AI риск-скоринг +
авто-отчёты владельцу; живой чат/Chatwoot (вытеснен самопальным Support Inbox — досье
не обновлено); WhatsApp-логин; супер-админ настройки; BI; рассрочка-скоринг.

**Противоречия (решения владельца):** фискализация (канон 6 мест запрещает vs GO-LIVE G3/
MASTER-EXECUTION-PLAN требуют; см. также `GAP-FISCAL-001`); click&collect (PHASES ✅ vs
READINESS 🟡 — READINESS устарел); «софт ~85%» и «4-агентный аудит идёт» в GO-LIVE —
устарело; дрейф счётчиков (README 27 сущностей vs факт ~100 моделей/112 миграций/149
spec/38 routes; READINESS против самой себя); CASL vs casbin (досье не приведено к факту);
K8s «deferred» vs «шаг 5» и BACKLOG; B2B/подарочные/TG/protection реализованы вне
acceptance-матрицы; трезабилити store operations неполна (нет defect/wait/Z-отчёта в
remaining); realtime CORS `origin: '*'` против G0.

## P0 этой ветки (что чинить первым)

1. **Import guard + ledger**: ActiveStaffGuard + permission `products, create` на
   `import/products`; события `product.created/updated`, `price.changed` в транзакции.
2. **N1 компенсации отмены**: запрет `picking/courier_assigned/out_for_delivery → cancelled`
   для оплаченных заказов (только через return/refund-контур) ИЛИ отмена с авто-рестоком +
   авто-refund; cancelled с деньгами недопустим молча.
3. **LOGIC-002 deadlock рейса**: снятие/перевоз заказа с пересчётом codTotal; частичная
   сдача с причиной; пересчёт при отмене.
4. **LOGIC-003 стабильный checkout-ключ** (готовый порт из worktree:
   `lib/checkout-idempotency.ts` + правка page.tsx).
5. **LOGIC-004+N3**: дедуп payment-intents на заказ; parked payment + авто-рефанд для
   опоздавших webhook.
6. **MOB-013 возврат POS**: порт `POSReturnFlow.swift` (iOS) + фикс Android-цепочки
   (processing→reconciled запрещён — вести через paid/location).
7. **LOGIC-005 owner/manager в shifts.close** (готовый порт из worktree).
8. **LOGIC-006 POS requestHash** (готовый порт из worktree).
9. **SEC-007/008**: `approvals, read` + `customers, read` по матрице (готовый порт);
   расширить маскирование.
10. **STAFF-002 TOTP admin-reset** (готовый порт) + **STAFF-001 деактивация** (API + UI,
    каскады: смена→handover, заказы→переназначение).
11. **NOTIF-001 минимум**: уведомления paid, refund succeeded/failed, approval.requested,
    delivered — по образцу существующих 7 шаблонов.
12. **Push-token ownership**: токен привязывать только к аутентифицированному владельцу,
    анонимный scope запретить; sandbox-confirm за feature-flag.

## Переносимые готовые фиксы из worktree (волна-1, там уже GREEN)

- `lib/checkout-idempotency.ts` + `checkout/page.tsx` (LOGIC-003) — 12 vitest-кейсов.
- `shifts.service.ts` owner-check + `shifts.controller.ts` (LOGIC-005) — 4 e2e.
- `pos.service.ts` requestHash + `margin-control.ts` (LOGIC-006) — 5 e2e.
- ACCESS-BATCH: `authz.model.ts` (+approvals/customers read), approvals.controller
  PermissionGuard, customers.controller permission+маскирование name, giftcards controller
  guest-capability, staff-auth totp-reset + event-type — 5 e2e (79 смежных тестов зелёных).
- `POSReturnFlow.swift` + `POSOperationsView.swift` (MOB-013) — 4 теста, ios:build green.
  NB: порты требуют сверки с кодом этой ветки (файлы разошлись), и giftcard-правку
  адаптировать: здесь уже есть throttle, а web guest-checkout превью баланса требует
  `x-guest-capability`.

## Что НЕ трогать (закрыто в этой ветке — проверено)

Гонки IMEI/резервов/переплаты/gift-card/слотов; sweep-откат заказа + уведомление
`reservation_expired`; атомарные перемещения; отзыв сессий per-request; маскирование
телефона в Customer 360; отзыв согласия; rate-limit на OTP/логине; outbox per-message
изоляция; loyalty levels (derived); store-operations API+web-вертикаль; customer inbox.

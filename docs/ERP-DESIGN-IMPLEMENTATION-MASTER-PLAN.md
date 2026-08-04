# AliStore ERP — генеральный план внедрения дизайн-референсов

**Цель:** довести desktop ERP (`apps/web/app/erp`, `apps/web/components/erp`) до 1:1 визуального и структурного соответствия с `design_handoff_alistore/screens/*.dc.html`.

**Источник правды:**
- `design_handoff_alistore/screens/AliStore ERP 2.0.dc.html` — master-оболочка и 7 core-модулей
- `AliStore Складской учёт.dc.html`, `AliStore Финансы 2.0.dc.html`, `AliStore Аналитика.dc.html`
- `AliStore HR.dc.html`, `AliStore Логистика управление.dc.html`, `AliStore Операционка точки.dc.html`, `AliStore Сервис-центр.dc.html`
- `AliStore Маркетинг CMS.dc.html`, `AliStore Управление товарами.dc.html`, `AliStore Закупки.dc.html`
- `AliStore Order State Machine.dc.html`, `AliStore Безопасность.dc.html`, `AliStore Process Map 2.0.dc.html`

**Текущее состояние (к концу Phase 4):**
- ✅ ERP Shell — структура, топбар, AI-кнопка, фиксированный контейнер
- ✅ 7 core-модулей переписаны: Dashboard, Stock, Finance, KPI, CRM, AI, Tasks
- ✅ Связанные процессы: Service Center (fallback), HR (fallback), Logistics (fallback), Store Operations (fallback + tabs)
- ❌ Специализированные модули: Product Management, Marketing CMS, Procurement, Risks/Security, Order State Machine, Process Map
- ❌ Глобальные дизайн-токены, радиусы, типографика, selection-цвет

**Критерий приёмки для каждой фазы:**
1. `npx tsc -p apps/web/tsconfig.json --noEmit` — clean
2. `npm run build -w @alistore/web` — clean
3. Скриншоты каждого изменённого модуля сохранены в `docs/erp-<module>-after.png`
4. `git diff --check` — clean
5. `PROGRESS.md` и `BACKLOG.md` обновлены

---

## Phase 0: Foundation (1–2 дня)

**Goal:** устранить глобальные расхождения, которые затрагивают все модули, и зафиксировать дизайн-систему.

### Tasks
- [ ] **Tokens & globals**
  - Исправить `::selection` в `globals.css` на `#C6FF3E` / `#14110E`.
  - Вынести частые HEX (`#0E0C0A`, `#16130F`, `#1A1611`, `#2E2822`, `#FF5B2E`, `#C6FF3D`, `#E5B23C`) в Tailwind-расширения или CSS-переменные, если ещё не сделано.
  - Зафиксировать радиус внешних карточек: `16px` (или `rounded-[16px]` / `rounded-2xl` токен).
  - Зафиксировать радиус кнопок: `10px`–`11px`.
  - Зафиксировать стиль pill-табов: `border-radius: 999px`, акцент `#FF5B2E`.
- [ ] **Typography scale**
  - Проверить, что `Sora` 800/700, `Golos Text` 400/500/600/700, `JetBrains Mono` 400/500 используются по назначению.
  - Убрать JetBrains Mono для обычных действий/меток в Dashboard.
- [ ] **ERP Shell final polish**
  - Привести структуру бокового меню к 7 core-пунктам дизайна (Дашборд, Склад, Финансы, Задачи, KPI и ЗП, CRM, AI-ассистент).
  - Расширенные модули вынести в отдельный collapsible раздел.
  - Блок «Сеть» показывать `3 филиала · онлайн` (или реальные точки из API).
  - AI-кнопка: градиент `linear-gradient(135deg,#FF5B2E,#E8410F)`.
  - Topbar: убрать `backdrop-blur`, фон `#16130F`.
  - Убрать лишний Logout из topbar (оставить в меню), аватар всегда виден.
  - Скрыть mobile trigger на десктопе.

### Acceptance gate
- [ ] Скриншот `docs/erp-shell-final.png` совпадает с `AliStore ERP 2.0.dc.html` по структуре, цветам, отступам.
- [ ] `tsc`/`build` clean.

---

## Phase 1: Core modules redesign (5–7 дней)

**Goal:** переделать 7 core-модулей до полного соответствия дизайну.

### 1.1 Dashboard
**Эталон:** `AliStore ERP 2.0.dc.html` (Dashboard)

- [ ] KPI: 4 карточки — Выручка сегодня, Чеков, Наличные в кассе, Долги/рассрочка.
- [ ] Цвета KPI: первые три белые, четвёртый `#E5B23C`.
- [ ] График: заголовок «Выручка · 7 дней», без суммы в заголовке; убрать переключатель 7/30/кастом.
- [ ] Столбцы: `border-radius: 6px`, gap `10px`.
- [ ] Блок «Требуют решения»: копия действий как в дизайне.
- [ ] Empty state убрать или заменить на 3 демо-пункта.

### 1.2 Stock
**Эталон:** `AliStore ERP 2.0.dc.html` + `AliStore Складской учёт.dc.html`

- [ ] Добавить pill-табы: Серийный/штучный, Комиссионный, Комплектность, Пересортица, Уценка.
- [ ] Убрать/встроить лишние блоки карантина/valuation в соответствующие табы.
- [ ] Добавить ссылку «Инвентаризация →» в шапку.
- [ ] Таблица: горизонтальный padding `18px`.
- [ ] Статус-чипы: `border-radius: 6px`, не pill.
- [ ] Кнопка печати QR: 44×44 px.

### 1.3 Finance
**Эталон:** `AliStore ERP 2.0.dc.html` + `AliStore Финансы 2.0.dc.html`

- [ ] Добавить pill-табы: Касса, ЗП, Поставщики, Расходы, Денежный поток, Валюта/филиалы.
- [ ] Реализовать/заглушить 6 разделов с fallback-данными.
- [ ] Убрать лишние Settlement/Controls в начале; заменить на 4 KPI + P&L.
- [ ] P&L: строки Выручка, Себестоимость, Валовая, Операционные, Чистая.
- [ ] Добавить 14-дневный cashflow-график.
- [ ] Фон внутренних карточек: `#1A1611`.

### 1.4 CRM
**Эталон:** `AliStore ERP 2.0.dc.html` (CRM)

- [ ] Переделать layout на 4 карточки сегментов + AI-рекомендация + CTA.
- [ ] Сегменты: всего, VIP, уснувшие, ДР.
- [ ] AI-рекомендация: градиент `linear-gradient(135deg,#2A2A2E,#1A1611)`.
- [ ] CTA «Открыть кампании →».

### 1.5 AI Assistant
**Эталон:** `AliStore ERP 2.0.dc.html` (AI ASSISTANT)

- [ ] Переделать на чат AI/пользователь.
- [ ] Промпт-кнопки: 3 pill-кнопки под вводом.
- [ ] Сообщения AI: фон `#221E19`, цвет `#E5DCD3`, радиус `14px 14px 14px 4px`.
- [ ] Сообщения пользователя: радиус `14px 14px 4px 14px`.
- [ ] Убрать заголовок «AI-ассистент владельца».

### 1.6 KPI / Analytics
**Эталон:** `AliStore ERP 2.0.dc.html` (KPI/STAFF) + `AliStore Аналитика.dc.html`

- [ ] Таблица KPI: Сотрудник | Продажи | KPI | Бонус | Штраф.
- [ ] Формат продаж сокращённо (`620к`).
- [ ] KPI-бейджи с цветным фоном.
- [ ] Лидерборд: топ-1 с `#C6FF3D` border/background.
- [ ] Добавить табы Аналитики: ABC-анализ, Когорты, Лидерборд.
- [ ] Блоки ABC, когорты, лидерборд.

### 1.7 Tasks
**Статус:** уже переписан. Осталось только визуальное выравнивание по фазе 0.

### Acceptance gate
- [ ] Скриншоты каждого core-модуля (`docs/erp-<module>-final.png`) сравнены с `.dc.html`.
- [ ] `tsc`/`build` clean.
- [ ] Нет регрессов в `e2e/erp-secure.spec.ts`.

---

## Phase 2: Operational modules redesign (4–5 дней)

**Goal:** довести связанные процессы до 1:1. Большинство уже имеют fallback-данные; нужно доработать layout и детали.

### 2.1 HR
**Эталон:** `AliStore HR.dc.html`

- [ ] Табы: pills, 4 пункта: График, Табель, Профиль, Передача смены.
  - Убрать вкладку «Начисления» (ЗП переходит в Финансы).
- [ ] Профиль: аватар 72px с градиентом, разделы Данные/История, кнопки роли/ставки/блокировки.
- [ ] Передача смены: две панели Сдаёт/Принимает с суммами.
- [ ] График смен: сетка `110px repeat(7,1fr)`, gap `6px`, цвета ячеек `rgba(198,255,61,0.12)`.
- [ ] Убрать числа из шапки дней (оставить Пн–Вс).
- [ ] Табель: вся строка JetBrains Mono.

### 2.2 Service Center
**Эталон:** `AliStore Сервис-центр.dc.html`

- [ ] Табы: pills, 4 пункта: Очередь и SLA, Подменный фонд, Прайс ремонтов, Платный ремонт.
- [ ] Шапка: логотип A + «Сервис-центр» + ссылка «Гарантийные кейсы →».
- [ ] Очередь: колонки Заявка/Устройство/Этап/SLA/Мастер.
- [ ] SLA: цветной бейдж вместо даты+текста.
- [ ] Прайс: 5 строк (замена экрана iPhone, Samsung, АКБ, чистка воды, диагностика).
- [ ] Подменный фонд: 4 простые карточки с emoji.
- [ ] Платный ремонт: одна карточка Xiaomi 13 + кнопка.
- [ ] Радиусы карточек `16px`.

### 2.3 Logistics
**Эталон:** `AliStore Логистика управление.dc.html`

- [ ] Табы уже pills; доработать маршруты.
- [ ] Маршруты: одна карточка с таймлайном и статусом «AI-оптимизирован».
- [ ] Добавить мета-информацию: 5 точек, 18 км, ~2 ч, −30% времени.
- [ ] Цветные маркеры зон (разные цвета).
- [ ] Бар загрузки слотов: lime/warn/red по степени.
- [ ] Точки выдачи: колонки Точка/Тип/Заказов ждёт/Статус.
- [ ] Радиусы карточек `16px`.

### 2.4 Store Operations
**Эталон:** `AliStore Операционка точки.dc.html`

- [ ] Табы уже добавлены; доработать открытие/закрытие.
- [ ] Оставить один чек-лист открытия по дизайну (закрытие — в отдельной вкладке или скрыть, если не в дизайне).
- [ ] Радиусы карточек `16px`.
- [ ] Чекбокс: 22×22, rounded-7px.
- [ ] Кнопка завершения: `#C6FF3D` без `opacity-40`.
- [ ] Решить, оставлять ли инциденты (не в дизайне) — либо убрать, либо вынести в отдельный модуль/таб.

### Acceptance gate
- [ ] Скриншоты всех табов каждого модуля.
- [ ] `tsc`/`build` clean.

---

## Phase 3: Specialized modules (6–8 дней)

**Goal:** реализовать или переделать модули, отсутствующие в core/operational scope.

### 3.1 Product Management (Admin → Products)
**Эталон:** `AliStore Управление товарами.dc.html`

- [ ] `AdminView` → шапка + pill-табы.
- [ ] `ProductManagementView` → pill-табы: Каталог, Матрица SKU, Комплекты, Подарочные карты, Предзаказ, История цен.
- [ ] Матрица SKU: цвет × память с остатками/ценами.
- [ ] Комплекты: карточки с позициями и скидкой.
- [ ] Подарочные карты: визуальная карта с кнопками.
- [ ] Предзаказ: карточка с изображением/статистикой.
- [ ] История цены: график + лог.

### 3.2 Marketing CMS
**Эталон:** `AliStore Маркетинг CMS.dc.html`

- [ ] Привести к 3 табам: Витрина, Промокоды, Отзывы.
- [ ] Промокоды: таблица 5 колонок вместо карточек.
- [ ] Баннеры: drag-ручка `⠿` + toggle.
- [ ] Отзывы: кнопки «Одобрить» (лайм) / «Отклонить» (красный) вместо иконок.
- [ ] Радиусы статусов: pill.

### 3.3 Procurement / Reorders
**Эталон:** `AliStore Закупки.dc.html`

- [ ] AI-прогноз шапка: градиентная шапка + 4 recommendation-карточки.
- [ ] PO-список: 5 колонок `PO | Поставщик | Позиции | Сумма | Статус`.
- [ ] Деталь PO: progress-bar шаги + строки заказ/принято.
- [ ] Кнопка «Создать PO из прогноза» в AI-блоке.

### 3.4 Risks / Security
**Эталон:** `AliStore Безопасность.dc.html`

- [ ] Переименовать/переделать `RiskCenterView` в Security View.
- [ ] Pill-табы: Доступ, 2FA, Сессии, Лог входов.
- [ ] Таблица доступа: сотрудники/роли/2FA/активность.
- [ ] 2FA-настройка: QR + 6 цифр + кнопка.
- [ ] Сессии и лог входов: списки.

### 3.5 Order State Machine / Approvals
**Эталон:** `AliStore Order State Machine.dc.html`

- [ ] Переключить страницу `/approvals` на тёмную тему (`#0E0C0A`).
- [ ] Визуальная лента статусов (горизонтальная, со стрелками).
- [ ] Боковой список статусов (260px).
- [ ] Детальная панель статуса: «Кто переводит», «Условие», «Кнопки», «Уведомления», «Event Ledger», «Роли».
- [ ] Шрифт статусов: JetBrains Mono.

### 3.6 Process Map / Readiness
**Эталон:** `AliStore Process Map 2.0.dc.html`

- [ ] Переделать `ReadinessView` на Process Map.
- [ ] Карточки процессов: владелец, старт→результат, статусы, экраны, доказательства.

### 3.7 Campaigns
- [ ] Решить: убрать, вынести в Маркетинг CMS или согласовать отдельный дизайн.

### Acceptance gate
- [ ] Скриншот каждого нового/изменённого модуля.
- [ ] `tsc`/`build` clean.
- [ ] E2E по затронутым модулям проходят (или задокументированы blockers).

---

## Phase 4: Hardening, global E2E and visual gate (3–4 дня)

**Goal:** устранить оставшиеся мелкие расхождения, обновить goldens и прогнать всю ERP-часть.

### Tasks
- [ ] Пиксельное выравнивание: отступы, размеры шрифтов, радиусы, иконки.
- [ ] Заменить оставшийся хардкод-HEX на токены.
- [ ] Убрать или согласовать лишние элементы: mobile trigger на десктопе, date picker в Dashboard, доп. секции.
- [ ] Унифицировать пустые/загрузочные/ошибочные состояния.
- [ ] Обновить `docs/ERP-DESIGN-GAP-AUDIT.md`: отметить resolved/closed пункты.
- [ ] Перегенерировать все скриншоты `scripts/screenshot-erp-modules.mjs`.
- [ ] Сравнить каждый скриншот с `.dc.html` и зафиксировать остаточные delta в `docs/ERP-VISUAL-DELTA-REPORT.md`.
- [ ] Запустить `e2e/erp-secure.spec.ts` и `e2e/erp-logistics-storefront.spec.ts` (требует PostgreSQL).

### Acceptance gate
- [ ] Все 23 `.dc.html` имеют соответствующий скриншот или explicit waiver.
- [ ] `tsc`, `build`, `git diff --check` clean.
- [ ] `PROGRESS.md` и `BACKLOG.md` обновлены.
- [ ] Нет critical/high дефектов, блокирующих визуальное соответствие.

---

## Execution order summary

| Phase | Duration | Модули | Зависимости |
|---|---|---|---|
| 0 | 1–2 дня | Tokens, shell, globals | — |
| 1 | 5–7 дней | Dashboard, Stock, Finance, CRM, AI, KPI | Phase 0 |
| 2 | 4–5 дней | HR, Service, Logistics, Operations | Phase 1 (shell) |
| 3 | 6–8 дней | Products, CMS, Procurement, Security, Approvals, Process Map | Phase 1–2 |
| 4 | 3–4 дня | Polish, goldens, E2E, docs | Phase 3 |

**Итого:** ~19–26 дней чистого engineering time для одного senior-разработчика, не считая API/data work и QA.

---

## Cross-cutting concerns

### API / Data
- Некоторые модули требуют новых полей/API:
  - KPI: бонусы, штрафы, форматированные продажи.
  - CRM: сегменты, CTA.
  - AI: endpoint чата/промптов.
  - Product Management: матрица SKU, комплекты, подарочные карты, предзаказ, история цен.
  - Finance: cashflow, ЗП, поставщики, валюта/филиалы.
  - Security: 2FA, сессии, лог входов.
- Каждый новый endpoint должен иметь RBAC, idempotency и Ledger event (если касается денег/стока/статуса).

### RBAC
- Убедиться, что owner/admin/manager/courier/staff роли видят только разрешённые модули.
- Скрыть/дизейблить действия, недоступные роли.

### Tests
- Каждый модуль: минимум 1 Playwright screenshot-assertion.
- Новые API: unit/integration tests.
- Regression: `e2e/erp-secure.spec.ts`, `e2e/erp-logistics-storefront.spec.ts`.

### Docs
- После каждой фазы: `PROGRESS.md` + `BACKLOG.md`.
- `docs/ERP-DESIGN-GAP-AUDIT.md` обновлять как living document.
- Новые модули: brief ADR если архитектурное решение.

---

## Blockers & risks

| Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|
| 64 missing `.dc.html` references | Н/Д | Блокирует strict ecosystem audit | Использовать существующие 23 экрана; остальные — owner action (retire/replace) |
| PostgreSQL/API недоступен локально | Высокая | Невозможно прогнать E2E | Поднимать API в Docker (`infra/docker-compose.yml`) или запускать на CI/staging |
| API data contracts отсутствуют для новых модулей | Средняя | Задержка фаз 1.3–1.6, 3 | Параллельно писать API схемы и frontend fallback |
| Scope creep: «Кампании» не в дизайне | Средняя | Расширение фазы 3 | Explicit decision: remove, merge into CMS, or separate design |
| Типографика/радиусы различаются между файлами | Низкая | Визуальные delta | Phase 0: зафиксировать токены и компоненты Card/Tab/Button |

---

## Definition of done for the whole plan

- Каждый из 23 `.dc.html` экранов ERP/CMS/операций имеет соответствующий работающий модуль в `apps/web`.
- Скриншоты всех модулей сохранены в `docs/` и визуально совпадают с дизайном (допустимы minor pixel-level delta задокументированы в `docs/ERP-VISUAL-DELTA-REPORT.md`).
- `tsc`, `build`, `git diff --check` clean.
- `PROGRESS.md` и `BACKLOG.md` актуальны.
- E2E проходят или задокументированы blockers.
- Нет placeholder-функциональности, представленной как рабочая.

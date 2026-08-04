# AliStore — индекс проекта

Экосистема для торговли электроникой в Кыргызстане: маркетплейс + 3 приложения + ERP.
Новое и Б/У с гарантией, AI-оценкой и полным учётом. Всё связано в кликабельном хабе.

> **Начать отсюда:** `AliStore Обзор проекта.dc.html` — навигационный хаб со ссылками на все экраны.

---

## 1. Архитектура и бренд
| Файл | Что это |
|---|---|
| `AliStore Экосистема.dc.html` | Мастер-документ: дизайн-система, все модули, AI, стратегия рынка КР, тех-стек, open-source, бизнес-аудит |
| `AliStore Карта системы.dc.html` | Визуальная карта: сущности → процессы → деньги/склад/аудит |
| `AliStore Обзор проекта.dc.html` | Навигационный хаб (точка входа) |
| `AliStore Презентация.dc.html` | Питч-дека (8 слайдов): проблема, решение, рынок, готовность |

## 2. Продукты (клиентские)
| Файл | Что это |
|---|---|
| `AliStore Сайт.dc.html` | Сайт-маркетплейс: витрина, карточка товара, оформление |
| `AliStore Клиент Прототип.dc.html` | Живой прототип клиентского приложения (полный путь заказа) |
| `AliStore Клиент App.dc.html` | Клиентское приложение (экраны) |
| `AliStore Сотрудник App.dc.html` | Приложение сотрудника (заказы, задачи, KPI, склад) |
| `AliStore POS.dc.html` | Касса оффлайн-магазина |
| `AliStore ERP.dc.html` | ERP-панель: дашборд + модули |
| `AliStore Супер-админ.dc.html` | Кокпит владельца (настройки, доступы, контент) |
| `AliStore Скупка и договор.dc.html` | Скупка Б/У с юридическим договором |
| `AliStore Вход.dc.html` · `AliStore Онбординг и состояния.dc.html` · `AliStore Локализация и тема.dc.html` | Вход/регистрация, онбординг/состояния, языки/тёмная тема |
| `AliStore Telegram-бот.dc.html` | Telegram-бот и Mini App |

## 3. Операционные процессы (рабочая логика + аудит + самопроверка)
| Файл | Процесс |
|---|---|
| `AliStore Command Center.dc.html` | Кокпит владельца: деньги, риски, решения |
| `AliStore Event Ledger.dc.html` | Единая книга событий — источник правды |
| `AliStore Order Timeline.dc.html` | Единая правда по заказу |
| `AliStore Approval Inbox.dc.html` | Очередь одобрений опасных действий |
| `AliStore Возврат.dc.html` · `AliStore Клиент Возврат статус.dc.html` | Возврат/refund + статус для клиента |
| `AliStore Обмен товара.dc.html` | Обмен: возврат+продажа+доплата+новая гарантия |
| `AliStore Резервы.dc.html` · `AliStore Перемещения.dc.html` | Резервы склада, межфилиальные перемещения |
| `AliStore Сверка кассы.dc.html` · `AliStore Платёжная сверка.dc.html` | Сверка наличных, сверка с банком |
| `AliStore IMEI реестр.dc.html` | Учёт устройств по IMEI/SN |
| `AliStore Курьер Workflow.dc.html` · `AliStore Курьер App.dc.html` | Lifecycle курьера и доставки |
| `AliStore Обращения и гарантия.dc.html` | Обращения и гарантийные случаи |
| `AliStore Risk Center.dc.html` | Центр рисков и тревог владельца |
| `AliStore Уведомления Outbox.dc.html` | Гарантированная доставка уведомлений |
| `AliStore Долги и рассрочка.dc.html` | Долги и рассрочка |
| `AliStore Margin Control.dc.html` | Контроль маржи и скидок |
| `AliStore Supplier RMA.dc.html` | Возврат поставщику |
| `AliStore Dispute Center.dc.html` | Центр спорных ситуаций |
| `AliStore Customer 360.dc.html` | Единая карточка клиента |
| `AliStore Evidence Vault.dc.html` | Хранилище доказательств (фото/документы) |
| `AliStore Incident Recovery.dc.html` | Сбои и ручная компенсация | 
| `AliStore Обмен товара.dc.html` · `AliStore Клиент App 2.0.dc.html` · `AliStore POS 2.0.dc.html` · `AliStore Сотрудник App 2.0.dc.html` · `AliStore ERP 2.0.dc.html` · `AliStore CRM Кампании.dc.html` · `AliStore Курс урок.dc.html` | Живые прототипы 2.0 + курс |
| `AliStore Offline POS.dc.html` | Продажа без сети, синхронизация |
| `AliStore Data Migration.dc.html` | Импорт из Excel/тетради при запуске |
| `AliStore Аналитика воронки.dc.html` · `AliStore Обучение сотрудников.dc.html` · `AliStore Франшиза.dc.html` · `AliStore Партнёр профиль.dc.html` | Аналитика, обучение, франшиза |
| `AliStore AI Dev Agent.dc.html` | AI-агент: ошибки бота → фикс → PR |

## 4. Документы для разработки (handoff)
| Файл | Содержание |
|---|---|
| `HANDOFF RUN STATE.md` | Итоговое состояние + порядок реализации в коде |
| `HANDOFF Возврат.md` | ТЗ по возврату (P0-01) |
| `HANDOFF Процессы.md` | ТЗ по процессам P0-02..08 |
| `HANDOFF Telegram Production.md` | ТЗ Telegram + прод (P0-09,10) |
| `HANDOFF Hardware.md` | Сканер, принтеры, терминал |
| `AliStore Business Invariants.md` | 10 нерушимых правил системы |
| `AliStore Self-Review.md` | Ревью 6 ролями + фиксы |

---

## 5. Расширенные модули (v2 — глубокая операционка)
| Файл | Что это |
|---|---|
| `AliStore Финансы 2.0.dc.html` | Касса/инкассация, кассовые ордера, выплата ЗП, оплата поставщикам, расходы, cashflow-прогноз, курсы валют, взаиморасчёты филиалов |
| `AliStore Закупки.dc.html` | PO цикл (заявка→отправка→приёмка), AI-прогноз спроса |
| `AliStore Управление товарами.dc.html` | Варианты-матрица, комплекты, подарочные карты, предзаказ, история цены |
| `AliStore Складской учёт.dc.html` | Серийный/штучный, комиссионный, комплектность, пересортица, уценка |
| `AliStore HR.dc.html` | График смен, табель, профиль сотрудника, передача смены |
| `AliStore Безопасность.dc.html` | Блокировка сотрудника, 2FA, сессии, лог входов |
| `AliStore Сервис-центр.dc.html` | Очередь+SLA-эскалация, подменный фонд, прайс, платный ремонт |
| `AliStore Логистика управление.dc.html` | Зоны и слоты доставки, ПВЗ, оптимизация маршрутов |
| `AliStore Операционка точки.dc.html` | Открытие/закрытие магазина, учёт брака, резерв клиента, лист ожидания |
| `AliStore Маркетинг CMS.dc.html` | Баннеры витрины, промокоды, модерация отзывов |
| `AliStore Аналитика.dc.html` | ABC-анализ, когорты удержания, лидерборд продавцов |
| `AliStore Клиент сервисы.dc.html` | Сравнение товаров, рефералка, мои устройства, адреса, Q&A |
| `AliStore Юридическое.dc.html` | Согласие на перс.данные (закон КР), договор рассрочки, проверка личности/возраста |
| `AliStore Order State Machine.dc.html` · `AliStore Payment Ledger.dc.html` · `AliStore Cash Shift Opening/Closing.dc.html` · `AliStore Approval Rules Matrix.dc.html` · `AliStore Role Permission Matrix.dc.html` · `AliStore Inventory Count.dc.html` · `AliStore IMEI Lifecycle.dc.html` · `AliStore Courier Cash Handover.dc.html` · `AliStore Failed Delivery.dc.html` · `AliStore Refund Money Flow.dc.html` · `AliStore Warranty Case Detail.dc.html` | P0 ядро процессов |
| `AliStore Support Inbox.dc.html` · `AliStore Notification Preferences.dc.html` · `AliStore Marketing Segment Builder.dc.html` · `AliStore Campaign ROI.dc.html` · `AliStore Supplier Scorecard.dc.html` · `AliStore Franchise Audit Checklist.dc.html` | P1 CRM/поддержка/поставщики |
| `AliStore API Data Contracts.dc.html` · `AliStore QA Test Scenarios.dc.html` · `AliStore Process Map 2.0.dc.html` | P2 для разработки |
| `AliStore Продажа в долг / Списание товара / Изменение цены / Изменение остатка / Удаление товара.dc.html` | Опасные действия (approval-циклы) |

---

## Ключевые принципы
- **Event Ledger** — единый источник правды (append-only); исправления — компенсирующими событиями.
- **Опасные действия** — с подтверждением старшего/владельца + причина, всё в аудите.
- **Роли и доступы** назначает владелец; полный лог по каждому пользователю.
- **Graceful degradation** — сеть и оборудование могут отсутствовать, процесс не блокируется.
- **Open-source first** — нужную функцию сначала ищем среди зрелых проектов GitHub.
- Фискализация ГНС — вне системы (ведёт владелец).

## Граница ответственности
Это **дизайн-прототипы + ТЗ**, не задеплоенный бэкенд. Prisma-модели, транзакции, серверные проверки прав, webhook и тесты реализуются в кодовой базе по handoff-докам. Реальные фото товаров — по материалам владельца.

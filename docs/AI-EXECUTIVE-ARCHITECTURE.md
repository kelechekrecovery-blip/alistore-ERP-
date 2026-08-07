# AI EXECUTIVE ARCHITECTURE

## Слой приложений

1. iOS Client  
   - аутентификация, каталог, корзина, заказы, профиль, уведомления
2. iOS Staff  
   - тикеты поддержки, инвентарь, прием заказов
3. iOS Courier  
   - задания доставки, статусы маршрутов, подтверждение вручения
4. iOS POS  
   - кассирские и складские операции, сверка оплат
5. Web Owner Cockpit  
   - аналитика, управление пользователями, события AI, policy
6. API Service (HTTP + Workers API)  
   - бизнес-логика, RBAC, session, payment, inventory, order
7. Worker Service  
   - фоновые задания, webhook processing, репликация, revocation, backups
8. AI Control Plane  
   - event consumption, policy evaluation, recommendation/action pipeline
9. Camera Gateway (out-of-band microservice)  
   - ingestion RTSP/ONVIF, детекция очередей/инцидентов

## Доменные модули

- Auth domain  
  Регистрация, логин, logout, social-first, social binding, токены, revocation.
- Identity/Customer domain  
  Профили клиентов, consent, PII masks, deletion и retention.
- Commerce domain  
  Catalog, Cart, Orders, Promotions, Pricing.
- Inventory domain  
  SKU, stock, transfers, warehouse event stream.
- Delivery domain  
  Route, courier assignment, ETA, delay handling.
- Support domain  
  Tickets, комментарии, SLA, escalation.
- AI domain  
  Event classifier, policy, recommendation engine, action planner.
- Integration domain  
  Telegram, Apple Sign in, Google, SMS/OTP, email provider.
- Security domain  
  RBAC, audit logs, policy engine, encryption keys, secret lifecycle.

## AI Control Plane

AI Control Plane работает как отдельный слой над событием:
- подписчик событий (`Event Ledger`) забирает нормализованные события;
- policy engine определяет, что можно рекомендовать и что запрещено;
- executor отправляет только события с требованиями на approval;
- approval center обеспечивает human-in-the-loop для critical actions;
- action runner применяет безопасные авто-действия.

## Event Ledger

- Источник истины по ключевым изменениям состояния
- Каналы: order, payment, inventory, delivery, support, auth, ai
- Формат событий с `id`, `type`, `actor`, `subject`, `timestamp`, `evidence`, `requestId`
- Хранение immutable и checksum-цепочка для аудита

## Approval Center

- Политики:
  - финансовые операции, возвраты, изменение цен, stock reconciliation
  - любые изменения ролей, зарплат, политик
  - юридические и compliance-сообщения
- Сигнатуры действий: `ai.approval_requested`, `ai.approval_approved`, `ai.action_executed`
- RBAC-гейт + idempotency key для всех критических операций

## Telegram

- Outbound: уведомления по заказу, инцидентам, SLA-событиям
- Inbound: чат-команды и быстрые команды менеджмента
- Для production режима: подтверждение источника webhook, подписи, idempotency

## Camera gateway

- Edge-поток для камер: EZVIZ/ONVIF/RTSP
- Каналы:
  - `camera.queue_detected`
  - `camera.shelf_empty`
  - `camera.incident_detected`
- Условия:
  - legal/privacy оценка перед распознаванием персонала/лиц
  - retention policy для видео/детектов в явном policy-файле

## Observability

- Health checks: API ready/live, worker ready, web ready
- Audit trails по auth, AI actions, payment, delivery, support
- Alerts:
  - failed login spikes
  - ai.action_executed failures
  - worker lag + missed heartbeats
  - backup success/fail and restore checks

## Data retention

- PII: минимизация, маскирование в логах, шифрование токенов
- Мультимедиа от камер: TTL + локальное/облако retention policy
- Backup: версия ключа и периодичность с периодической репликацией

## Rollback

- Неглубокий rollback: отключение AI action executor и блокировка auto-actions
- Откат релиза API/worker через immutable build selector и деплой-rollback
- Data recovery через backup restore и point-in-time validation
- AI rollback: stop actions, keep recommendations read-only


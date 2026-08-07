# AI Role Matrix

| Роль | Назначение | Основные права | Ограничения |
|---|---|---|---|
| `customer` | Покупатель | Просмотр каталога, cart, создание и оплата заказов, тикеты поддержки | Нет доступа к админским экранам и финансовым настройкам |
| `staff` | Оператор/приёмщик | Просмотр заказов, inventory updates, статусные действия для заказов | Нет изменения цен, ролей и payout |
| `courier` | Курьер | Просмотр назначенных маршрутов, обновление статусов доставки | Нет доступа к ценам/скидкам/роли/финансам |
| `manager` | Менеджер магазина | Orders, inventory, support, отчёты, базовая аналитика | Не меняет critical financial policy без 2FA-подтверждения |
| `owner` | Владелец | Полный доступ к бизнес-настройкам своего магазина, отчетность, payroll view | Не может изменять глобальные infra credentials |
| `admin` | Администратор платформы | Полные права для всех tenant-уровней, policy overrides, approval management | Любые критические действия только через RBAC+approval |
| `ai_observer` | Наблюдатель AI | Чтение AI рекомендаций и их rationale | Не выполняет действия |
| `ai_recommender` | AI-рекомендатор | Может создавать `ai.recommendation_created`, но не выполняет действия | Нет критичных side-effects |
| `ai_executor` | AI-исполнитель | Может выполнять разрешённые actions после approval/policy | Не имеет прав на payment/refund/inventory-critical без explicit policy |

## Принципы контроля

- Любые действия с деньгами, ролями и остатками требуют policy + approval.
- Каждый action имеет idempotency key и аудитный след.
- Высокие риски (refund/price-change/stock-critical/role-change) принудительно escalated.


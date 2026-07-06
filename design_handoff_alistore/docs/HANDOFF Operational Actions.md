# AliStore — HANDOFF: Operational Actions (dangerous actions)

Слой опасных действий из Approval Matrix — каждый экран реализует полный цикл **start → action → approval → event → final** со всеми обязательными элементами (роли, статусы, таблица/данные, действие, подтверждение, ошибка/проверка, evidence, audit log, уведомления, связанные экраны).

## Экраны

| Действие | Экран | Инициатор → Аппрувер | Статусы (start→final) | Evidence | Event |
|---|---|---|---|---|---|
| Списание товара | Списание товара | Кладовщик → Владелец | draft→pending→approved→stock.written_off→written_off | фото+акт | stock.written_off |
| Продажа в долг | Продажа в долг | Продавец → Ст. продавец | draft→pending→approved→debt.created→active | паспорт+тел+согласие | debt.created |
| Изменение цены | Изменение цены | Маркетолог → Админ | draft→pending→approved→price.changed→published | причина | price.changed |
| Изменение остатка | Изменение остатка | Кладовщик → Владелец | draft→pending→approved→stock.adjusted→applied | причина+фото | stock.adjusted |
| Удаление товара | Удаление товара | Админ → Владелец | draft→pending→approved→product.archived→archived | проверки | product.archived (soft-delete) |

## Ключевые правила
- **Порог approval**: цена > ±15%, долг > лимита роли, списание/остаток/удаление — всегда approval.
- **Evidence обязателен** до отправки — иначе действие заблокировано (error state).
- **Soft-delete**: товар с историей заказов/гарантий не стирается физически — только архив.
- **Audit log** растёт по каждому переходу; событие пишется в Event Ledger неизменяемо.
- **Уведомления**: аппруверу — запрос, инициатору — результат.

## Реализация
Серверная проверка прав и лимитов обязательна (нельзя доверять клиенту). Approval и запись событий — атомарно с самим действием. Все события — в единый Event Ledger.

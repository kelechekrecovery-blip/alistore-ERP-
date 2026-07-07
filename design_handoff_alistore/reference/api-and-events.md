# AliStore — API & Events reference

Отправная точка для бэкенда. Источник: экран «API Data Contracts» + Order State Machine + Approval Matrix. Все мутации, меняющие деньги/склад/статус, **атомарно пишут AuditEvent** (append-only Event Ledger).

## Общие правила
- **Auth:** JWT + роль; опасные действия требуют 2FA. Права проверяются НА СЕРВЕРЕ по Role Permission Matrix.
- **Идемпотентность:** заголовок `Idempotency-Key` на POST заказов/платежей; webhook-платежи дедуп по `txnId`.
- **Approval-gated** действия возвращают `202 { approvalId }` вместо выполнения, если превышен порог (Approval Rules Matrix). Выполняются после `approval.approved`.
- **Ошибки:** `409` конфликт (двойная продажа IMEI, оплата без резерва), `403` нет прав, `422` валидация, `402` оплата не прошла.

## Endpoints (основные)
```
# Заказы
GET   /orders/:id
POST  /orders                         Idempotency-Key
POST  /orders/:id/transition          { to: OrderStatus }  → сервис state-machine
# Платежи
GET   /payments?orderId=&shiftId=
POST  /payments                       { orderId, method, amount }  (idempotent)
POST  /payments/:id/refund            approval-gated → Refund flow
POST  /webhooks/payment               dedup by txnId
# POS
POST  /pos/sale                       { point, method? | payments[], lines[], discountPct?, clientSaleId? }
                                       payments[].amount суммарно == итог; split пишет отдельные payment.received
# Смены
POST  /shifts/open                    { staffId, point, openCash }
POST  /shifts/:id/close               { closeCash, evidence }  diff≠0 → approval+Risk
# Склад / IMEI
GET   /units/:imei
POST  /inventory/receive              { productId, location, imeis[], grade? } → приёмка партии
PATCH /units/:id/status               sold блокируется если уже sold (409)
POST  /inventory/movements            write_off/adjust → approval+evidence
POST  /inventory/count                инвентаризация
# Возврат / обмен
POST  /returns                        → ReturnStatus машина
POST  /exchanges                      атомарно: return + sale + доплата
# Гарантия / поддержка
POST  /warranty                       { imei, problem } → SLA
PATCH /warranty/:id                   переход статуса
POST  /tickets ; PATCH /tickets/:id   Support Inbox
# Курьер
GET   /courier/runs/:id
POST  /courier/handover               сверка COD, расхождение → Risk
POST  /deliveries/:id/fail            { reason, evidence }  Failed Delivery
# Approvals
POST  /approvals ; PATCH /approvals/:id/decide   { status, reason }
# CRM
POST  /campaigns                      аудитория consent-filtered
GET   /segments/preview               размер + прогноз
# Аудит (только чтение + системная запись)
GET   /audit?ref=&type=
```

## События Event Ledger (тип → когда)
```
order.created / order.confirmed / order.reserved / order.paid /
order.picking / order.packed / order.completed / order.cancelled / order.exchanged
payment.received / payment.refunded / payment.reconciled
stock.received / stock.reserved / stock.moved / stock.adjusted / stock.written_off
inventory.counted
unit.received / unit.sold / unit.returned / unit.written_off
shift.opened / shift.closed / cash.handover / cash.shortage
delivery.assigned / delivery.out / delivery.delivered / delivery.failed
return.requested / return.completed / refund.requested
warranty.created / warranty.closed
approval.requested / approval.approved / approval.rejected
price.changed / product.archived / debt.created
tradein.assessed / tradein.contracted
customer.consent_changed / campaign.sent / campaign.converted
ticket.created / ticket.escalated
```

## Approval-пороги (Approval Rules Matrix)
| Действие | Порог → approval | Аппрувер | Evidence |
|---|---|---|---|
| Скидка | > 10% | Ст. продавец | причина |
| Возврат денег | любой | Администратор | акт+фото |
| Списание | любой | Владелец | фото+акт |
| Изменение цены | > ±15% | Администратор | причина |
| Продажа в долг | > лимита роли | Ст. продавец | паспорт+тел+согласие |
| Изменение остатка | любой | Владелец | причина+фото |
| Удаление товара | любой (→ soft-delete) | Владелец | проверки |
| Доступ к PII | — | Администратор | 2FA + лог |

## Тесты
Реализовать «AliStore QA Test Scenarios» как приёмочные (особенно P0 с 🔴): двойная продажа IMEI, оплата без резерва, COD не сдан, касса не сходится, refund без approval, чужой заказ без OTP.

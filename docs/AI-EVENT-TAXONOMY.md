# AI Event Taxonomy

Цель: единая схема событий для production-операций и AI pipeline.

## Базовая схема события

Каждое событие включает:
- `id`: глобальный UUID
- `type`: тип события
- `actor`: пользователь/система/автоагент
- `subject`: объект домена
- `timestamp`: ISO-8601 UTC
- `source`: `api|web|worker|ai|camera|telegram`
- `requestId`: для трассировки
- `idempotencyKey`: для повторяемых операций
- `payload`: доменная полезная нагрузка
- `evidence`: links/references на source records

## Минимальные события

1. `auth.login`
   - payload: `{ userId, method, success, mfaUsed, uaHash }`
2. `auth.signup`
   - payload: `{ userId, method, email, phoneHash, socialProvider }`
3. `catalog.view`
   - payload: `{ userId, catalogId, filters, source }`
4. `cart.updated`
   - payload: `{ userId, cartId, itemsDelta, total }`
5. `order.created`
   - payload: `{ orderId, userId, total, currency, channel }`
6. `payment.authorized`
   - payload: `{ orderId, provider, providerRef, amount, currency }`
7. `payment.failed`
   - payload: `{ orderId, provider, reason, retryable }`
8. `refund.requested`
   - payload: `{ orderId, requestReason, amount, approvedBy }`
9. `inventory.changed`
   - payload: `{ skuId, delta, warehouseId, reason }`
10. `delivery.delayed`
   - payload: `{ orderId, courierId, fromTs, toTs, reason }`
11. `support.ticket_created`
   - payload: `{ ticketId, userId, priority, channel }`
12. `ai.recommendation_created`
   - payload: `{ actor, confidence, recommendationType, scope, inputEventId }`
13. `ai.approval_requested`
   - payload: `{ action, targetType, targetId, owner, risk, requestedBy }`
14. `ai.action_executed`
   - payload: `{ action, targetType, targetId, result, executedBy }`
15. `camera.queue_detected`
   - payload: `{ cameraId, shelfId, queueLength, confidence }`
16. `camera.shelf_empty`
   - payload: `{ cameraId, shelfId, skuId, confidence }`
17. `camera.incident_detected`
   - payload: `{ cameraId, type, severity, clipRef, retentionUntil }`

## Политики качества событий

- Идентификаторы дублируются в `idempotencyKey` для retry-устойчивости
- Все security-события пишутся в immutable append-only store
- AI-события не должны создавать write actions без `approval status` и policy verdict


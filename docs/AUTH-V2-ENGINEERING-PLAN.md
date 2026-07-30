# AliStore Auth V2 — инженерный план

Статус: принят к реализации 30.07.2026.

## Инварианты

- `Customer.id` — единственный владелец заказов, бонусов, гарантий, возвратов и обращений.
- Новый способ входа никогда не создаёт второй `Customer`, если пользователь доказал владение телефоном существующего аккаунта.
- Телефон нормализуется сервером и подтверждается OTP до создания полноценной customer-сессии.
- Email и provider email не дают права автоматически объединять аккаунты.
- Apple/Telegram subject сначала подтверждается провайдером, но для неизвестного subject выдаётся только короткоживущий enrollment-ticket.
- OTP привязан к `challengeId`, purpose и нормализованному идентификатору, а попытка и погашение выполняются атомарно.
- Customer и staff identities, signing audiences и refresh sessions не смешиваются.
- Старые synthetic social accounts не объединяются автоматически.

## Фаза 0 — P0 текущего auth

1. Нормализовать входящие телефоны на сервере до единого E.164-представления.
2. Разделить OTP purpose: `login`, `recovery`, `email_attach`, далее `social_link` и `reauth`.
3. Принимать `challengeId` на verify; временно поддерживать старые клиенты без него.
4. Атомарно занимать попытку и погашать challenge ровно один раз.
5. Выполнять recovery consume, отзыв старых refresh tokens и выпуск новой пары в одной транзакции.
6. Добавить concurrency и cross-purpose тесты.

Gate:

- 20 параллельных правильных verify дают один успешный результат;
- параллельные неверные попытки не превышают серверный лимит;
- login-код не принимается как recovery-код и наоборот;
- разные представления одного телефона не создают разных клиентов.

## Фаза 1 — Social enrollment V2

Новые versioned endpoints не меняют контракт уже выпущенных клиентов:

```text
POST /auth/v2/social/apple
POST /auth/v2/social/telegram
POST /auth/v2/social/enrollment/complete
```

Known provider identity возвращает обычную сессию. Unknown identity возвращает:

```json
{
  "status": "enrollment_required",
  "enrollmentToken": "<one-time opaque token>",
  "expiresIn": 600
}
```

Enrollment token хранится только в hashed-виде, связан с provider/subject,
имеет TTL и погашается один раз. `complete` принимает enrollment token и
подтверждённый phone challenge. Одна транзакция:

1. блокирует enrollment и challenge;
2. проверяет purpose, TTL, attempts и single-use;
3. находит или создаёт `Customer` по canonical phone;
4. создаёт `CustomerIdentity`;
5. погашает enrollment/challenge;
6. выпускает customer session.

До завершения этой транзакции нельзя создавать synthetic phone, `Customer`,
cookie, access token или refresh token.

## Фаза 2 — единый клиентский UX

Обязательные состояния web/iOS/Android:

```text
identity_entry
requesting_code
code_sent
verifying
authenticated_existing
authenticated_new
provider_resolving
provider_link_required
offline
rate_limited
expired
```

Основной текст: «Войти или создать аккаунт». Email показывается как вход по
ранее привязанной почте. Отдельный recovery-tab не используется: обычный OTP
уже восстанавливает вход, а завершение других сессий является отдельным
security-действием.

Локальная корзина, `next`/deep link и введённые данные не теряются при ошибке,
отмене provider flow или временном отсутствии сети.

## Фаза 3 — legacy reconciliation

До миграции выполняется отчёт без PII:

- число synthetic social customers;
- наличие заказов, платежей, бонусов, гарантий, возвратов, долгов и обращений;
- canonical-phone collisions;
- ссылки `customerId`, не защищённые внешними ключами.

Аккаунты без business history могут мигрироваться по отдельному доказанному
правилу. Аккаунты с историей требуют dual proof и dry-run reconciliation.
Автоматический merge по email запрещён.

## Release gate

- API, web, iOS и Android contract/unit/E2E suites зелёные.
- Phone OTP concurrency и purpose isolation доказаны на PostgreSQL.
- Mixed-version clients не входят в auth loop.
- Unknown Apple identity проходит clean-install enrollment на review-equivalent iPad.
- Review credential имеет обязательный короткий срок действия и не может
  долговременно привязать произвольный provider.
- Любой duplicate customer, cross-account link, повторно принятый challenge или
  потеря business history немедленно останавливает rollout.

## Порядок production rollout

1. Применить additive-миграцию при `AUTH_RECOVERY_OTP_ENABLED=false`.
2. Развернуть compatibility build: login принимает canonical и legacy no-plus
   challenge, но новые recovery challenge ещё не создаются.
3. Дождаться полного drain предыдущей API-ревизии и проверить health/readiness.
4. Установить `AUTH_RECOVERY_OTP_ENABLED=true` и повторно развернуть только новую
   ревизию.
5. Если drain или проверка canonical collision не подтверждены, recovery не
   включать; обычный phone login остаётся доступен.

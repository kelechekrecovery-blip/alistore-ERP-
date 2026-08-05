# Telegram AI Agent AliStore

## Назначение

AliStore использует два независимых Telegram-контура. Старый single-bot endpoint
остаётся для обратной совместимости, но новые production webhook должны быть
разделены:

- Support Bot — публичная поддержка клиентов;
- Ops Bot — внутренний Staff/Admin/CEO контур.

Каждый профиль имеет собственный token, webhook secret, URL, dedup namespace
и outbox-маршрутизацию. Нельзя смешивать секреты профилей.

Support Bot обслуживает:

- принимает вопрос;
- создаёт идемпотентный support ticket;
- показывает только собственные заказы и обращения;
- передаёт диалог сотруднику.

Ops Bot обслуживает только активных `admin`/`owner`:

- dashboard и support-очередь;
- read-only AI-инструменты;
- согласования опасных изменений через TOTP и four-eyes approval.

AI никогда не получает инструментов изменения платежей, возвратов, склада,
ролей, настроек, feature flags или публикации.

## Безопасная активация

1. Создать нового бота через BotFather. Токен, когда-либо отправленный в чат,
   письмо или issue, сначала отозвать командой `/revoke`.
2. Сохранить новый токен только в production secret store.
3. Сгенерировать случайный `TELEGRAM_WEBHOOK_SECRET` длиной 32–256 символов
   в формате Base64URL/hex (`A-Z`, `a-z`, `0-9`, `_`, `-`), например
   `openssl rand -hex 32`. Хранить только в secret store.
4. Установить HTTPS webhook для Support:
   `POST /api/telegram-agent/webhook/support`.
5. Установить HTTPS webhook для Ops:
   `POST /api/telegram-agent/webhook/ops`.
5. Настроить Telegram Mini App URL для клиентской идентификации.
6. Выполнить manual checks из External Readiness и только затем поставить
   `TELEGRAM_AGENT_CERTIFIED=true` и `TELEGRAM_AGENT_ENABLED=true`.

Переменные:

```dotenv
TELEGRAM_AGENT_ENABLED=false
# Legacy single-bot compatibility only
TELEGRAM_BOT_TOKEN=<secret-store>
TELEGRAM_WEBHOOK_SECRET=<secret-store>
TELEGRAM_WEBHOOK_URL=https://api.example.com/api/telegram-agent/webhook

TELEGRAM_SUPPORT_BOT_TOKEN=<secret-store>
TELEGRAM_SUPPORT_WEBHOOK_SECRET=<secret-store>
TELEGRAM_SUPPORT_WEBHOOK_URL=https://api.example.com/api/telegram-agent/webhook/support

TELEGRAM_OPS_BOT_TOKEN=<secret-store>
TELEGRAM_OPS_WEBHOOK_SECRET=<secret-store>
TELEGRAM_OPS_WEBHOOK_URL=https://api.example.com/api/telegram-agent/webhook/ops
TELEGRAM_MINI_APP_URL=https://example.com/tg
TELEGRAM_AGENT_MODEL=
TELEGRAM_AGENT_CUSTOMER_AI_ENABLED=false
CUSTOMER_AI_DATA_CERTIFIED=false
TELEGRAM_AGENT_CERTIFIED=false
OUTBOX_RELAY_ENABLED=true
NOTIFICATION_TRANSPORT=channels
```

## Привязка администратора

1. Admin/owner входит в ERP штатным staff login.
2. Отправляет свой текущий TOTP в
   `POST /api/telegram-agent/pairing-code`.
3. API возвращает одноразовую команду `/link CODE`, действующую 10 минут.
4. Для Ops используется `POST /api/telegram-agent/pairing-code/ops`.
5. Команда отправляется только Ops Bot в личном чате.

Support Bot не принимает `/link` для staff и не может создать staff identity.

Пароль, OTP входа и TOTP никогда не отправляются в Telegram. Одноразовый код
хранится в PostgreSQL только как SHA-256 hash. Повторное применение невозможно.

Для экстренного отключения используется
`DELETE /api/telegram-agent/link` с новым TOTP.
Для внутреннего Ops Bot используется
`DELETE /api/telegram-agent/link/ops`.

## Команды admin/owner в Ops Bot

- `/dashboard` — финансово-операционный статус;
- `/tickets` — открытая support-очередь;
- `/ticket ID` — карточка обращения;
- `/assign ID` — взять обращение;
- `/resolve ID` — закрыть обращение;
- свободный текст — AI-анализ через read-only инструменты.

Каждая команда повторно проверяет активность staff account и RBAC. Изменения
тикетов проходят существующую state machine и Event Ledger.

## Клиентский режим в Support Bot

Клиент автоматически связывается только через уже проверенную
`CustomerIdentity(provider=telegram)`. Сообщение создаёт один ticket с
`channel=telegram`; повтор одного Telegram update не создаёт второй ticket.
Если LLM недоступен, тикет сохраняется, а клиент получает детерминированное
подтверждение.

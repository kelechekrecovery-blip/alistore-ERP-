# Telegram AI Agent AliStore

## Назначение

Один Telegram-бот обслуживает два безопасно разделённых режима:

- клиент: принимает вопрос, создаёт идемпотентный support ticket, показывает
  только собственные заказы и обращения, отвечает через настроенный LLM;
- admin/owner: показывает dashboard и очередь поддержки, позволяет явно взять
  или закрыть тикет; свободный AI-диалог использует только read-only инструменты.

AI никогда не получает инструментов изменения платежей, возвратов, склада,
ролей, настроек, feature flags или публикации.

## Безопасная активация

1. Создать нового бота через BotFather. Токен, когда-либо отправленный в чат,
   письмо или issue, сначала отозвать командой `/revoke`.
2. Сохранить новый токен только в production secret store.
3. Сгенерировать случайный `TELEGRAM_WEBHOOK_SECRET` длиной 32–256 символов
   в формате Base64URL/hex (`A-Z`, `a-z`, `0-9`, `_`, `-`), например
   `openssl rand -hex 32`. Хранить только в secret store.
4. Установить HTTPS webhook на:
   `POST /api/telegram-agent/webhook`, передав secret token Bot API.
5. Настроить Telegram Mini App URL для клиентской идентификации.
6. Выполнить manual checks из External Readiness и только затем поставить
   `TELEGRAM_AGENT_CERTIFIED=true` и `TELEGRAM_AGENT_ENABLED=true`.

Переменные:

```dotenv
TELEGRAM_AGENT_ENABLED=false
TELEGRAM_BOT_TOKEN=<secret-store>
TELEGRAM_WEBHOOK_SECRET=<secret-store>
TELEGRAM_WEBHOOK_URL=https://api.example.com/api/telegram-agent/webhook
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
4. Команда отправляется боту в личном чате.

Пароль, OTP входа и TOTP никогда не отправляются в Telegram. Одноразовый код
хранится в PostgreSQL только как SHA-256 hash. Повторное применение невозможно.

Для экстренного отключения используется
`DELETE /api/telegram-agent/link` с новым TOTP.

## Команды admin/owner

- `/dashboard` — финансово-операционный статус;
- `/tickets` — открытая support-очередь;
- `/ticket ID` — карточка обращения;
- `/assign ID` — взять обращение;
- `/resolve ID` — закрыть обращение;
- свободный текст — AI-анализ через read-only инструменты.

Каждая команда повторно проверяет активность staff account и RBAC. Изменения
тикетов проходят существующую state machine и Event Ledger.

## Клиентский режим

Клиент автоматически связывается только через уже проверенную
`CustomerIdentity(provider=telegram)`. Сообщение создаёт один ticket с
`channel=telegram`; повтор одного Telegram update не создаёт второй ticket.
Если LLM недоступен, тикет сохраняется, а клиент получает детерминированное
подтверждение.

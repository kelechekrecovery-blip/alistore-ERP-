# ТЗ: почта для входа по email на домене `ali.kg` (вариант 1 — Mailgun)

Цель: письма с кодом подтверждения (`email_login` и `email_attach`) реально
уходят пользователю с адреса на нашем домене, а не оседают в `jsonTransport`.

Что этим закрывается в проде:

| Гейт | Файл | Требование |
|---|---|---|
| `email_otp_delivery` | `apps/api/src/health/production-preflight.ts:124` | заданы `SMTP_HOST` и `SMTP_FROM` |
| `otp_dev_echo` | `apps/api/src/health/production-preflight.ts:112` | `AUTH_OTP_DEV_ECHO=false` |
| `campaign_delivery` (частично) | `apps/api/src/health/external-readiness.ts:165` | `NOTIFICATION_TRANSPORT` + `SMTP_HOST` — один и тот же SMTP годится и для рассылок |

Оба preflight-гейта блокирующие: `assertProductionRuntimeReady` вызывается
в `apps/api/src/main.ts:13` и `apps/api/src/worker.ts:3` — прод просто не
поднимется, пока переменные не выставлены.

---

## 0. Что делает код сегодня (чтобы не было сюрпризов)

`apps/api/src/auth/smtp-email-otp.sender.ts`:

- читает `SMTP_HOST`, `SMTP_PORT` (по умолчанию `587`), `SMTP_SECURE`
  (`true` — implicit TLS, иначе STARTTLS), `SMTP_USER`, `SMTP_PASS`,
  `SMTP_FROM` (fallback `AliStore <no-reply@ali.kg>`);
- **без `SMTP_HOST`** транспорт — `jsonTransport`: письмо собирается, но
  никуда не уходит. `assertOperational()` в этом случае бросает, чтобы
  пользователь не ждал письма, которого не будет;
- транспорт свой, независимый от outbox-модуля рассылок (переменные те же).

Отдельно: `apps/api/.env.example` сейчас **не документирует** `SMTP_*` —
это исправляется на шаге 5.

---

## 1. Регистрация в Mailgun (на владельце)

Что нужно: карта (Visa/Mastercard) и телефон. Бесплатный тариф у Mailgun
сейчас — это триал с лимитом, для постоянной отправки платёжный метод
фактически обязателен даже на малых объёмах. Регион при создании аккаунта
выбирайте осознанно: он определяет SMTP-хост (US / EU) и его нельзя
поменять потом без пересоздания домена.

Шаги:

1. Зарегистрироваться на mailgun.com, подтвердить email и телефон.
2. Привязать карту (иначе домен будет только в sandbox-режиме и письма
   уйдут максимум на 5 «авторизованных» адресов).
3. **Sending → Domains → Add New Domain**, ввести `mg.ali.kg`.

**Почему `mg.ali.kg`, а не `ali.kg`:** отдельный поддомен изолирует
репутацию отправителя и не конфликтует с почтой на корневом домене (MX
Google Workspace / Cloudflare Email Routing, чужой SPF). Это же
рекомендация самого Mailgun.

> ⚠️ Важное следствие, которого не было в первой прикидке: Mailgun
> отклоняет письма, у которых домен в `From` не совпадает с
> верифицированным доменом. Если верифицируем `mg.ali.kg`, то
> `SMTP_FROM` обязан быть `…@mg.ali.kg`, а не `noreply@ali.kg`.
> Варианты:
> - **(рекомендуется)** `SMTP_FROM="AliStore <noreply@mg.ali.kg>"`;
> - либо верифицировать корневой `ali.kg` — тогда нужно сводить SPF с
>   тем, что уже стоит на корне, и не ломать существующие MX.
>
> Решение по этому пункту — за владельцем; от него зависит значение
> `SMTP_FROM` на шаге 4.

---

## 2. DNS-записи в Cloudflare

Mailgun после добавления домена показывает точные значения в
**Domain Verification & DNS**. Селектор DKIM и хост трекинга **у каждого
аккаунта свои** — копировать надо ровно то, что показал дашборд, значения
ниже это шаблон, а не то, что можно вбить вслепую.

| Тип | Имя | Значение | Proxy |
|---|---|---|---|
| TXT | `mg.ali.kg` | `v=spf1 include:mailgun.org ~all` | — |
| TXT | `<селектор>._domainkey.mg.ali.kg` | `k=rsa; p=MIGfMA0…` (из дашборда) | — |
| MX | `mg.ali.kg` | `10 mxa.mailgun.org` | — |
| MX | `mg.ali.kg` | `10 mxb.mailgun.org` | — |
| CNAME | `email.mg.ali.kg` (имя — из дашборда) | `mailgun.org` | **DNS only (серое облако)** |

Правила Cloudflare, на которых чаще всего спотыкаются:

- CNAME трекинга **обязан быть DNS-only**. Оранжевое облако = Cloudflare
  подменяет ответ своим IP, Mailgun запись не верифицирует.
- Cloudflare при вводе имени в поле «Name» сам дописывает зону. Вводить
  `mg` (получится `mg.ali.kg`), а не `mg.ali.kg` — иначе выйдет
  `mg.ali.kg.ali.kg`.
- Второй SPF-записи на одном имени быть не должно. На `mg.ali.kg` её
  сейчас нет, поэтому конфликта не будет — но если решим верифицировать
  корень, SPF надо **сливать** в одну строку, а не добавлять вторую.
- MX на `mg.ali.kg` не влияют на почту корневого `ali.kg`.

Минимум для отправки — SPF + DKIM. MX нужны для баунсов/жалоб, CNAME —
для статистики открытий и отписок. Ставим все пять.

После добавления — в Mailgun кнопка **Verify DNS Settings**. Обычно
верификация проходит за минуты; Mailgun допускает до 24–48 часов.

**Что могу сделать я:** если дадите доступ к Cloudflare (API-токен с
правами `Zone.DNS:Edit` на зону `ali.kg`, либо приглашение в аккаунт) —
записи заведу сам. Зарегистрировать Mailgun и привязать карту не смогу.
Альтернатива: пришлите скриншот/копипаст блока Domain Verification & DNS,
и я подготовлю точные записи для ручного ввода.

---

## 3. SMTP-креды в Mailgun

**Sending → Domain settings → SMTP credentials** для `mg.ali.kg`:

- пользователь по умолчанию `postmaster@mg.ali.kg`;
- пароль показывается **один раз** при создании/ресете — сохранить сразу;
- хост: `smtp.mailgun.org` (US) или `smtp.eu.mailgun.org` (EU) —
  по региону аккаунта из шага 1;
- порт `587`, STARTTLS.

Пароль передавать в открытый чат/репозиторий нельзя. Канал передачи —
на усмотрение владельца (менеджер паролей / приватный канал), но
итоговое место хранения — прод-`.env`, не git.

---

## 4. Переменные окружения API

В прод-`.env` (`AUTH_OTP_DEV_ECHO` там сейчас `true` — это и есть блокер
`otp_dev_echo`):

```dotenv
SMTP_HOST="smtp.mailgun.org"        # или smtp.eu.mailgun.org для EU-региона
SMTP_PORT="587"
SMTP_SECURE="false"                 # 587 = STARTTLS; "true" только для порта 465
SMTP_USER="postmaster@mg.ali.kg"
SMTP_PASS="<пароль из Mailgun>"
SMTP_FROM="AliStore <noreply@mg.ali.kg>"

AUTH_OTP_DEV_ECHO="false"
```

Про `SMTP_SECURE`: код сравнивает строку с `'true'`
(`smtp-email-otp.sender.ts:29`), любое другое значение = STARTTLS.
Для 587 это верно; ставить `true` на 587 — гарантированный таймаут.

Если тем же SMTP закрываем и рассылки — добавить
`NOTIFICATION_TRANSPORT` (см. `external-readiness.ts:165`), но это
отдельный вопрос, не блокирующий вход по email.

---

## 5. Что меняется в репозитории

Небольшая правка, делается вместе с настройкой:

- `apps/api/.env.example` — добавить блок `SMTP_*` с комментарием
  (сейчас его нет, и по примеру непонятно, что вообще нужно задать).

Кода трогать не нужно: `SmtpEmailOtpSender` уже читает всё, что выше.

---

## 6. Проверка (гейты, а не «вроде работает»)

1. **Preflight** — покажет статус обоих гейтов на реальном `.env`:

```bash
npm run preflight -w @alistore/api
```

Ожидаем `email_otp_delivery: ready` и `otp_dev_echo: ready`.

2. **Юнит-тест сборки письма** (без сети):

```bash
cd apps/api && NODE_PATH=./node_modules npx jest --runInBand --testPathPattern smtp-email-otp
```

3. **Живой прогон**: перезапустить API, запросить код на реальный адрес,
   убедиться что письмо дошло, и что в ответе API кода **нет**
   (`AUTH_OTP_DEV_ECHO=false`).

4. **Deliverability**: первое письмо проверить на mail-tester.com или
   аналоге — SPF/DKIM должны быть `pass`, иначе Gmail отправит в спам.

---

## 7. Что нужно от владельца (чек-лист)

- [ ] Аккаунт Mailgun + привязанная карта; **зафиксировать регион (US/EU)**
- [ ] Домен `mg.ali.kg` добавлен в Mailgun
- [ ] Решение по `From`: `noreply@mg.ali.kg` (рекомендуется) или верификация корня `ali.kg`
- [ ] DNS: либо доступ к Cloudflare (токен `Zone.DNS:Edit` на `ali.kg`), либо копия блока Domain Verification & DNS
- [ ] SMTP-пароль `postmaster@mg.ali.kg`

После этого настройка `.env` + прогон гейтов из раздела 6 — на мне.

---

## Приложение: если Mailgun не подойдёт

Требования к замене те же: SMTP-хост, логин/пароль, верифицированный
домен отправителя. Код менять не придётся — меняются только `SMTP_*`.
Кандидаты: Resend, Brevo, Amazon SES, Postmark. Cloudflare Email Routing
**не подходит** — он только принимает почту, отправлять через него нельзя.

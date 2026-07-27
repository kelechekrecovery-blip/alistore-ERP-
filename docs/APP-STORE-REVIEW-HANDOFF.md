# App Store: что осталось заполнить владельцу перед Submit

Состояние на 27.07.2026 (снято по ASC API): все четыре — `1.0.0
PREPARE_FOR_SUBMISSION`, **сборка 4 прикреплена**, метаданные (категория +
content rights) применены. Осталось только то, что требует вашего аккаунта и
не может быть сделано за вас. Нового бинарника собирать не нужно.

Приложения: **Client** `kg.alistore.client`, **Staff** `kg.alistore.staff`,
**Courier** `kg.alistore.courier`, **POS** `kg.alistore.pos`.

---

## 1. Демо-аккаунты и вход для ревьюера

Значения генерируются командой (секреты не в репозитории — только в выводе):

```bash
node scripts/prepare-review-credentials.mjs
```

Она печатает: env-блок для Client, три `curl` для создания учёток Staff/Courier/POS
штатным API (argon2-хэш, `totpEnabled=false` по умолчанию — 2FA ревьюера не
запрёт), и готовые пары логин/пароль для полей Demo Account в ASC.

- **Client** входит по фиксированному коду через env API-сервера
  (`AUTH_REVIEW_PHONE`/`AUTH_REVIEW_OTP`/`AUTH_REVIEW_UNTIL`). Механизм inert без
  этих переменных — в обычном проде обхода нет.
- **Staff/Courier/POS** — реальные учётки сотрудников (роли `seller`/`courier`/
  `cashier`). Создаются вами: нужен owner-токен (войдите владельцем).

После ревью: убрать `AUTH_REVIEW_*` с сервера и деактивировать три учётки
(`POST /staff-auth/staff/:id/deactivate`).

---

## 2. App Review Information → Contact (нужно всем четырём)

Заполнить одинаково в каждом приложении: **First name, Last name, Email
(рабочий, отвечающий), Phone (в E.164, напр. +996…)**. Это контакт ревьюера с
вами — не демо-аккаунт.

---

## 3. App Privacy — построчно (скопировать в ASC)

Основано на `PrivacyInfo.xcprivacy` из бинарников. Для **каждого** типа во **всех**
приложениях одинаково: **Data Linked to You: Yes** · **Used for Tracking: No** ·
**Purpose: App Functionality**. Трекинга нет ни в одном (`NSPrivacyTracking=false`).

Соответствие «манифест → раздел ASC»:

| Тип в манифесте | Раздел App Privacy в ASC |
|---|---|
| PhoneNumber | Contact Info → **Phone Number** |
| PhysicalAddress | Contact Info → **Physical Address** |
| Name | Contact Info → **Name** |
| PurchaseHistory | Purchases → **Purchase History** |
| PhotosorVideos | User Content → **Photos or Videos** |
| OtherDataTypes | Other Data → **Other Data Types** |

Что отметить в каждом приложении (Data Types Collected):

- **Client (AliStore KG):** Phone Number · Physical Address · Purchase History ·
  Photos or Videos · Other Data Types
- **Staff:** Name · Phone Number · Purchase History · Photos or Videos
- **Courier:** Phone Number · Physical Address · Purchase History · Photos or Videos
- **POS:** Phone Number · Purchase History

На вопрос «Does this app collect data?» → **Yes**; «Used to track you?» → **No**
(во всех).

---

## 4. Прежде чем жать Submit — два блокера, иначе отказ

Не косметика — без этого ревью завернёт на ваш аккаунт:

1. **Бэкенд в production.** Сейчас прод в dev-режиме (`/api/metrics` отдаёт 200
   без токена → `NODE_ENV≠production`; F-02/F-14 не активны). Выставить
   `NODE_ENV=production` + `NOTIFICATION_TRANSPORT` (без него прод не поднимется —
   fail-closed) и задеплоить.
2. **Витрина не пустая.** Сейчас 4 товара, 0 в наличии — покупку не пройти
   (Guideline 2.1). Завести остатки у 3–4 позиций + по живому объекту на роль:
   заказ в работе (Staff), назначенную доставку (Courier), открытую смену (POS).

---

## 5. Порядок

1. `node scripts/prepare-review-credentials.mjs` → env на сервер, создать 3 учётки.
2. Бэкенд в production + деплой; завести остатки и объекты на роль.
3. В ASC по каждому: Demo Account, Review Contact, App Privacy (разделы 1–3).
4. **Add for Review → Submit** по каждому из четырёх.

Пункты 1–4 — только ваши: ввод учётных данных, App Privacy и Submit делаются под
вашим аккаунтом. Сборки и метаданные уже готовы.

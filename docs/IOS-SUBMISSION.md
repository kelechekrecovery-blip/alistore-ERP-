# iOS — рунбук сабмита в App Store

> Всё до кнопки «Submit» подготовлено и проверено кодом. Дальше — шаги, которые
> может выполнить **только владелец** (платный аккаунт, подпись, публикация,
> секреты). Этот файл превращает их в механический чек-лист. Снято 2026-07-24.

## Текущее состояние (проверено кодом)

| Что | Результат |
|---|---|
| Сборка 4 приложений (`npm run ios:build`) | ✅ BUILD SUCCEEDED |
| Юнит-тесты (AliStoreCore, `npm run ios:test`) | ✅ 112/112 |
| Release-конфигурация (`store-preflight`, non-strict) | ✅ bundle ids `kg.alistore.{client,staff,courier,pos}`, AppIcon, prod APNs, `1.0.0 (3)`, метаданные + privacy manifest |
| Xcode | 26.6 |

Приложения: **AliStoreClient** (клиент), **AliStoreStaff**, **AliStoreCourier**,
**AliStorePOS**. Client — нативное companion-приложение (поиск, трекинг заказов,
рассрочка, рефералы, истории, поддержка, waitlist); покупка идёт на веб-витрине.

## Шаги владельца (по порядку)

### 1. Аккаунты и деньги
- Apple Developer Program — **$99/год**, требует D-U-N-S (получение может занять дни).
- Доступ в App Store Connect.

### 2. Подпись
- Создать **Apple Distribution** сертификат.
- Provisioning profiles (App Store) для всех 4 bundle id: `kg.alistore.client`,
  `.staff`, `.courier`, `.pos`.
- App Store Connect **API key** (`.p8`), запомнить `Key ID` и `Issuer ID`.

### 3. Секреты в `apps/ios/.env.production` (файл владельца, в git не коммитить)
```
ASC_API_KEY_PATH=/путь/AuthKey_XXXXXXXXXX.p8
ASC_KEY_ID=XXXXXXXXXX            # 10 символов
ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   # UUID из ASC
# + переменные подписи (identity/team), как ждёт preflight
```

### 4. Проверка готовности (строгая)
```bash
bash apps/ios/scripts/store-preflight.sh --env-file apps/ios/.env.production --strict-signing --strict-asc
```
Должен пройти без ошибок (проверит подпись + живой ASC-ключ против Apple API).

### 5. Сборка релиза и выгрузка
```bash
bash apps/ios/scripts/archive.sh --env-file apps/ios/.env.production
bash apps/ios/scripts/export-archives.sh --env-file apps/ios/.env.production
```
Затем загрузить в App Store Connect и отправить на ревью (все 4 приложения).

## Блокер ревью — вход ревьюера (нужно решение владельца)

Приложение требует вход по SMS-OTP, а в проде эхо кода выключено → **ревьюер Apple
не сможет войти** и завернёт по Guideline 2.1. Метаданные уже помечены
`demoAccountRequired: true` для Staff/Courier/POS. Варианты:

1. **Review-учётка через env (рекомендую).** Один заранее заданный номер принимает
   один фиксированный код — только когда `AUTH_REVIEW_PHONE` и `AUTH_REVIEW_OTP`
   заданы (по умолчанию выключено). Ревьюер входит этими значениями. Это
   security-чувствительное изменение в auth — **реализую по вашему явному «да»**
   (opt-in, off по умолчанию, инертно без env, с TDD и ledger-security-ревью).
2. Номер владельца (ревьюер звонит/пишет владельцу за кодом) — просто, но неудобно.
3. Гостевой режим без входа — большой натив-объём, риск Guideline 2.1 иначе.

## Почему это не сделал агент

Выгрузка = трата денег владельца + внешняя публикация + использование секретов
владельца (`.env.production`). Каркас, сборка, тесты и метаданные — подготовлены и
зелёные; аккаунт, подпись, публикация и решение по входу ревьюера — за владельцем.

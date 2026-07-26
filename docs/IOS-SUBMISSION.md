# iOS — рунбук сабмита в App Store

> Всё до кнопки «Submit» подготовлено и проверено кодом. Дальше — шаги, которые
> может выполнить **только владелец** (платный аккаунт, подпись, публикация,
> секреты). Этот файл превращает их в механический чек-лист. Снято 2026-07-24,
> статус выгрузки обновлён 2026-07-26.

> **Выгрузка уже выполнена.** Все четыре приложения загружены в App Store Connect
> сборкой **`1.0.0 (4)`**, она `VALID` и привязана к версии. Пересборка и повторная
> выгрузка не нужны. Актуальное состояние и оставшиеся шаги владельца —
> в [`apps/ios/store/SUBMISSION-STATUS.md`](../apps/ios/store/SUBMISSION-STATUS.md);
> разделы ниже описывают, как этот пайплайн устроен.

## Текущее состояние (проверено кодом)

| Что | Результат |
|---|---|
| Сборка 4 приложений (`npm run ios:build`) | ✅ BUILD SUCCEEDED |
| Юнит-тесты (AliStoreCore, `npm run ios:test`) | ✅ 112/112 |
| Release-конфигурация (`store-preflight`, non-strict) | ✅ bundle ids `kg.alistore.{client,staff,courier,pos}`, AppIcon, prod APNs, метаданные + privacy manifest |
| В App Store Connect | ✅ `1.0.0 (4)` загружена и привязана по всем четырём bundle id |
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

> **Охват: механизм ниже закрывает только Client.** `isReviewLogin` живёт в
> `verifyOtp` и делает `customer.upsert` — токен customer-scope. Staff, Courier и
> POS входят через `staff-auth/login` логином и учётными данными сотрудника
> (`apps/ios/Shared/StaffAuthStore.swift`), никакого OTP там нет. Для этих трёх
> нужны три реальные учётки сотрудников из ERP — с **выключенным TOTP**, иначе
> ревьюер не войдёт.

1. **Review-учётка через env — РЕАЛИЗОВАНО ✅.** Один заранее заданный номер
   принимает один фиксированный код, только когда заданы **обе** переменные;
   без них механизм полностью инертен (никакого байпаса в проде). Чтобы включить
   на время ревью, задайте в окружении API:
   ```
   AUTH_REVIEW_PHONE=+996XXXXXXXXX     # ОДНОРАЗОВЫЙ номер (не реальный клиент!), укажете в App Review Notes
   AUTH_REVIEW_OTP=Xy7Qw2              # 6 симв., mixed-case буквы+цифры (не только цифры — больше энтропии)
   AUTH_REVIEW_UNTIL=2026-08-15T00:00:00Z   # опционально: окно само закроется даже если забыть убрать env
   ```
   Ревьюер вводит этот номер и код в приложении. **После ревью уберите переменные.**
   Защита: механизм инертен без обеих переменных; при заданном `AUTH_REVIEW_PHONE`
   API пишет WARN в лог на старте; `AUTH_REVIEW_UNTIL` в прошлом/неразборчивый →
   вход отключается (fail-closed). Номер должен быть **одноразовым** — при
   `verifyOtp` создаётся/находится покупатель по этому номеру, так что реальный
   клиентский номер стал бы постоянным бэкдором.
   Реализовано в `apps/api/src/auth/auth.service.ts` (`verifyOtp` → `isReviewLogin`),
   покрыто `apps/api/test/auth-review-login.e2e-spec.ts` (10 кейсов: точное
   совпадение, частичный/пустой/whitespace env, истёкшее окно, recovery НЕ
   байпасится, customer-scope токена). Проверено ledger-security-ревью: без
   CRITICAL/HIGH.
2. Номер владельца (ревьюер звонит/пишет владельцу за кодом) — просто, но неудобно.
3. Гостевой режим без входа — большой натив-объём, риск Guideline 2.1 иначе.

## Почему это не сделал агент

Выгрузка = трата денег владельца + внешняя публикация + использование секретов
владельца (`.env.production`). Каркас, сборка, тесты и метаданные — подготовлены и
зелёные; аккаунт, подпись, публикация и решение по входу ревьюера — за владельцем.

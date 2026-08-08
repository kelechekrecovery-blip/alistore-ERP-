# iOS — рунбук сабмита в App Store

> Всё до кнопки «Submit» подготовлено и проверено кодом. Дальше — шаги, которые
> может выполнить **только владелец** (платный аккаунт, подпись, публикация,
> секреты). Этот файл — механический чек‑лист перед очередным resubmit.
>
> Обновление статуса: 2026-08-07.

> **Выгрузка выполнена, но сейчас все 4 версии отклонены.** Все приложения сейчас
> в App Store Connect на `1.0.0 (5)` и имеют статус `REJECTED` (см. деталь в
> [`apps/ios/store/SUBMISSION-STATUS.md`](../apps/ios/store/SUBMISSION-STATUS.md)).

## Текущее состояние (проверено кодом)

| Что | Результат |
|---|---|
| Сборка (`npm run ios:build`) | ✅ BUILD SUCCEEDED |
| Юнит/контракт/локальные UI-гейты | ✅ зелёные на текущей ветке |
| Release-конфигурация (`store-preflight`, non-strict) | ✅ bundle ids, AppIcon, prod APNs, метаданные + privacy manifest |
| Подготовка в ASC | ✅ `1.0.0 (5)` привязана по всем четырём bundle id |
| App Store статус | ⚠️ `REJECTED` для всех четырёх сборок |
| Xcode | 26.6 |

Приложения: **AliStoreClient**, **AliStoreStaff**, **AliStoreCourier**, **AliStorePOS**.

## Что должно сделать владелец перед новой подачей

### 1) Доступы и подпись

- Apple Developer Program (или подтверждённый аккаунт организации).
- App Store Connect с правами App Manager/Account Holder.
- Apple Distribution сертификат.
- App Store Connect API key (`.p8`) + `Key ID` + `Issuer ID`.
- Provisioning profiles (App Store) для всех 4 bundle id:
  - `kg.alistore.client`
  - `kg.alistore.staff`
  - `kg.alistore.courier`
  - `kg.alistore.pos`

### 2) Заполнить `apps/ios/.env.production` (файл владельца, в репозиторий не коммитить)

```bash
ASC_API_KEY_PATH=/путь/AuthKey_KEYID.p8
ASC_KEY_ID=XXXXXXXXXX            # 10 символов
ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
DEVELOPMENT_TEAM=ZYU3F8W56P      # 10 символов
ALISTORE_API_BASE_URL=https://api.ali.kg/api
IOS_ALLOW_PROVISIONING_UPDATE=false
```

### 3) Жёсткий preflight

```bash
bash apps/ios/scripts/store-preflight.sh --env-file apps/ios/.env.production --strict-signing --strict-asc
```

### 4) Подготовить reviewer-доступ и проверить live readiness

```bash
# Подготовка bundle-credential (выполнять на сервере/локально, вне репозитория)
npm run ios:review-credentials -- --point <ACTIVE_BRANCH_CODE> --output /secure/location/review-creds.txt

# Проверка соответствия демо-аккаунтов ASC и readiness API
ALISTORE_REVIEW_POINT=<ACTIVE_BRANCH_CODE> npm run ios:review-readiness -- --env-file apps/ios/.env.production
```

В сгенерированном файле:
- `AUTH_REVIEW_PHONE / AUTH_REVIEW_OTP / AUTH_REVIEW_UNTIL` для Client
- 3 staff-учётки для Staff/Courier/POS.

### 5) Данные для review-демо

```bash
# Проверка скриптового seed (без применения)
npm run review:seed -- --api-base https://api.ali.kg/api --location <branch>

# Применение на проде
ALISTORE_SEED_TOKEN=<STAFF_TOKEN> npm run review:seed -- --api-base https://api.ali.kg/api --location <branch> --apply --yes-production
```

Также вручную добавить в живом проде:
- Staff: активную задачу для профиля review staff;
- Courier: назначенную доставку в статусе `courier_assigned / out_for_delivery`;
- POS: открытую смену в `shifts/current`;
- для всех 3 non-Client приложений проверить выключенный TOTP у reviewer-аккаунтов.

### 6) Сборка + загрузка build 6 и submission

```bash
bash apps/ios/scripts/archive.sh --env-file apps/ios/.env.production
bash apps/ios/scripts/export-archives.sh --env-file apps/ios/.env.production
```

Далее в App Store Connect:
1. Подменить build на `1.0.0 (6)`
2. Добавить в каждую версию App Review notes и demo-account
3. Для Staff/Courier/POS подтверждённо выбрать корректную схему дистрибуции
   (Unlisted или Apple Business Manager Custom App), иначе возможно повторное `3.2`.
4. **Client** — отправить после проверки Sign in with Apple на физическом устройстве.
5. Отправить на review.

## Блокеры по rejection — и конкретный след

- **AliStore KG**: `2.1(a)` — Reviewer не смог пройти Sign in with Apple на iPadOS 26.6. Нужно доказать физический SIWA и upload нового build 6.
- **AliStore Staff / Courier / POS**: `3.2` — текущая публикация публичная для employee-only приложений. Нужна корректная стратегия дистрибуции.

## Почему это не сделал агент

Выполнить upload в App Store и реальную проверку на устройстве может только владелец.
Код, скрипты, метаданные, privacy/снапшоты и проверки — уже подготовлены и закрыты
в кодовой части. Остальное зависит от аккаунтов, сертификатов, live-устройств и
решения по модели распространения.

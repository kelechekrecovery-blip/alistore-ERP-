# План: технический долг нативного iOS (Client / Staff / Courier / POS)

> **Обновление 21.07.2026 — этот документ описывает НЕ первоочередное.**
>
> Замер покрытия завершился: Staff **77,17 %**, Client **66,66 %**, Courier **63,30 %**,
> POS **62,67 %**, AliStoreCore **51,79 %** (прогон схемы `AliStoreUITests`
> с `-enableCodeCoverage YES`). Кризиса покрытия нет — «0 % у Client» ниже был
> артефактом схемы, на которой мерили.
>
> Последующий аудит семью экспертными ролями нашёл дефекты **тяжелее всего
> перечисленного здесь**. Три блокируют релиз:
>
> 1. **Вход в Client не работает в принципе.** `Shared/Models.swift:264` требует
>    `expiresIn: Int` в `OTPChallenge`, сервер (`auth.service.ts:69,86`) это поле
>    не отдаёт никогда — декодирование падает всегда. Подтверждено на симуляторе.
> 2. **Курьер не может закрыть доставку ни на iOS, ни на Android.** Сервер
>    безусловно требует `evidenceIdempotencyKey` (`courier.controller.ts:92`),
>    в мобильных DTO поля нет. Шлёт его только веб.
> 3. **PIN сбрасывается с экрана блокировки без знания старого**
>    (`Shared/QuickUnlock.swift:241-250`), счётчик попыток при этом обнуляется.
>    Тот же дефект в Android (`QuickUnlock.kt:71,185`) — все восемь приложений.
>
> Плюс денежные: `activeSaleId` не ротируется в офлайн-ветке POS (вторая продажа
> исчезает молча), округление скидки расходится на трёх платформах
> (iOS `ceil` / Android `floor` / сервер `round` → 422), `cash == total`
> в split-tender уводит наличные в карту. И `apps/ios` **не имеет версионирования
> схемы SwiftData** — несовместимое изменение модели даст краш на старте у всех,
> включая устройства с непроведёнными продажами.
>
> Порядок работ ниже сохранён как есть, но выполнять его следует **после**
> перечисленного. Из него остаются оправданными срезы 2, 5 и 6.

Статус: черновик на согласование. Исполнять через `.claude/skills/executing-plans`.
Основание: прогон SwiftLint 0.65.0, `xcodebuild test -enableCodeCoverage YES` и три
параллельных read-only разбора кода (см. «Что оказалось неправдой»).

---

## 0. Контекст

После подключения XcodeBuildMCP + SwiftLint появились три претензии к iOS-коду:
9 предупреждений акторной изоляции, 14 нарушений `force_unwrapping`, покрытие
Client-таргета 0 %. Проверка каждой по коду показала, что **приоритет был выставлен
неверно**, а настоящий риск лежал в четвёртом месте, которого в списке не было.

### Что оказалось неправдой

| Утверждение | Проверка | Вывод |
|---|---|---|
| «Предупреждения станут ошибками при переходе на Swift 6» | `project.yml:8` → `SWIFT_VERSION: "6.0"`; живой `xcodebuild -showBuildSettings` → `EFFECTIVE_SWIFT_VERSION = 6` | Проект **уже** на Swift 6. Дедлайна нет |
| «14 force_unwrapping — потенциальные краши у пользователя» | Прочитаны все 14 мест | Все SAFE. 10 из 14 — в тест-таргете, который не входит в App Store-бинарь |
| «Client-таргет не покрыт тестами» | `UITests/Client/AliStoreClientUITests.swift` — 23 XCUITest-функции, гоняющие живое приложение | 0 % — артефакт замера: схема `AliStoreUITests` не входит в `test.targets` схемы `AliStoreClient` |

### Что оказалось правдой и не было в списке

`Shared/AppEnvironment.swift:10-17` вызывает `preconditionFailure`, если
`API_BASE_URL` пуст или невалиден. В Release значение приходит из
`$(ALISTORE_API_BASE_URL)` (`project.yml:74,119,163,207`). Архив, собранный без
экспортированной переменной, получит пустую строку → `URL(string: "")` = nil →
**краш на старте App Store-сборки**. Защита сегодня только процессная —
`scripts/store-preflight.sh:87-94,155-159`, который надо не забыть запустить.
Это единственный найденный дефект класса «app crashed on launch».

### Намеченный результат

Один прогон `npm run ios:test` и `npm run ios:lint` даёт честную картину; краш на
старте невозможен по коду, а не по регламенту; логика Client вынесена в
тестируемый `AliStoreCore` по образцу существующего `POSReturnFlow`.

---

## 1. Задачи

Порядок — по убыванию реального риска, а не по громкости цифры.
Один срез = один коммит.

### Срез 1. Честный замер покрытия (0 правок кода)

- **Зачем:** отчёт «0 %» описывает не код, а выбор схемы. Пока цифра неверна,
  любое решение по тестам принимается вслепую.
- **Файлы:** `apps/ios/project.yml` — в схему `AliStoreClient`, ключ `test.targets`,
  добавить `AliStoreUITests` рядом с `AliStoreCoreTests`.
- **Acceptance:** `npm run ios:generate`, затем прогон с `-enableCodeCoverage YES`
  показывает для таргета `AliStore.app` число, отличное от нуля.
- **Минимальное изменение:** одна строка в `project.yml`. Кода не трогаем.
- **Записать:** полученные проценты — в `docs/READINESS.md`, оба числа
  (`AliStore.app` и `AliStoreCore.framework`), не одно.

### Срез 2. Краш на старте невозможен по коду

- **Зачем:** единственный найденный отказ, который Apple видит как
  «app crashed on launch». Сейчас его предотвращает только память человека.
- **Файлы:**
  - `apps/ios/Shared/AppEnvironment.swift:10-17` — заменить `preconditionFailure`
    на явный отказ с фолбэком.
  - `apps/ios/Tests/AppEnvironmentTests.swift` — новый.
- **Тест (RED, до реализации):** `testFallsBackWhenApiBaseUrlMissing` — при пустой
  и при невалидной строке `AppEnvironment.live()` возвращает окружение с
  `https://api.ali.kg/api`, а не завершает процесс.
- **Минимальное изменение:** `guard let url = URL(string: raw), url.scheme != nil
  else { return AppEnvironment(apiBaseURL: fallbackURL) }` + запись в лог.
  Неверная конфигурация превращается в сетевую ошибку в UI вместо мгновенного краша.
- **Не трогаем:** `scripts/store-preflight.sh` — он остаётся как второй рубеж.

### Срез 3. `MoneyFormat` — первая вынесенная и покрытая логика

- **Зачем:** одна и та же группировка сумм написана **четыре раза** и не покрыта
  ни одним тестом. Самый дешёвый вынос, доказывающий схему на будущее.
- **Файлы:**
  - создать `apps/ios/Shared/MoneyFormat.swift`
  - создать `apps/ios/Tests/MoneyFormatTests.swift`
  - удалить дубли: `Client/AliStoreClientApp.swift:83-89` (`clientGroupedDigits`),
    `:4259-4262` (`AccountView.groupedNumber`),
    `Client/Features/InstallmentView.swift:241-247` (`installmentSom`),
    `Client/Features/ReferralView.swift:~142` (`installmentGrouped`)
- **Образец для подражания:** `apps/ios/Shared/POSReturnFlow.swift` (public enum +
  static-функции) и `apps/ios/Tests/POSReturnFlowTests.swift` (табличные
  `XCTAssertEqual`). Копировать форму один в один.
- **Тест (RED):** `MoneyFormatTests.testGroupsThousands` — 0, 1, 999, 1000, 1234567,
  отрицательное, дробное.
- **project.yml не трогаем:** `sources: Shared` и `sources: Tests` — папочные
  ссылки без явного списка, новые файлы подхватятся после `npm run ios:generate`.

### Срез 4. `PaymentResultClassifier`

- **Зачем:** `Client/AliStoreClientApp.swift:1999-2014` решает, что сказать клиенту
  про его платёж (успех / ожидание / отказ). В самом файле стоит комментарий, что
  без серверного вебхука деньги не подтверждены — а классификатор при этом не
  покрыт ничем.
- **Файлы:** создать `apps/ios/Shared/PaymentResultClassifier.swift` и
  `apps/ios/Tests/PaymentResultClassifierTests.swift`; тело `resultState` в
  `AliStoreClientApp.swift:1999-2014` заменить вызовом.
- **Тест (RED):** по одному кейсу на каждый статус шлюза + неизвестный статус
  (должен трактоваться как «ожидание», а не как «успех»).

### Срез 5. Акторная изоляция — 10 мест, две правки

- **Зачем:** не потому что «сломается на Swift 6» (проект уже на нём и собирается),
  а потому что это дешевле любого другого пункта и убирает шум из вывода сборки.
  **Реального риска гонки нет ни в одной группе** — оба замыкания выполняются
  синхронно на MainActor, `@Sendable` в сигнатурах SwiftUI/PhotosUI — общая
  особенность API, а не признак параллельного вызова.
- **Правка А** — `Client/AliStoreClientApp.swift:3115-3125`: поднять
  `let hasPhoto = selectedPhoto != nil` **до** вызова `PhotosPicker` и внутри
  замыкания читать только его. `Bool` сендабелен и захватывается по значению.
  Закрывает 4 места из списка (физически 5 диагностик — строка 3124 даёт две).
- **Правка Б** — `Client/Features/ClientDebugFeature.swift:21`: дописать
  `@MainActor` к уже существующему `@ViewBuilder var screen`. Закрывает
  оставшиеся 5. Единственный вызов — `AliStoreClientApp.swift:998` внутри `body`,
  он уже на MainActor, `await` не понадобится.
- **Правка В (не было в исходном списке)** — `POS/POSOperationsView.swift:328-329`:
  ровно тот же дефект, что и в правке А, с `exchangeEvidence` (объявлен на `:268`).
  Подтверждён живой сборкой схемы `AliStorePOS`. Тот же приём: поднять
  `let hasEvidence = exchangeEvidence != nil`.
- **Acceptance:** `npm run ios:build` даёт ноль предупреждений
  `main actor-isolated` / `non-Sendable` по всем четырём схемам.
- **Проверено и не трогаем:** `Client/AliStoreClientApp.swift:3447`,
  `Courier/CourierOperationsView.swift:447`, `Staff/StaffScannerView.swift:304` —
  тоже `PhotosPicker`, но с статическими подписями, предупреждений не дают.

### Срез 6. `force_cast` — единственное нарушение уровня error

- **Файл:** `apps/ios/Shared/APIClient.swift:214` — `EmptyResponse() as! Response`.
  Каст защищён проверкой метатипа строкой выше и провалиться не может, но
  SwiftLint помечает его как **error**, что помешает включить линтер в гейт.
- **Минимальное изменение:** `if Response.self == EmptyResponse.self, data.isEmpty,
  let empty = EmptyResponse() as? Response { return empty }`. Поведение идентично.

### Срез 7. Оставшиеся выносы (по одному коммиту на каждый)

В порядке «риск бага × дешевизна»:

1. `DeepLinkRouting` ← `AliStoreClientApp.swift:55-58,60-67,1032-1040` — разбор
   недоверенного внешнего ввода (диплинки, push-payload).
2. `PhoneFormat` ← `:372-375` (нормализация перед запросом OTP), `:4068-4075`
   (маскирование PII).
3. `CartStock` ← `:1811-1820` (ограничение по остатку), `:2314-2351` (повтор
   заказа). Требует переделки из мутации `@State` в чистую функцию.
4. `FormValidation` ← `:3526-3536` — валидация цены trade-in на границе системы.
5. `CheckoutCalculator` ← `:1390-1396`, `:1772-1783`, `:1785-1794`, `:1822-1842` —
   вся арифметика заказа и правило cod/prepaid. **Делать последним**: читает ~10
   `@State`-переменных, нужна самая большая переделка. Сначала доказать схему на
   пяти дешёвых срезах.

`force_unwrapping` (14 мест) и `line_length` (429) в план **не входят** —
косметика без риска. Дедупликация `MockURLProtocol`, скопированного в пять
тест-файлов, попадает в бэклог, а не в этот план.

---

## 2. Верификация

Гейты существующие, новых не заводим (`verification-before-completion`):

| Что | Команда |
|---|---|
| Сборка всех четырёх таргетов | `npm run ios:build` |
| Юнит-тесты | `npm run ios:test` |
| UI-тесты | `npm run ios:ui` |
| Линтер | `npm run ios:lint` |
| Регенерация проекта после новых файлов | `npm run ios:generate` |
| Общий гейт репозитория | `npm run mvp:verify -- --skip-e2e` |

После каждого среза: `ios:generate` → `ios:test` → `ios:lint` → один коммит.

**Линтер в блокирующий гейт не включаем** до закрытия среза 6 — сейчас в выводе
есть нарушения уровня error, и `mvp:verify` из-за них покраснеет.

---

## 3. Файлы

**Создаются:** `Shared/MoneyFormat.swift`, `Shared/PaymentResultClassifier.swift`,
`Tests/AppEnvironmentTests.swift`, `Tests/MoneyFormatTests.swift`,
`Tests/PaymentResultClassifierTests.swift`; далее по срезу 7 —
`Shared/DeepLinkRouting.swift`, `PhoneFormat.swift`, `CartStock.swift`,
`FormValidation.swift`, `CheckoutCalculator.swift` + тесты к каждому.

**Изменяются:** `project.yml` (одна строка, срез 1), `Shared/AppEnvironment.swift`,
`Shared/APIClient.swift:214`, `Client/AliStoreClientApp.swift` (замена вынесенных
тел на вызовы + правка А), `Client/Features/ClientDebugFeature.swift:21`,
`Client/Features/InstallmentView.swift`, `Client/Features/ReferralView.swift`,
`POS/POSOperationsView.swift:328-329`.

**Явно не трогаем:** `scripts/store-preflight.sh` (остаётся вторым рубежом);
`UITests/**` (уже покрывают приложение, меняем только их участие в замере);
`Courier/**` и `Staff/**`, кроме отсутствия правок — там предупреждений нет;
таргет `AliStoreClientTests` с host application **не создаём** — вся ценная логика
объявлена `private` на уровне файла и невидима даже для `@testable import`, так что
хостовый тест-таргет стоил бы тех же правок плюс медленный рантайм. Оставляем как
задокументированный запасной путь.

---

## 4. Честная оценка результата

Вынос логики в `AliStoreCore` **не поднимет** процент по `AliStore.app` — он
уменьшит знаменатель Client и поднимет покрытие фреймворка (18,4 % → ориентировочно
25-35 % после срезов 3-7). Реальную цифру по приложению даёт срез 1, а не рефакторинг.
Дальше в `docs/READINESS.md` держим оба числа: покрытие `AliStoreCore` отражает
прогресс этого плана, покрытие `AliStore.app` — что код приложения вообще
исполняется тестами.

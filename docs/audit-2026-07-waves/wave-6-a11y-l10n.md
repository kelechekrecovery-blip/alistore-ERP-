# План: доступность и локализация `apps/ios` (находки 6.1–6.9)

> Исполнять сверху вниз. Один срез = один коммит. Ничего не делать «заодно».
> Все номера строк проверены на рабочем дереве ветки `codex/open-source-integrations`.

## Что проверено до написания плана (факты, не догадки)

| Факт | Как проверен |
|---|---|
| `.lproj` / `Localizable.strings` / `.xcstrings` в `apps/ios` — **ноль** | `find apps/ios -name "*.lproj" -o -name "Localizable*"` |
| Собранный бандл: `AliStore.app/Info.plist` → `CFBundleDevelopmentRegion = en`, `.lproj` внутри нет | `plutil -extract CFBundleDevelopmentRegion raw build/ReleaseDryRun/.../AliStore.app/Info.plist` → `en` |
| XcodeGen 2.45.4 понимает `options.developmentLanguage` и `options.knownRegions` | `strings /opt/homebrew/bin/xcodegen \| grep -x` — обе строки присутствуют |
| `Branding/` входит в `sources` **всех четырёх** приложений (`project.yml`) | `project.yml`, targets AliStoreClient/Staff/Courier/POS |
| **Все деньги в моделях — `Int`** (`price`, `total`, `openCash`, `codTotal`, `refundAmount`, `fee`, …) | `Shared/Models.swift:5,43,101,154,196,461,497,1182,1198,…` |
| `109900` в `ru_KG` даёт ровно `109 900 сом`; в `ru_RU` — `109 900 KGS`; в `en_KG` — `KGS 109 900` | прогон `Int.formatted(.currency(code:"KGS").precision(.fractionLength(0)).locale(...))` через `xcrun swift -` на этой машине |
| Композит `.ultraThinMaterial` в тёмной теме ≈ нейтральный **#414141** | обратный счёт из измеренных аудитом 3.80 / 2.62 / 1.77 — совпало до сотых на всех трёх токенах |
| `textMuted` на **непрозрачных** поверхностях = 5.76 (surface) / 6.35 (screen) — норму держит; проваливает **только стекло** | расчёт WCAG по `Design3.swift:29-39` |
| `textSubtle` 3.96 и `textFaint` 2.68 проваливают норму **и на непрозрачном** — это долг токена, а не стекла | там же |
| `UIAccessibility.post` / `AccessibilityNotification` / `accessibilityReduceMotion` / `ScaledMetric` / `Font.custom(relativeTo:)` — **ноль вхождений** | grep по Client/Staff/POS/Courier/Shared |
| `.font(.system(size:))` — **58 вхождений** (38 из них в `Client/AliStoreClientApp.swift`) | `grep -rc` |
| `ContentUnavailableView` — 15 вхождений, `.searchable` — 1 (`Client/…:5761`) | grep |
| `APIError` (`Shared/APIClient.swift:3-18`) уже отдаёт русские тексты; по-английски приходит только системный `URLError` | чтение файла |
| **iOS вообще нет в CI**: `.github/workflows/*.yml` не содержит ни одного упоминания `ios` | `grep -l ios .github/workflows/*.yml` → пусто |
| `npm run ios:test` = схема `AliStoreClient`, тестовый таргет один — `AliStoreCoreTests` (`sources: Tests`, зависит только от `AliStoreCore`) | `package.json:23`, `project.yml` schemes |
| `npm run ios:ui` = схема `AliStoreUITests` (4 UI-таргета), локально, в CI не запускается | `package.json:24` |
| SwiftLint подключён, но **намеренно не блокирующий** (544 нарушения на момент подключения) | `apps/ios/.swiftlint.yml`, шапка файла |

**Главный рычаг acceptance:** всё, что положено в `apps/ios/Shared/` (фреймворк `AliStoreCore`), покрывается юнит-тестом в `apps/ios/Tests/` и гоняется одной командой `npm run ios:test`. Поэтому каждый срез, где это возможно, сначала **переносит логику в `Shared/`**, а потом чинит вызовы. Это не рефакторинг ради красоты — это единственный способ получить в этом репозитории автотест на формат денег, дат и контраст.

---

### Срез 1 — Русская локаль как основа

**Зависит от:** ничего. Идёт первым: меняет резолв локали глобально, поэтому должен лежать в отдельном коммите, чтобы любая регрессия читалась по `git bisect`.

**Что здесь происходит на самом деле.**
`Bundle.main.preferredLocalizations` вычисляется как пересечение языков устройства и **фактических локализаций бандла**. Локализация бандла — это `.lproj`-каталоги внутри `.app` плюс `CFBundleDevelopmentRegion`. Сейчас в бандле `.lproj` нет ни одного, а `CFBundleDevelopmentRegion = en` (проверено на собранном артефакте). Значит `preferredLocalizations == ["en"]`, и `Locale.current` собирается как «язык из бандла + регион из настроек» → `en_KG`. Отсюда `KGS 109 900`, даты `Jul 21, 2026 at 2:30 PM` и английские системные строки: UIKit/SwiftUI выбирают язык своих строк по списку локализаций **главного бандла**, а не по языку устройства.

Поэтому одной правки `project.yml` **недостаточно** — `developmentRegion` в `.pbxproj` влияет на Xcode и на fallback, но `.lproj` в бандле от него не появится. Нужен физический каталог с ресурсом. Он же — единственное, что заставит систему признать приложение русским.

**Acceptance:**
1. *До правки* (зафиксировать вывод в теле коммита):
   ```
   plutil -extract CFBundleDevelopmentRegion raw \
     apps/ios/build/Debug-iphonesimulator/AliStore.app/Info.plist          # ожидается: en
   find apps/ios/build/Debug-iphonesimulator/AliStore.app -maxdepth 1 -name '*.lproj'   # ожидается: пусто
   ```
2. *После* `npm run ios:generate && npm run ios:build` — те же две команды: `ru` и `…/AliStore.app/ru.lproj`. Повторить для `AliStoreStaff.app`, `AliStoreCourier.app`, `AliStorePOS.app`.
3. Новый юнит-тест `apps/ios/Tests/LocalizationContractTests.swift` (гоняется `npm run ios:test`):
   ```swift
   func testAppBundleDeclaresRussian() {
       XCTAssertTrue(Bundle.main.localizations.contains("ru"))
       XCTAssertEqual(Bundle.main.preferredLocalizations.first, "ru")
   }
   ```
   ⚠️ `AliStoreCoreTests` — это XCTest-бандл, инжектируемый в **хост-приложение**, поэтому `Bundle.main` здесь = `AliStoreClient.app`. Если из-за конфигурации теста `Bundle.main` окажется тестовым раннером, тест переписать на `Bundle(for: APIClientTests.self).bundleURL.deletingLastPathComponent()` — но сначала запустить как есть и посмотреть, что реально вернулось; не угадывать.
4. Статический валидатор (см. Срез 4, шаг «валидатор») получает правило: `apps/ios/project.yml` обязан содержать `developmentLanguage: ru`, а `apps/ios/Branding/ru.lproj/Localizable.strings` — существовать.
5. Глазами на симуляторе (см. финальный раздел).

**Файлы:**

- `apps/ios/project.yml:2-6` — в блок `options` добавить две строки:
  ```yaml
  options:
    bundleIdPrefix: kg.alistore
    developmentLanguage: ru        # ← новое: PBXProject.developmentRegion = ru
    knownRegions: [ru, Base]       # ← новое: заменяет (Base, en)
    deploymentTarget:
      iOS: "17.0"
  ```
- `apps/ios/project.yml:8-13` — в `settings.base` добавить одну строку **рядом с `SWIFT_VERSION`**:
  ```yaml
      DEVELOPMENT_LANGUAGE: ru
  ```
  Зачем отдельно: во всех четырёх `Info.plist` стоит `<key>CFBundleDevelopmentRegion</key><string>$(DEVELOPMENT_LANGUAGE)</string>` (проверено — `apps/ios/Client/Info.plist:6-7`). `DEVELOPMENT_LANGUAGE` — это **build setting**, а не проекция `developmentRegion`; по умолчанию Xcode подставляет `en`. Без этой строки собранный plist останется английским, даже если `.pbxproj` скажет `developmentRegion = ru`.
- **Создать** `apps/ios/Branding/ru.lproj/Localizable.strings` со **строго** таким содержимым:
  ```
  /* Маркер русской локализации бандла.
     Интерфейс написан кириллицей прямо в коде и НЕ проходит через NSLocalizedString.
     Этот файл существует ради одного: чтобы .app содержал ru.lproj и iOS резолвила
     Locale.current как ru_*, а не en_*. Ключ ниже намеренно не используется в коде. */
  "alistore.bundle.language" = "ru";
  ```
  Почему `Branding/`: этот каталог уже перечислен в `sources` **всех четырёх** таргетов (`project.yml`, targets AliStoreClient/Staff/Courier/POS). Один файл → четыре бандла. XcodeGen автоматически превращает каталог `*.lproj` в variant group и кладёт его в Copy Resources.
  Если после `ios:generate` `.lproj` не появился в собранном бандле хотя бы одного приложения — **не подбирать настройки наугад**: положить по копии в `Client/Resources/ru.lproj/`, `Staff/ru.lproj/`, `Courier/ru.lproj/`, `POS/ru.lproj/` и записать в коммит, что общий вариант не сработал.
- `apps/ios/AliStoreNative.xcodeproj/project.pbxproj:811-816` — **не трогать руками.** Это генерируемый артефакт (он же закоммичен: `git ls-files` его видит). После правки `project.yml` выполнить `npm run ios:generate` и закоммитить получившийся диф `.pbxproj` вместе с `project.yml`.

**Что произойдёт с уже захардкоженными кириллическими строками:** ничего. Они не проходят через `NSLocalizedString`, их никто не ищет в `.strings`, они рендерятся как есть. Локализация бандла меняет **только** три вещи: (а) значение `Locale.current`, а через него `.formatted(...)`; (б) язык строк системных фреймворков (`.searchable` placeholder на `Client/…:5761`, дефолтные подписи 15 `ContentUnavailableView`, кнопки алертов, `URLError.localizedDescription`); (в) `preferredLocalizations`. Ни один литерал в Swift-файлах трогать не нужно и **нельзя** в этом срезе.

**Переиспользовать:** `apps/ios/Client/Info.plist:6-7` (`CFBundleDevelopmentRegion = $(DEVELOPMENT_LANGUAGE)`) — механизм уже правильный, ему просто не давали правильного значения. Эталон обращения с генерируемым проектом — `package.json:21` (`ios:generate`).

**Риск регрессии:**
1. **Даты в UI поедут** с `Jul 21, 2026 at 2:30 PM` на `21.07.2026, 14:30`. Это цель, но 6 UI-тестов сравнивают строки — прогнать `npm run ios:ui` и проверить, не ассертит ли какой-то тест дату/цену буквально.
2. **`ru_RU` ≠ `ru_KG`.** Замерено: на устройстве с регионом Россия `109900.formatted(.currency(code:"KGS"))` даст `109 900 KGS`, а не `109 900 сом`. Локализация бандла даёт **язык**, регион остаётся пользовательский. Это не блокирует срез, но именно поэтому Срез 4 прибивает локаль форматтера денег гвоздём, а не полагается на `Locale.current`.
3. Скриншоты App Store (`apps/ios/store/*-metadata.json`, наборы Client 10+10 / Staff 4+4 / Courier 3+3 / POS 3+3) сняты на английской локали в местах с датами. Пересъёмка — в конце, одним прогоном после Среза 9, не здесь.
4. Ширина текста системных элементов вырастет (русский длиннее английского) — проверить нижнюю таб-панель и тулбары.

**НЕ делать в этом срезе:** не менять ни одного `Text(...)` в Swift; не вводить `NSLocalizedString`; не добавлять второй язык (кыргызский) — это отдельный продуктовый разговор; не трогать форматтеры денег и дат (Срезы 3 и 4); не пересобирать скриншоты стора.

---

### Срез 2 — OTP: код можно запросить повторно

**Зависит от:** ничего (можно и параллельно со Срезом 1). Идёт вторым, потому что это единственная находка, из которой у покупателя **нет выхода**: SMS не дошла или код протух — приложение приходится убивать.

**Серверные факты, под которые чиним:** `apps/api/src/auth/auth.service.ts:26` — `OTP_TTL_MS = 5 * 60 * 1000`; `apps/api/src/auth/auth.controller.ts:31` — троттлинг 3 запроса в минуту. Значит: таймер обратного отсчёта до повторной отправки — **60 секунд** (чтобы физически нельзя было упереться в 429), а подсказка о протухании — на 5 минут.

**Acceptance:** UI-тест в `apps/ios/UITests/Client/AliStoreClientUITests.swift` (гонять `npm run ios:ui`, в CI не попадёт — это осознанное ограничение репозитория):
```swift
func testOTPScreenOffersResendAndReturnToPhoneEntry() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing-signed-out"]
    app.launch()
    app.textFields["client-phone"].tap()
    app.textFields["client-phone"].typeText("700123456")
    app.buttons["client-request-otp"].tap()
    XCTAssertTrue(app.textFields["client-otp"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["client-otp-resend"].exists)          // кнопка есть
    XCTAssertFalse(app.buttons["client-otp-resend"].isEnabled)      // и заблокирована таймером
    XCTAssertTrue(app.buttons["client-change-phone"].exists)        // и есть путь назад
}
```
Дополнительно — ручная проверка через MCP `xcodebuild`: `build_run_sim` → `snapshot_ui` экрана входа после запроса кода; на снимке обязаны быть три доступных элемента: поле кода, «Изменить номер», «Отправить код повторно (0:59)».

**Файлы** (`apps/ios/Client/AliStoreClientApp.swift`, структура `ClientLoginView`, строки 272–376):

- `:277` `@State private var requested = false` → оставить, но добавить рядом два состояния:
  ```swift
  @State private var resendAvailableAt: Date?
  @State private var now = Date()
  ```
- `:330` `requested = await auth.requestOTP(phone: normalizedPhone)` → после успеха взводить таймер:
  ```swift
  let ok = await auth.requestOTP(phone: normalizedPhone)
  requested = ok
  if ok { resendAvailableAt = Date().addingTimeInterval(60) }
  ```
- После блока поля кода (после `:346`, там где заканчивается `if requested { … }` с `devCode`) — добавить **две** кнопки:
  1. `client-otp-resend`, `.disabled(secondsLeft > 0 || auth.isLoading)`, подпись `secondsLeft > 0 ? "Отправить код повторно через \(secondsLeft) с" : "Отправить код повторно"`, действие — тот же `auth.requestOTP` + сброс `code = ""` + перевзвод таймера. Высота `minHeight: 44`.
  2. `client-change-phone`, подпись «Изменить номер», действие — `requested = false; code = ""; resendAvailableAt = nil; auth.errorMessage = nil`. Высота `minHeight: 44`. Это и есть выход из тупика: WCAG 2.2.1 требует механизма продлить/перезапустить процесс с ограничением по времени.
- Тик таймера: `.onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }`, а `secondsLeft` — вычисляемое `max(0, Int(resendAvailableAt?.timeIntervalSince(now) ?? 0))`.
- `:362` `Text(error).font(ClientTheme.body(12)).foregroundStyle(.red)` → добавить `.accessibilityIdentifier("client-login-error")` (пригодится Срезу 6; сам текст ошибки не трогать).

**Переиспользовать:** `Shared/CustomerAuthStore.swift` — метод `requestOTP` уже возвращает `Bool`, дополнительный API не нужен. Идентификаторы называть в существующем стиле `client-*` (`:301`, `:311`, `:341`, `:352`). Поле кода **не трогать**: `.keyboardType(.numberPad)` + `.textContentType(.oneTimeCode)` (`:315-316`) — рабочая автоподстановка из SMS, ломать её нельзя.

**Риск регрессии:** `Timer.publish` тикает каждую секунду и перерисовывает экран входа — на этом экране нет тяжёлых вью, но убедиться, что таймер живёт только пока `requested == true` (иначе фоновый тик на всех запусках). Существующие UI-тесты `testShowsPrototypeLoginShellWhenSignedOut` и `testGuestShellUsesPrototypeNavigation` (`UITests/Client/…:8,20`) ассертят кнопку «Продолжить как гость →» — новые кнопки не должны её вытеснить за пределы экрана; `ScrollView` есть (`:281`), но `.frame(minHeight: 700)` на `:369` может дать двойной скролл.

**НЕ делать в этом срезе:** не менять серверный TTL и лимит; не добавлять «войти по паролю»; не трогать Face ID-ветку (`:348-358`); не чинить размеры целей на этом экране (Срез 9).

---

### Срез 3 — Время, которое уходит на сервер, перестаёт зависеть от календаря покупателя

**Зависит от:** ничего. Ставлю третьим: это дефект **данных**, а не оформления — курьер получает строку интервала, собранную форматтером без локали.

**Суть.** `Client/AliStoreClientApp.swift:1969-1972`:
```swift
private func slotLabel(_ slot: DeliverySlot) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm"
    return "\(formatter.string(from: slot.startsAt))–\(formatter.string(from: slot.endsAt))"
}
```
Ни `locale`, ни `calendar`, ни `timeZone`. Результат этой же функции уходит в тело `CreateOrderRequest` полем `deliverySlot` (`:1839-1841`, поле объявлено `Shared/Models.swift:878`) и попадает курьеру. При календаре Хиджры или арабо-индийских цифрах на устройстве покупателя интервал станет нечитаемым. Эта же функция используется и для показа (`:1598`, `:1700`) — то есть одна строка обслуживает и UI, и протокол, что и есть корень.

**Acceptance:** новый файл `apps/ios/Tests/FormattersTests.swift`, гоняется `npm run ios:test`:
```swift
func testWireTimeIsStableUnderExoticCalendars() {
    let start = Date(timeIntervalSince1970: 1_784_000_000)
    let end = start.addingTimeInterval(7200)
    XCTAssertEqual(AliStoreFormat.wireTimeRange(start, end),
                   AliStoreFormat.wireTimeRange(start, end))            // детерминизм
    XCTAssertTrue(AliStoreFormat.wireTimeRange(start, end)
        .allSatisfy { "0123456789:–".contains($0) })                    // только латинские цифры
    XCTAssertEqual(AliStoreFormat.wireTimeRange(start, end).count, 11)  // HH:mm–HH:mm
}
func testWireDayIsISO() {
    XCTAssertEqual(AliStoreFormat.wireDay(Date(timeIntervalSince1970: 1_784_000_000)).count, 10)
}
```
Тест RED пишется **до** правки — сейчас `AliStoreFormat` не существует, он не соберётся; это и есть красный.

**Файлы:**

- **Создать** `apps/ios/Shared/Formatters.swift` (таргет `AliStoreCore`, доступен всем четырём приложениям):
  ```swift
  public enum AliStoreFormat {
      /// Форматтер для строк, которые уезжают на сервер или в чужой интерфейс.
      /// Гвозди: POSIX-локаль, григорианский календарь, UTC. Не зависит от настроек устройства.
      private static let wire: DateFormatter = {
          let f = DateFormatter()
          f.calendar = Calendar(identifier: .gregorian)
          f.locale = Locale(identifier: "en_US_POSIX")
          f.timeZone = TimeZone(secondsFromGMT: 0)
          return f
      }()
      public static func wireTimeRange(_ start: Date, _ end: Date) -> String { … "HH:mm" … }
      public static func wireDay(_ date: Date) -> String { … "yyyy-MM-dd" … }
  }
  ```
  (`DateFormatter` не `Sendable`; обращаться к нему только с `@MainActor` вызовов, либо создавать экземпляр внутри функции — выбрать второе, если Swift 6 strict concurrency ругнётся на статик; это решается компилятором, а не догадкой.)
- `Client/AliStoreClientApp.swift:1969-1972` → тело `slotLabel` заменить на `AliStoreFormat.wireTimeRange(slot.startsAt, slot.endsAt)`.
- `Client/AliStoreClientApp.swift:3937-3938` — тот же дефект в `exportMyData`: `DateFormatter()` + `"yyyy-MM-dd"` без локали, результат попадает в **имя файла** выгрузки персональных данных. Заменить на `AliStoreFormat.wireDay(Date())`.
- `Client/Features/SupportChatView.swift:215-216` — `DateFormatter` + `"HH:mm"` **только для показа**. Здесь наоборот: убрать ручной формат и отдать системе — `date.formatted(date: .omitted, time: .shortened)`. После Среза 1 это даст корректное русское время.
- `Staff/AliStoreStaffApp.swift:1457-1461` — **не трогать содержимое**, это эталон (`en_US_POSIX` + григорианский + UTC). Но переписать тело на вызов `AliStoreFormat.wireDay(start)`, чтобы источник правды стал один. Поведение обязано остаться байт-в-байт — на это есть тест выше.

**Переиспользовать:** `Staff/AliStoreStaffApp.swift:1457-1461` — план не изобретает форматтер, а поднимает существующий правильный в `Shared/`. `Shared/APIClient.swift:53-58` — пример того, что дата-логика в этом репозитории уже живёт в `AliStoreCore`.

**Риск регрессии:** `slotLabel` показывается пользователю (`:1598`, `:1700`) — после правки интервал станет UTC-24ч. Если слоты от API приходят уже локальными для Бишкека, покупатель увидит сдвиг на 6 часов. **Обязательно проверить до правки**, в какой зоне сервер отдаёт `DeliverySlot.startsAt` (`apps/api`, эндпоинт слотов), и если сдвиг реален — развести две функции: `wireTimeRange` (UTC, в тело запроса) и `displayTimeRange` (`Asia/Bishkek`, на экран). Не угадывать: посмотреть ответ API.

**НЕ делать в этом срезе:** не трогать декодер дат в `APIClient` (`:50-62`) — он корректен; не переводить остальные 20+ мест `date.formatted(...)` — они и должны следовать локали пользователя; не заводить формат денег (Срез 4).

---

### Срез 4 — Одна функция для суммы во всех четырёх приложениях

**Зависит от:** Среза 1 (без русской локали `.currency(code:"KGS")` не даёт «сом») и Среза 3 (файл `Shared/Formatters.swift` уже создан).

**Замер, который делает решение однозначным** (прогон на этой машине):

| локаль | `109900.formatted(.currency(code:"KGS").precision(.fractionLength(0)))` |
|---|---|
| `ru_KG` | `109 900 сом` ✅ |
| `ky_KG` | `109 900 сом` ✅ |
| `ru_RU` | `109 900 KGS` ❌ |
| `en_KG` | `KGS 109 900` ❌ |
| `en_US` | `KGS 109,900` ❌ |

Отсюда правило: **локаль форматтера денег прибивается к `ru_KG`, а не берётся из `Locale.current`.** Цены в Кыргызстане всегда в сомах, и покупатель с российским регионом на телефоне не должен получить `109 900 KGS`.

**Acceptance:** дописать в `apps/ios/Tests/FormattersTests.swift`:
```swift
func testMoneyIsAlwaysGroupedSomWithoutFractions() {
    XCTAssertEqual(AliStoreFormat.som(109900), "109 900 сом")
    XCTAssertEqual(AliStoreFormat.som(0), "0 сом")
    XCTAssertEqual(AliStoreFormat.som(-4500), "-4 500 сом")
    XCTAssertFalse(AliStoreFormat.som(109900).contains("KGS"))
    XCTAssertFalse(AliStoreFormat.som(109900).contains(","))
}
```
⚠️ Разделитель групп в CLDR `ru` — **неразрывный пробел U+00A0**, а не обычный. Сравнение с литералом `"109 900 сом"`, набранным обычным пробелом, **упадёт**. Сначала запустить тест, прочитать реальный вывод в отчёте, и вписать в ожидание ровно тот символ, что вернулся (или сравнивать через нормализацию — но проще вписать точный литерал и оставить комментарий, что там NBSP).

Плюс статический валидатор (см. ниже) — он и есть защита от возврата долга.

**Файлы:**

- `apps/ios/Shared/Formatters.swift` — добавить в `AliStoreFormat`:
  ```swift
  /// Единственный способ напечатать сумму. Локаль прибита: цены всегда в сомах,
  /// регион устройства на это влиять не должен (ru_RU дал бы «109 900 KGS»).
  public static func som(_ amount: Int) -> String {
      amount.formatted(.currency(code: "KGS")
          .precision(.fractionLength(0))
          .locale(Locale(identifier: "ru_KG")))
  }
  ```
- **Заменить на `AliStoreFormat.som(...)` — точный список (23 места):**
  - `POS/POSSaleView.swift:97` `Text("\(product.price) сом")` → `Text(AliStoreFormat.som(product.price))`
  - `POS/POSSaleView.swift:135` `Text("\(product.price * (cart[product.id] ?? 0))")` — **сейчас вообще без валюты** → `Text(AliStoreFormat.som(product.price * (cart[product.id] ?? 0)))`
  - `POS/POSSaleView.swift:157` `Text("\(total) сом")` — самое крупное число в кассе (`.title3.weight(.black)`), сейчас `109900 сом` без разделителей → `Text(AliStoreFormat.som(total))`
  - `POS/POSSaleView.swift:167` `Label("Оплатить \(total) сом", …)` → `Label("Оплатить \(AliStoreFormat.som(total))", …)`
  - `POS/POSSaleView.swift:250`, `:256`, `:288` — суммы внутри текста чека/сообщения → то же
  - `POS/POSOperationsView.swift:106`, `:121`, `:123`, `:125`, `:215`, `:416`
  - `Courier/CourierOperationsView.swift:316`, `:342`, `:533`
  - `Staff/AliStoreStaffApp.swift:1201` `Text("\(item.qty) × \(item.price.formatted()) сом")` → `Text("\(item.qty) × \(AliStoreFormat.som(item.price))")`
  - `Client/AliStoreClientApp.swift:3064` (ручная группировка + `" сом"`) → `AliStoreFormat.som(item.price)`
  - `Client/Features/InstallmentView.swift:246` — тело функции `installmentSom` заменить на `AliStoreFormat.som(value)`; саму функцию **удалить** после того, как её единственный вызов (`:228`) переведён, а строки `:239-247` (ручная группировка) убрать
  - `Client/Features/ReferralView.swift:141` — вспомогательная группировка **без** « сом» (бонусы, счётчики): оставить, но переименовать комментарий; это не деньги
  - Все `~24` вызова `.formatted(.currency(code: "KGS"))` в `Client/AliStoreClientApp.swift` (`726, 768, 811, 1497, 1533, 1546, 1547, 1590, 1623, 1661, 1689, 1705, 1707, 1710, 1713, 1715, 2044, 2167, 2603, 2905, 3046, 3431, 5964, 6036`) → `AliStoreFormat.som(...)`. Они не «сломаны», но дают дробную часть `,00` и зависят от региона устройства — приводим к одному виду.
- **Не трогать:** `Staff/AliStoreStaffApp.swift:855`, `:1156`, `:1605` — это эталон; переписать их **тело** на `AliStoreFormat.som(amount)` (одна строка), сигнатуру и все вызовы оставить как есть.
- `Client/AliStoreClientApp.swift:5872` `Text("от 115 000 сом · рассрочка 0%")`, `:1581` `trailing: "от 200 сом"`, `Staff/StaffScannerView.swift:189` `"109 900 сом"`, `Client/…:2745` `valueLabel: "0 сом"`, `Client/Features/StoriesViewer.swift:28` `"Бесплатно от 5 000 сом"` — **литералы, не форматирование**. В этом срезе не трогать, но занести в `BACKLOG.md` строкой «захардкоженные цены в маркетинговых блоках витрины» — это соседняя проблема (выдуманные данные), у неё уже есть гейт `scripts/check-no-fixtures.mjs`.
- `Client/AliStoreClientApp.swift:6038` `"или \(Int(displayProduct.price / 12).formatted(.number.grouping(.never))) сом × 12 мес"` — `.grouping(.never)` даёт `9158 сом` слитно. → `"или \(AliStoreFormat.som(displayProduct.price / 12)) × 12 мес"`.

- **Создать** `scripts/validate-ios-a11y-contract.mjs` по образцу `scripts/validate-deeplink-contract.mjs` (тот же каркас: `read`, `failures[]`, `process.exit(1)`), с правилами:
  1. `apps/ios/project.yml` содержит `developmentLanguage: ru` и `DEVELOPMENT_LANGUAGE: ru`;
  2. файл `apps/ios/Branding/ru.lproj/Localizable.strings` существует;
  3. ни в одном `.swift` под `apps/ios/{Client,Staff,POS,Courier,Shared}` нет регулярки `Text\("\\\(.*\) сом"\)` и `\.formatted\(\.currency\(code: "KGS"\)\)` вне `Shared/Formatters.swift`;
  4. `new DateFormatter()` в `.swift` вне `Shared/Formatters.swift` — запрещён;
  5. счётчик `\.font\(\.system\(size:` не превышает записанного потолка (ratchet-файл `scripts/ios-a11y-baseline.json` по образцу `scripts/no-fixtures-baseline.json`) — потолок опускается Срезом 8.
  Прописать в `package.json` как `"ios:contract": "node scripts/validate-ios-a11y-contract.mjs"`.
  **В `scripts/mvp-verify.mjs` не добавлять** — там сознательно нет мобильных шагов (комментарий в файле, строки про «no mobile step here»); а вот запускать вручную и упоминать в описании коммита — обязательно.

**Переиспользовать:** `Staff/AliStoreStaffApp.swift:855` — эталон формата; `scripts/validate-deeplink-contract.mjs` — эталон статического валидатора; `scripts/no-fixtures-baseline.json` — эталон ratchet-файла.

**Риск регрессии:** (1) `Int` умножения `price * qty` могут переполниться? Нет — суммы в тыйынах не хранятся, значения порядка 10⁵. (2) Ширина строки вырастет: `109900 сом` (10 симв.) → `109 900 сом` (11). В кассе `POSSaleView:157` шрифт `.title3.weight(.black)` — проверить, не переносится ли «Итого» в две строки на iPhone SE. (3) Тесты `UITests/POS/AliStorePOSUITests.swift` и `UITests/Courier/…` могут ассертить суммы буквально — прогнать `npm run ios:ui`. (4) NBSP в строке ломает наивный `XCTAssertEqual` в существующих тестах — см. предупреждение в acceptance.

**НЕ делать в этом срезе:** не переводить `ReferralView.swift:141` (бонусы — не деньги); не чинить литеральные цены в маркетинге; не менять шрифты и размеры (Срезы 7–8).

---

### Срез 5 — Карточка товара: одна остановка VoiceOver вместо пяти

**Зависит от:** Среза 4 (текст цены в карточке уже в финальном виде — иначе метку придётся переписывать дважды).

**Масштаб:** `NativeProductCard` (`Client/AliStoreClientApp.swift:5952-5975`) используется в каталоге, на главной, в избранном (`:6009`) и в блоке «похожие». В сетке из 20 товаров это 100 остановок свайпом, и все двадцать кнопок «В корзину» читаются одинаково.

**Acceptance:** UI-тест в `UITests/Client/AliStoreClientUITests.swift` (`npm run ios:ui`):
```swift
func testProductCardIsOneAccessibilityElementWithProductScopedActions() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest"]
    app.launch()
    app.buttons["Каталог"].tap()
    // ни одной безымянной «В корзину»: у каждой кнопки в метке есть товар
    XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label == 'В корзину'")).count, 0)
    let card = app.otherElements.matching(identifier: "client-product-card").firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 10))
    XCTAssertTrue(card.label.contains("сом"))       // цена входит в единую метку
}
```
Плюс глазами: VoiceOver на симуляторе, свайп по сетке — на карточку приходится одна остановка и два действия в роторе.

**Файлы** (`Client/AliStoreClientApp.swift`):

- `:5957-5974` (тело `NativeProductCard.body`) — на корневой `VStack` навесить:
  ```swift
  .accessibilityElement(children: .combine)
  .accessibilityIdentifier("client-product-card")
  .accessibilityLabel(Text(voiceOverSummary))   // имя + цена + наличие
  ```
  где `voiceOverSummary` — приватное вычисляемое: `"\(product.name). \(AliStoreFormat.som(product.price)). \(availabilityText)"`. Наличие уже собирается на `:5965-5966` — вынести в приватное свойство и переиспользовать в обоих местах (DRY).
- `:5961` — кнопка избранного **без метки**. Добавить:
  ```swift
  .accessibilityLabel(favorites.contains(product.id)
      ? "Убрать \(product.name) из избранного"
      : "Добавить \(product.name) в избранное")
  ```
  Кнопка уже 44×44 — размер не трогать.
- `:5967` — **функциональный дефект**, чинится здесь, а не в Срезе 9. Сейчас:
  ```swift
  Button { cart[product.id] = … } label: { Text(product.availableUnits > 0 ? "В корзину" : "Уведомить") … }.disabled(product.availableUnits == 0)
  ```
  То есть при `availableUnits == 0` кнопка называется «Уведомить» и одновременно `.disabled` — обещает действие, которого не делает. При этом `Client/Features/WaitlistView.swift` в проекте **есть** (156 строк). Заменить на две ветки:
  - `availableUnits > 0` → кнопка «В корзину», `.accessibilityLabel("В корзину, \(product.name)")`;
  - `availableUnits == 0` → **включённая** кнопка «Сообщить о поступлении», открывающая `WaitlistView` (`NavigationLink` или `.sheet` — как открываются остальные фичи в этом файле; посмотреть, как вызывается `WaitlistView` сейчас, и повторить), `.accessibilityLabel("Сообщить о поступлении, \(product.name)")`.
  Если `WaitlistView` сейчас нигде не вызывается и требует данных, которых у карточки нет — **не изобретать поток**: тогда сделать кнопку `.disabled` с честной подписью «Нет в наличии» и завести в `BACKLOG.md` строку про подключение листа ожидания. Выбор зафиксировать в теле коммита.
- Три «зеркала» той же карточки — привести к тому же виду:
  - `:726` (карточка на главной/в подборке), `:768` (крупная карточка), `:811` (строка сравнения) — на каждую навесить `.accessibilityElement(children: .combine)` + метку; кнопкам добавить имя товара.
  - `:783` (`Text(product.availableUnits > 0 ? "В корзину" : "Нет в наличии")` в сравнении) — здесь подпись уже честная, только добавить `.accessibilityLabel("В корзину, \(product.name)")`.

**Переиспользовать:** `Client/AliStoreClientApp.swift:797` (`.accessibilityLabel("Убрать \(product.name) из сравнения")`), `:1510` и `:1522` (`.accessibilityLabel("Уменьшить количество \(product.name)")`) — в файле **уже есть** правильный паттерн «действие + название товара»; распространяем его, а не придумываем новый. `Client/AliStoreClientApp.swift:1539` (`.accessibilityElement(children: .contain)`) — единственное существующее группирование; в карточке нужен `.combine`, а не `.contain` (нам нужна одна остановка, а не контейнер).

**Риск регрессии:** `.accessibilityElement(children: .combine)` **поглощает** дочерние элементы — существующие UI-тесты, которые ищут `app.buttons["В корзину"]` или `app.staticTexts[<название товара>]` внутри сетки, перестанут находить цель. Прогнать весь `npm run ios:ui` и чинить тесты по факту падения, а не превентивно. Второй риск: `.combine` объединяет и action-элементы — если после правки кнопки «В корзину»/«избранное» пропали из ротора, использовать `.accessibilityElement(children: .contain)` на карточке + явные метки на кнопках; выбор проверять **VoiceOver'ом на симуляторе**, а не рассуждением.

**НЕ делать в этом срезе:** не трогать размеры (`frame(height: 38)` на `:5967` — Срез 9 его пропускает, он остаётся здесь как `minHeight: 44`); не добавлять `accessibilityCustomAction`; не трогать `:6021-6028` (кнопка избранного на детальной — эталон 44×44 с подложкой, ломать нельзя).

---

### Срез 6 — Приложение начинает разговаривать: объявления, reduce-motion, сторис

**Зависит от:** Среза 2 (финальные строки ошибок входа) и Среза 5 (структура карточки устоялась).

**Что сломано:** ноль вхождений `UIAccessibility.post` / `AccessibilityNotification` / `accessibilityFocus` / `accessibilityReduceMotion` во всём `apps/ios` (проверено грепом). Слепой покупатель нажимает «Применить промокод» — ничего не происходит; ошибка появляется визуально, VoiceOver молчит.

**Acceptance:**
1. Юнит-тест невозможен, XCUITest объявления не читает. Поэтому: статический валидатор (`scripts/validate-ios-a11y-contract.mjs`, создан в Срезе 4) получает правило — каждый из шести файлов `Client/AliStoreClientApp.swift`, `POS/POSSaleView.swift`, `Client/DesignSystem/Design3Primitives.swift`, `Client/Features/StoriesViewer.swift` обязан содержать `A11y.announce(` / `accessibilityReduceMotion` (точный список — ниже), а `repeatForever` в `apps/ios` не должен встречаться вне строки, где рядом стоит проверка `reduceMotion`.
2. Проверка глазами (обязательна, см. финальный раздел): VoiceOver включён, шесть сценариев из «Файлов» ниже — каждый обязан быть **произнесён**.
3. Reduce Motion включён в настройках симулятора → шиммер `Skeleton` не анимируется, сторис не листаются сами.

**Файлы:**

- **Создать** `apps/ios/Shared/Accessibility.swift` (таргет `AliStoreCore`):
  ```swift
  @MainActor public enum A11y {
      /// Произносит сообщение поверх текущего фокуса. Для ошибок и результатов действий.
      public static func announce(_ message: String) {
          AccessibilityNotification.Announcement(message).post()
      }
      /// Сообщает о смене экрана и переводит фокус.
      public static func screenChanged(_ message: String) {
          AccessibilityNotification.ScreenChanged().post()
          announce(message)
      }
  }
  ```
  (`AccessibilityNotification` доступен с iOS 17 — deployment target проекта ровно 17.0, `project.yml:5-6`.)
- Точки вызова (везде — сразу после присваивания состояния, не в `body`):
  - `Client/AliStoreClientApp.swift:1965` `promoError = error.localizedDescription` → следом `A11y.announce("Промокод не применён. \(error.localizedDescription)")`. Показ на `:1675`.
  - `Client/AliStoreClientApp.swift:1873`, `:1876` `errorMessage = error.localizedDescription` (оформление заказа) → `A11y.announce("Заказ не оформлен. \(...)")`. Показ на `:1733`.
  - `Client/AliStoreClientApp.swift` — в `CustomerAuthStore` ошибка входа отображается на `:362`; объявление ставить там, где `auth.errorMessage` присваивается (`Shared/CustomerAuthStore.swift`, найти присваивание `errorMessage`).
  - `Client/AliStoreClientApp.swift:1864` `completedOrder = order` — **смена экрана** → `A11y.screenChanged("Заказ оформлен. Номер …")`. (`:1446` — это UI-фикстура, там же для консистентности.)
  - `POS/POSSaleView.swift:201`, `:222`, `:273`, `:278` `errorMessage = error.localizedDescription` → `A11y.announce(...)`. Показ на `:40`.
  - `POS/POSSaleView.swift:250`, `:288` `message = "POS-4102 · оплачено …"` — успех оплаты, кассир должен услышать → `A11y.announce(message)`.
- **Бесконечная анимация без паузы — нарушение WCAG 2.2.2.** `Client/DesignSystem/Design3Primitives.swift:151-169` (`Skeleton`), строка с `.repeatForever(autoreverses: false)`:
  ```swift
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  …
  .onAppear {
      guard !reduceMotion else { return }        // ← новое
      withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) { animate = true }
  }
  ```
- **Сторис** (`Client/Features/StoriesViewer.swift`):
  - `:43` `private let storyDuration: Double = 5` и `:149-159` `runTimer()` — автолистание каждые 5 с без возможности остановить. Добавить `@Environment(\.accessibilityReduceMotion)` и проверку `UIAccessibility.isVoiceOverRunning`; при любом из них — **не** запускать таймер (`runTimer` возвращается сразу), листание только по кнопкам. Плюс явная кнопка «Пауза/Продолжить» в `header` (`:126-141`) — WCAG 2.2.2 требует механизм паузы для любого автообновления дольше 5 секунд.
  - `:118-123` (три `Color.clear.contentShape(Rectangle()).onTapGesture`) — для VoiceOver этих зон **не существует**: `onTapGesture` на прозрачном `Color` не создаёт accessibility-элемента. Заменить каждую на `Button { … } label: { Color.clear.contentShape(Rectangle()) }.buttonStyle(.plain)` с `.accessibilityLabel("Предыдущая история")` / `"Следующая история"`. Левая зона — `back()`, две правые — `advance()` (поведение сохранить).
  - `:129-133` — кнопка закрытия 32×32 → `minWidth/minHeight: 44` (это единственное пересечение с Срезом 9; чиним здесь, Срез 9 её пропускает).
  - `:105` `progressBars` — добавить `.accessibilityHidden(true)`: это декоративный индикатор, его пять сегментов не нужны в роторе; вместо них на контейнер сторис повесить `.accessibilityValue("История \(index + 1) из \(pages.count)")`.

**Переиспользовать:** `Shared/QuickUnlock.swift:377` (`.accessibilityHidden(true)`) — в проекте уже есть практика скрывать декор; `Client/AliStoreClientApp.swift:1539` — существующее группирование; `Shared/APIClient.swift:3-18` (`APIError.errorDescription`) — русские тексты ошибок уже готовы, объявлять надо именно их, не выдумывая новых формулировок.

**Риск регрессии:** (1) `AccessibilityNotification.…post()` требует главного актора — при Swift 6 strict concurrency (`SWIFT_VERSION: "6.0"`, `project.yml:10`) вызов из `catch` внутри `Task` может не собраться; лечится `@MainActor` на функции и `await MainActor.run` на месте вызова — смотреть на ошибку компилятора, не угадывать. (2) Отключение автолистания сторис ломает `testClientPrototypeVisualEvidencePart*` (`apps/ios/scripts/visual-capture.sh` снимает 3 части по 10 PNG на iPhone и iPad, счётчик жёстко сверяется с `requiredPngCount` из `store/client-metadata.json`) — если визуальный прогон опирался на самолистание, снимки съедут; прогнать `npm run ios:visual` и починить сценарий. (3) Слишком частые `announce` создают «болтливость» — не объявлять успешные загрузки списков, только ошибки и результаты действий пользователя.

**НЕ делать в этом срезе:** не трогать цвета и шрифты; не добавлять `accessibilityCustomActions`; не переписывать тексты ошибок; не трогать `Design3Primitives` кроме `Skeleton`.

---

### Срез 7 — Контраст: где виноват токен, а где стекло

**Зависит от:** Срезов 1–6 (косметика идёт после функциональных дефектов). Открывает «визуальный блок» 7→8→9, после которого пересъёмка снимков делается один раз.

**Разбор, посчитанный по WCAG (относительная яркость sRGB), а не на глаз:**

| токен | на `screen` #201B17 | на `surface` #2A231D | на стекле ≈#414141 | норма |
|---|---|---|---|---|
| `textMuted` #A79C92 | 6.35 ✅ | 5.76 ✅ | **3.80 ❌** | 4.5 |
| `textSubtle` #8A7F76 | 4.37 ❌ | **3.96 ❌** | **2.61 ❌** | 4.5 |
| `textFaint` #6E645C | **2.96 ❌** | **2.68 ❌** | **1.77 ❌** | 4.5 |
| `hairline` #463C31 | **1.59 ❌** | **1.44 ❌** | **1.16 ❌** | 3.0 |

Отсюда два независимых корня, и лечить их надо по-разному:

**Корень A — стекло.** `.ultraThinMaterial` в тёмной теме композитится примерно в нейтральный **#414141** (число получено обратным счётом из трёх измеренных аудитом значений — 3.80 / 2.62 / 1.77 — и совпало до сотых на всех трёх токенах, значит модель верна). `textMuted` проваливает норму **только** здесь. Значит `textMuted` менять не надо — надо **притемнить композит стекла**. Расчёт слоя тонировки поверх материала:

| `glassTint` | композит | `textMuted` | `textBright` | белый |
|---|---|---|---|---|
| текущий `white 0.05` | #414141 | 3.80 ❌ | 7.6 | 10.9 |
| `Design3.frame 0.25` | #373635 | 4.49 | 7.84 | 12.06 |
| **`Design3.frame 0.30`** | **#353432** | **4.63 ✅** | **8.09 ✅** | **12.44 ✅** |
| `Design3.frame 0.40` | #312F2D | 4.96 | 8.67 | 13.33 |

30 % тёплой тонировки поверх материала — стекло остаётся стеклом (материал по-прежнему размывает фон), но композит перестаёт быть непредсказуемо светлым.

**Корень B — токены.** `textSubtle`, `textFaint` и `hairline` проваливают норму даже на **непрозрачных** поверхностях. Это долг палитры, стекло тут ни при чём.

Честная неприятная правда, которую надо записать в код комментарием: **на таком тёмном тёплом фоне пятиступенчатая текстовая рампа при AA невозможна.** Значения, вытянутые до 4.5:1 на всех четырёх фонах, сходятся: `textSubtle` → #A6998E, `textFaint` → #A8988C, а `textMuted` = #A79C92. Три токена становятся одним цветом. Поэтому:

**Файлы** (`apps/ios/Shared/Design3.swift`):

- `:32` `hairline = hex(0x463C31)` → `hex(0x8E7A63)` — 4.16 / 3.77 / 3.06 / 3.03 на screen/surface/raised/glass. **Но:** `hairline` сейчас работает в двух ролях — как рамка (`Client/…:5974`, `:1550`, `:6001` и ещё ~30 мест) **и как заливка** (`Client/…:1524` подложка степпера, `:1750` фон неактивной кнопки «Далее»). Одним значением обе роли не закрыть. Развести:
  - `hairline` — только рамка, новое значение #8E7A63 (норма 3:1 для границ UI-компонентов, SC 1.4.11);
  - **новый** `public static let controlFill = hex(0x3A322B)` (= текущий `surfaceRaised`) — заливка степпера и неактивной кнопки. На нём `textMuted` даёт 4.68 ✅.
- `:38` `textSubtle = hex(0x8A7F76)` → `hex(0xA6998E)` (6.23 / 5.65 / 4.59 / 4.54).
- `:39` `textFaint = hex(0x6E645C)` → **удалить как текстовый токен**. Вместо него завести `public static let textDisabled = hex(0x8A7F76)` с комментарием: «используется ТОЛЬКО в неактивных элементах управления; WCAG 1.4.3 выводит их из-под требования 4.5:1, но и там подпись обязана объяснять, почему элемент неактивен». Все текстовые применения `textFaint` (плейсхолдер поиска и др.) перевести на `textSubtle`.
- `:46` `glassTint = Color.white.opacity(0.05)` → `Design3.frame.opacity(0.30)`.
- `:47` `glassTintStrong = Color.white.opacity(0.08)` → `Design3.frame.opacity(0.38)`. Для `.regularMaterial` композит не измерен — **проверить глазами и Accessibility Inspector'ом**, значение при необходимости подобрать; записать замер в коммит.
- `:48` `hairlineGlass = Color.white.opacity(0.12)` — на композите #353432 это ≈ #4A4947, отношение к фону ~1.2 ❌. Поднять до `Color.white.opacity(0.34)` и **перемерить** — расчёт полупрозрачного слоя поверх материала здесь не воспроизводится точно, нужен Accessibility Inspector.
- `Client/AliStoreClientApp.swift:1748` `.foregroundStyle(canAdvance ? .black : Design3.textFaint)` → `Design3.textMuted` (4.68 на `controlFill`).
- `Client/AliStoreClientApp.swift:1750` `.background(canAdvance ? ClientTheme.lime : ClientTheme.line, …)` → `Design3.controlFill`, и добавить `.overlay(RoundedRectangle(cornerRadius: 13).stroke(Design3.hairline))` — заливка `controlFill` даёт к фону всего 1.36, форма неактивной кнопки без рамки не читается (SC 1.4.11).
- `Client/AliStoreClientApp.swift:1524` `.background(ClientTheme.line, …)` → `Design3.controlFill`.
- `Client/AliStoreClientApp.swift:103` `ClientTheme.line = Design3.hairline` — после разведения ролей проверить **каждое** из ~30 вхождений `ClientTheme.line`: рамка → остаётся `hairline`, заливка → `controlFill`. Список получить `grep -n "ClientTheme.line" Client/AliStoreClientApp.swift`.

**Acceptance (автоматизируемо!):** новый `apps/ios/Tests/ContrastTests.swift`, гоняется `npm run ios:test`:
```swift
private func ratio(_ a: Color, _ b: Color) -> Double { /* resolve(in: EnvironmentValues()) → sRGB → WCAG */ }

func testTextTokensMeetAAOnOpaqueSurfaces() {
    for bg in [Design3.screen, Design3.surface, Design3.surfaceRaised, Design3.controlFill] {
        XCTAssertGreaterThanOrEqual(ratio(Design3.textMuted,  bg), 4.5)
        XCTAssertGreaterThanOrEqual(ratio(Design3.textSubtle, bg), 4.5)
        XCTAssertGreaterThanOrEqual(ratio(Design3.textBright, bg), 4.5)
    }
}
func testBordersMeetNonTextMinimum() {
    XCTAssertGreaterThanOrEqual(ratio(Design3.hairline, Design3.screen), 3.0)
    XCTAssertGreaterThanOrEqual(ratio(Design3.hairline, Design3.surface), 3.0)
}
```
`Color.resolve(in:)` доступен с iOS 17 и отдаёт `Color.Resolved` с sRGB-компонентами — значит тест читает **реальные токены**, а не переписанные числа. Стекло этим тестом не покрывается принципиально (`Material` не резолвится в цвет) — для него только замер Accessibility Inspector'ом.

**Переиспользовать:** непрозрачные поверхности рабочих приложений (`POS/POSSaleView.swift` `posSurface()`, `Staff/StaffWorkView.swift:152` `surface`) — там `textMuted` даёт 5.76 и **ничего менять не нужно**; `.glass()` определён в `Client/DesignSystem/Design3Primitives.swift:26-31` и является Client-internal — Staff/POS/Courier до него не дотягиваются, переводить их на стекло **нельзя**.

**Риск регрессии:** (1) Стекло станет заметно темнее — это меняет «фирменный» вид из деки «Клиент App 3.0» (комментарий `Design3.swift:4-13`). Регрессия ловится `npm run ios:visual` (снимает 20 PNG на iPhone + iPad) и сравнением с текущими артефактами. (2) `hairline` #8E7A63 в 30+ местах — рамки станут заметно светлее и «шумнее»; смотреть на карточки каталога в первую очередь. (3) Схлопывание `textSubtle` в `textMuted` убирает визуальную иерархию второго уровня — компенсировать **размером и весом**, а не цветом (это уже Срез 8). (4) `textFaint` удаляется — компилятор покажет все точки использования, ни одну не «заглушить» переименованием без разбора роли.

**НЕ делать в этом срезе:** не менять `Design3.orange` / `lime` / `success` / `danger` (все ≥4.0 как фон под чёрным текстом — 6.79 ✅); не переводить рабочие приложения на `.glass()`; не трогать шрифты и размеры; не менять `Design3.screen` / `surface` / `frame` — от них считается всё остальное.

---

### Срез 8 — Dynamic Type: два типа шрифта, оба ведут себя неверно

**Зависит от:** Среза 7 (цвета зафиксированы, дальше меняем только метрику — так регрессия в снимках атрибутируется однозначно).

**Два разных дефекта:**

*Дефект 1 — `Font.custom(_:size:)`.* `Design3.swift:74-82`: три функции (`heading`, `body`, `mono`) используют `Font.custom(_:size:)`. Такой шрифт масштабируется **относительно `.body`**, то есть подпись 10 pt и заголовок 30 pt растут одинаково (~3.1× на AX5). При этом `frame(height: 38/46/50)` в вызывающем коде фиксированы — текст обрезается.

*Дефект 2 — `.font(.system(size:))`.* 58 вхождений (38 из них в `Client/AliStoreClientApp.swift`), **не масштабируются вовсе**. Итог, который и описан в аудите: слабовидящий увеличивает шрифт ради цены, а введённый им номер телефона (`:302`, 15 pt) и количество в корзине (`:1511`, 13 pt) остаются прежними.

**Файлы:**

- `apps/ios/Shared/Design3.swift:74-82` — добавить третий параметр с **умолчанием**, чтобы ни один из ~200 вызовов не пришлось править:
  ```swift
  /// Сопоставление кегля деки текстовому стилю iOS. Без него Font.custom масштабируется
  /// относительно .body: подпись 10pt и заголовок 30pt растут одинаково.
  public static func textStyle(for size: CGFloat) -> Font.TextStyle {
      switch size {
      case 28...:  return .largeTitle
      case 22..<28: return .title
      case 20..<22: return .title2
      case 17..<20: return .title3
      case 16..<17: return .headline
      case 15..<16: return .body
      case 14..<15: return .callout
      case 13..<14: return .subheadline
      case 12..<13: return .footnote
      case 11..<12: return .caption
      default:      return .caption2
      }
  }
  public static func heading(_ size: CGFloat, _ weight: Font.Weight = .bold,
                             relativeTo style: Font.TextStyle? = nil) -> Font {
      .custom("Manrope-\(styleName(weight))", size: size,
              relativeTo: style ?? textStyle(for: size))
  }
  ```
  То же для `body(_:_:)` (`:77-79`) и `mono(_:_:)` (`:80-82`). Это **однофайловая правка**, чинящая масштабирование всех кастомных шрифтов Client разом.
- 58 вызовов `.font(.system(size:…))` — конвертировать **текстовые** (не иконочные) по механической таблице `size → TextStyle` (та же, что выше): `.font(.system(size: 13, weight: .semibold, design: .monospaced))` → `.font(.system(.subheadline, design: .monospaced).weight(.semibold))`. Приоритет — то, что человек читает и вводит:
  - `Client/…:302` поле телефона (15 pt моно) → `.system(.body, design: .monospaced)`
  - `Client/…:1511` количество в степпере (13 pt моно) → `.system(.footnote, design: .monospaced).weight(.semibold)`
  - `Client/…:6033` бейдж наличия (11 pt моно, `weight: .bold`) → `.system(.caption, design: .monospaced).weight(.bold)`
  - Остальные 35 в `Client/AliStoreClientApp.swift` + `WaitlistView`(2) + `OrderTrackingView`(3) + `SystemStatesView`(1) + `SupportChatView`(3) + `ReferralView`(1) + `StoriesViewer`(2) + `Design3Primitives`(2) + `QuickUnlock`(3) + `StaffLoginView`(1) + `StaffScannerView`(1) + `AliStorePOSApp`(1) — по той же таблице.
  - Вызовы на **SF Symbols внутри иконочных кнопок** (`:2154`, `:5961`, `StoriesViewer:130`) можно оставить фиксированными, но тогда рамку кнопки обязан задавать `@ScaledMetric` (см. следующий пункт), иначе иконка «утонет» в выросшей кнопке. Решение по каждому — на глаз, на AX3.
- Фиксированные высоты, обрезающие текст: `Client/…:5967` (38), `:1745` (50), `:342`/`:355` кнопки входа (50), `Design3Primitives.swift` кнопки (46) — заменить `frame(height: N)` на `frame(minHeight: scaled)` через `@ScaledMetric(relativeTo: .body) private var ctaHeight: CGFloat = 50`.
- Ratchet в `scripts/validate-ios-a11y-contract.mjs` (правило 5 из Среза 4): опустить потолок `\.font\(\.system\(size:` с 58 до фактического числа после правки и записать в `scripts/ios-a11y-baseline.json`.

**Acceptance:**
1. `npm run ios:test` — существующие тесты не падают (метрика не покрыта юнит-тестом).
2. UI-тест на размере AX3, `npm run ios:ui`:
   ```swift
   func testCartRemainsUsableAtAccessibilityTextSize() {
       let app = XCUIApplication()
       app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-cart",
                              "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityL"]
       app.launch()
       let plus = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Увеличить количество'")).firstMatch
       XCTAssertTrue(plus.waitForExistence(timeout: 10))
       XCTAssertTrue(plus.isHittable)            // не уехал за экран
   }
   ```
   (`--ui-testing-cart` уже есть — `Shared/UITestBootstrap.swift`, `startsAtCart`.)
3. Глазами через MCP `xcodebuild`: `build_run_sim`, затем `screenshot` четырёх экранов (главная, каталог, корзина, оформление) на **дефолтном** размере и на **AX5**. Обрезанного текста быть не должно.

**Переиспользовать:** системные текстовые стили в Staff/POS (`.subheadline`, `.title3`, `.caption` — `Staff/StaffWorkView.swift:157-180`, `POS/POSSaleView.swift:90-160`) — они масштабируются сами и **не подлежат переводу** на `Design3.body()`. Ограничение из аудита («пока в нём нет `relativeTo:`») после этого среза формально снимается, но миграцию Staff/POS на `Design3` **всё равно не делать** — YAGNI, отдельный разговор.

**Риск регрессии:** (1) На AX5 кастомные шрифты теперь растут **по-разному** — вёрстка, рассчитанная на равномерный рост, поедет; главный подозреваемый — нижняя таб-панель (`GlassTabItem`, `Design3Primitives.swift:172+`) и горизонтальные ряды чипов. (2) `@ScaledMetric` пересчитывается при смене размера — на длинных `LazyVGrid` возможен скачок раскладки при первом рендере. (3) `npm run ios:visual` снимает 20 PNG на дефолтном размере — там изменений быть почти не должно; если PNG поехали, значит `textStyle(for:)` промахнулся по кеглю и надо править таблицу, а не подгонять снимки.

**НЕ делать в этом срезе:** не ставить `.dynamicTypeSize(...DynamicTypeSize.large)` нигде (это ограничение доступности, а не решение); не переводить Staff/POS на `Design3`; не менять цвета; не менять размеры целей (следующий срез).

---

### Срез 9 — Целевые размеры 44×44

**Зависит от:** Среза 8 (после `@ScaledMetric` высоты уже перестали быть константами — иначе пришлось бы править те же строки дважды).

**Норма:** WCAG 2.2 SC 2.5.8 (AA) требует 24×24 CSS px, Apple HIG и SC 2.5.5 (AAA) — 44×44 pt. Для рынка с заметной долей пожилых покупателей целимся в **44×44**. Ключевой приём: увеличивать **область нажатия**, а не рисунок — `.frame(minWidth: 44, minHeight: 44)` + `.contentShape(Rectangle())`, визуальный кружок остаётся прежним.

**Файлы (полный список, точные строки):**

| файл:строка | сейчас | что делать |
|---|---|---|
| `Client/AliStoreClientApp.swift:1507` | `.frame(width: 28, height: 28)` — «минус» степпера | `minWidth/minHeight: 44` + `.contentShape(Rectangle())` |
| `Client/AliStoreClientApp.swift:1519` | `.frame(width: 28, height: 28)` — «плюс» степпера | то же |
| `Client/AliStoreClientApp.swift:1501` | `HStack(spacing: 10)` между ними | увеличить до `spacing: 12`, чтобы 44-точечные зоны не слипались |
| `Client/AliStoreClientApp.swift:786` | `minHeight: 32` — «В корзину» в сравнении | `minHeight: 44` |
| `Client/AliStoreClientApp.swift:796` | `minHeight: 24` — «Убрать» из сравнения | `minHeight: 44` |
| `Client/AliStoreClientApp.swift:813-823` | иконка `.font(.title3)` без рамки (~22) — плюс/минус в строке сравнения | обернуть `.frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())` |
| `Client/AliStoreClientApp.swift:2154-2157` | `.frame(width: 34, height: 34)` — «Назад» в шапке заказа | `minWidth/minHeight: 44`, круг оставить 34 через `.background(…, in: Circle())` на внутреннем `.frame(width: 34, height: 34)` |
| `Client/AliStoreClientApp.swift:4091` | `.frame(width: 34, height: 34)` — иконка карточки-ссылки | ссылка целиком крупная; проверить `isHittable`, менять только если реальная зона < 44 |
| `Client/AliStoreClientApp.swift:5967` | `frame(height: 38)` — кнопка карточки | `minHeight: 44` (сама кнопка уже переписана Срезом 5) |
| `Client/Features/InstallmentView.swift:208` | `.frame(width: 30, height: 30)` — бейдж платежа | это **не кнопка** (`Text` в `scheduleRow`) — размер не трогать, проверить и записать в коммит, что интерактивности там нет |
| `Staff/StaffWorkView.swift:157-172` | иконка `.font(.title3.weight(.semibold))` без рамки (~22) — переключатель задачи | `.frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())`; `.accessibilityLabel` и `.accessibilityIdentifier` уже есть (`:172-173`) — не трогать |
| `POS/POSSaleView.swift:105`, `:109` | `Button { … } label: { Image(systemName: "minus"/"plus") }.buttonStyle(.bordered)` (~30×32) | добавить `.frame(minWidth: 44, minHeight: 44)`; `accessibilityIdentifier` `pos-qty-minus/plus-*` сохранить |
| `Shared/QuickUnlock.swift:384` | `.frame(width: 26, height: 26)` — иконка в `statusPanel` | панель **не интерактивна** (`.accessibilityHidden(true)` на `:377`) — не трогать, зафиксировать в коммите |
| `Client/Features/StoriesViewer.swift:129-133` | 32×32 — крестик | **уже сделано Срезом 6**, здесь пропустить |

**Acceptance:** UI-тест, проверяющий геометрию — это в XCUITest действительно доступно (`npm run ios:ui`):
```swift
func testInteractiveTargetsAreAtLeast44pt() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-cart"]
    app.launch()
    for predicate in ["label BEGINSWITH 'Увеличить количество'", "label BEGINSWITH 'Уменьшить количество'"] {
        let b = app.buttons.matching(NSPredicate(format: predicate)).firstMatch
        XCTAssertTrue(b.waitForExistence(timeout: 10))
        XCTAssertGreaterThanOrEqual(b.frame.height, 44, "\(predicate): \(b.frame)")
        XCTAssertGreaterThanOrEqual(b.frame.width,  44, "\(predicate): \(b.frame)")
    }
}
```
Аналогичный тест для POS (`pos-qty-plus-*`) в `UITests/POS/AliStorePOSUITests.swift`.
Плюс MCP `xcodebuild` → `snapshot_ui` корзины: в дереве у степперов рамки ≥44.

**Переиспользовать:** `Client/AliStoreClientApp.swift:6021-6028` — кнопка избранного на детальной: 44×44 + подложка `.black.opacity(0.5)` в `Circle()`. Это **эталон приёма** «зона больше рисунка»; воспроизводить его, а не увеличивать сами иконки. `Client/…:5961` (после Среза 5) — второй экземпляр того же приёма.

**Риск регрессии:** (1) Степперы 44×44 в строке корзины рядом с картинкой 76×76 (`:1490`) и ценой — строка станет выше; на iPhone SE проверить, не выталкивается ли кнопка «Удалить» (`:1526`) на вторую строку. (2) `.contentShape(Rectangle())` расширяет зону нажатия за пределы рисунка — соседние кнопки могут начать перехватывать тапы друг у друга; проверять «промахи» пальцем на симуляторе, а не только по цифрам. (3) `npm run ios:visual` и наборы скриншотов App Store поедут — пересъёмка после этого среза (см. ниже).

**НЕ делать в этом срезе:** не трогать `StoriesViewer:129-133` (сделано в Срезе 6) и `Client/…:5961` (сделано в Срезе 5); не увеличивать размер самих иконок; не трогать неинтерактивные бейджи (`InstallmentView:208`, `QuickUnlock:384`) — зафиксировать в коммите, что проверено и интерактивности там нет.

---

## Завершение (не срез — хвост после Среза 9)

1. `npm run ios:generate && npm run ios:build && npm run ios:test && npm run ios:ui && npm run ios:contract`
2. `npm run ios:visual` — пересъёмка визуальных артефактов (iPhone + iPad, 3 части, счётчик PNG сверяется с `store/client-metadata.json`).
3. `npm run ios:store-screenshots` + `npm run ios:store-preflight` — наборы App Store поедут после Срезов 1, 7, 8, 9; пересобрать **один раз** в конце.
4. Итоги записать в `PROGRESS.md` и `BACKLOG.md` (существующая конвенция; новый changelog не заводить). В `BACKLOG.md` отдельными строками: захардкоженные цены в маркетинговых блоках (`Client/…:1581,2745,5872`, `StaffScannerView:189`, `StoriesViewer:28`), отсутствие iOS-джобы в CI, кыргызская локализация.

---

## Чего не смог проверить

- **Композит `.regularMaterial`** (`Design3.glassStrong`, `:44`). Значение #414141 выведено обратным счётом из трёх независимых замеров аудита для `.ultraThinMaterial` и сошлось до сотых — модель для *ultraThin* верна. Для `.regularMaterial` таких замеров нет; предложенные `frame.opacity(0.38)` и `hairlineGlass 0.34` — **оценка**, её обязан подтвердить Accessibility Inspector.
- **Что видно за стеклом на каждом экране.** Материал сэмплирует то, что под ним. На главной под стеклом градиент, в карточке товара — изображение как соседний элемент, а не подложка. Точный композит поэкранно считается только замером пикселя на реальном рендере.
- **Часовой пояс `DeliverySlot.startsAt`.** В `Shared/Models.swift` это `Date`, а в какой зоне сервер формирует слоты — не смотрел в `apps/api`. От этого зависит, нужна ли развилка `wireTimeRange` / `displayTimeRange` (Срез 3). **Проверить до правки.**
- **Реальный вывод `Bundle.main.preferredLocalizations` из `AliStoreCoreTests`.** Тест-бандл инжектируется в хост-приложение; сработает ли `Bundle.main` как ожидается — покажет первый прогон.
- **Точный разделитель групп** в русском выводе (обычный пробел / U+00A0 / U+202F). Замер выше показал пробел, но какой именно код — глазами по строке не определить; тест это вскроет.
- **Достижимость `WaitlistView`** из карточки товара (Срез 5): файл есть (156 строк), но не проверил, какие данные ему нужны и вызывается ли он сейчас откуда-либо.
- **Регрессии в 4 UI-таргетах.** `npm run ios:ui` не запускал (симулятор занимать нельзя). Сколько именно тестов упадёт от Срезов 4, 5, 8 — неизвестно.
- **Поведение Swift 6 strict concurrency** на `AccessibilityNotification…post()` из `catch` внутри `Task` и на статическом `DateFormatter`. Покажет компилятор.

## Что обязано быть проверено глазами на симуляторе

Симулятор **не занимал** — всё ниже предстоит сделать исполнителю плана.

1. **Локаль (после Среза 1).** До и после: `plutil -extract CFBundleDevelopmentRegion raw …/AliStore.app/Info.plist` и `find …/AliStore.app -maxdepth 1 -name '*.lproj'` — для всех **четырёх** приложений. Затем на экране: цена, дата заказа, плейсхолдер поиска (`Client/…:5761`), пустое состояние `ContentUnavailableView`, текст ошибки при выключенном интернете (авиарежим — `URLError` обязан прийти по-русски).
2. **Регион ≠ язык.** Симулятор с языком «Русский» и регионом **Россия**: суммы обязаны остаться `109 900 сом` (это проверяет прибитую локаль форматтера из Среза 4, а не `Locale.current`).
3. **VoiceOver, полный проход** (после Срезов 5–6): каталог — одна остановка на карточку; кнопки «В корзину» и «избранное» произносят название товара; ошибка промокода, ошибка оформления, ошибка входа и ошибка кассы — **произносятся**; после создания заказа — объявление смены экрана; сторис — тап-зоны существуют в роторе и есть пауза.
4. **Reduce Motion включён** (после Среза 6): шиммер `Skeleton` не анимируется, сторис не листаются сами.
5. **Контраст (после Среза 7):** Accessibility Inspector → Color Contrast Calculator на трёх поверхностях со стеклом — главная (градиент под стеклом), карточка товара, шапка чек-аута. Три токена: `textMuted`, `textSubtle`, `hairlineGlass`. Плюс `.regularMaterial` (`glassStrong`) — там расчёт заведомо не проверен.
6. **Dynamic Type на AX5** (после Среза 8): главная, каталог, корзина, оформление, экран входа. Ищем обрезанный текст, наложения и уехавшую за экран нижнюю таб-панель. Отдельно — что поле телефона и количество в степпере **выросли**.
7. **Пальцем, а не мышью** (после Среза 9): степперы корзины, плюс/минус в POS, «Убрать» в сравнении — промахи между соседними целями.
8. **iPhone SE (маленький экран) + AX3** — самая жёсткая комбинация для Срезов 8 и 9.
9. **Сравнение с текущими визуальными артефактами**: `npm run ios:visual` и глазами продиффить 20 PNG (iPhone + iPad) до/после «визуального блока» 7→8→9.

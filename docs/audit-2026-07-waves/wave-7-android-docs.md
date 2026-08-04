# План: Android-паритет и ловушки конфигурации (7.1–7.3)

Роль: Android Release Engineer. Публикация в Google Play отложена — **это не релизный
план**. Здесь только то, что (а) чинится на iOS прямо сейчас и обязано совпасть,
(б) взорвётся позже дороже, чем стоит починить сегодня.

Формат по `.claude/skills/writing-plans`: один вертикальный срез = один коммит,
acceptance пишется первым, файлы и функции названы поимённо.
Все номера строк сверены на рабочем дереве ветки `codex/open-source-integrations`,
`git status` чист на момент написания (HEAD `32a67c0`).

---

## 0. Что проверено запуском, а не чтением

| Проверка | Команда | Результат |
|---|---|---|
| Тулчейн Android жив | `JAVA_HOME=/opt/homebrew/opt/openjdk@17 npm run android:test` | **BUILD SUCCESSFUL за 47 с**, 172 задачи (`test` + `lintDebug` по всем 5 модулям) |
| Сборка четырёх APK | `JAVA_HOME=... npm run android:build` | **BUILD SUCCESSFUL**, 170 задач |
| Точечный прогон одного класса | `cd apps/android && JAVA_HOME=... ./gradlew :core:testDebugUnitTest --tests 'kg.alistore.core.PinAttemptLimiterTest'` | **BUILD SUCCESSFUL за 6 с** — это рабочий RED-цикл |
| SDK | `apps/android/local.properties` → `sdk.dir=/Users/alistore/Library/Android/sdk` | есть, git-ignored |
| JDK | `/opt/homebrew/opt/openjdk@17` | есть. Системный `java` **отсутствует** («Unable to locate a Java Runtime») — `JAVA_HOME` обязателен, npm-скрипты его уже задают |
| Устройство для `android:ui` | `~/Library/Android/sdk/platform-tools/adb devices` | `emulator-5556 device` — подключён, AVD `savio_api36_arm64` |
| `FLAG_SECURE` в репозитории | `grep -rn FLAG_SECURE apps/android --include='*.kt' --include='*.xml'` | **exit 1, ноль совпадений** |

**Вывод по вопросу «есть ли чем запускать acceptance»: есть.** JVM-юнит-тесты и lint
запускаются за минуту, инструментальные — на подключённом эмуляторе. Статический
барьер нужен **не** вместо теста, а вместо **пайплайна** (см. п. 0.2).

### 0.1 Тесты, утверждающие тела запросов — образец для новых

Такие тесты есть, и форма у них одна: фейковая реализация интерфейса-шлюза + запись
того, что в неё пришло, + точное сравнение JSON. Новые тесты писать **по этой форме**:

- `apps/android/core/src/test/java/kg/alistore/core/CourierCommandManagerTest.kt:12-35` —
  эталон. `RecordingQueue : MutationQueue` (`:49-61`) ловит `endpoint/body/key`, тест
  утверждает `assertEquals("{\"codAmount\":2500}", queue.body)` — **побайтово всё тело**.
  Это ровно тот класс, который правится в срезе A5.
- `apps/android/core/src/test/java/kg/alistore/core/PosSaleManagerTest.kt:64-72` —
  `PosRecordingQueue`, та же идея для POS.
- `apps/android/core/src/test/java/kg/alistore/core/CheckoutRequestParityTest.kt:20-51` —
  утверждает и наличие полей, и **отсутствие** непереданных (`assertFalse(json.has(...))`).
- `apps/android/core/src/test/java/kg/alistore/core/ApiClientTest.kt` — **12 строк, тела не
  утверждает вовсе.** Не брать за образец.

Инструментальные (Compose) — `apps/android/core/src/androidTest/.../StaffCustomer360ScreenTest.kt`:
`createComposeRule()`, `onNodeWithTag(...).performClick()`, `compose.waitUntil { ... }`,
проверка через фейковый gateway. Для UI-утверждений среза A1/A3 брать эту форму.

**Ограничения модуля `core` (`apps/android/core/build.gradle.kts:22-46`), учитывать при выборе слоя теста:**
- **Robolectric нет.** Всё, что трогает `SharedPreferences`, `AndroidKeyStore`, `SQLiteOpenHelper`,
  `SystemClock`, — только `src/androidTest/` (эмулятор). В `src/test/` — только чистые функции.
- `testImplementation("org.json:json:20250517")` есть → JSON-тела в JVM-тестах разбираются по-настоящему.
- `androidx-lifecycle-runtime-compose` есть → `LocalLifecycleOwner` доступен.
  **`androidx.lifecycle:lifecycle-process` (`ProcessLifecycleOwner`) в зависимостях НЕТ** —
  срез A3 обязан обойтись без него (см. там).

### 0.2 Android не входит ни в один пайплайн — и это осознанно

- `scripts/mvp-verify.mjs:27-32` — комментарий прямым текстом: нативные сборки живут в
  отдельном workflow (macOS-раннер для xcodebuild, Android SDK для gradlew), а не в этом
  Postgres-зависимом гейте. Мобильных шагов там нет.
- `.github/workflows/ci.yml` — единственная нативная строка `:66`
  `npm run native:deeplink-preflight` (`scripts/validate-deeplink-contract.mjs`).
  Ни `gradlew`, ни `xcodebuild` в CI нет. Workflow-файлов всего три: `ci.yml`,
  `cd-staging.yml`, `uptime.yml`.

**Как удержать паритет без пайплайна.** Не предлагаю заводить Android-workflow — это
отдельное решение владельца (стоимость раннера, кэш Gradle, подпись). Предлагаю
единственный механизм, который в этом репозитории уже доказал, что работает:
**статический барьер на Node, включённый в CI**, по образцу
`scripts/validate-deeplink-contract.mjs` (43 строки: `read` + `requireText` + список
утверждений + exit 1). Такой барьер краснеет на GitHub без Android SDK и ловит
именно дрейф контракта — то есть ровно то, что расходится между платформами.
Барьеры этого среза добавляются в `.github/workflows/ci.yml` рядом со строкой `:66`.

### 0.3 Что уже спланировано в других планах — НЕ переписывать

Три из четырёх пунктов 7.2 **уже разобраны построчно, с Android-файлами и Android-тестами**,
в `~/.claude/plans/humming-snuggling-mccarthy-agent-a86fded859c891f14.md`
(«План починки офлайн-денег (iOS / Android / API)»):

| Дефект из задания | Где уже спланирован | Что там про Android |
|---|---|---|
| Округление скидки `PosOperationsScreens.kt:239` | **Срез 2** того плана | Новая `posSaleTotal(gross, discountPct)` = `Math.round(g*(1.0 - p/100.0))`, замена строки 239, RED-тест `PosDiscountParityTest.kt` на золотой фикстуре, порождённой сервером, + сторож копий `scripts/check-pos-golden-parity.mjs` в `mvp:verify` |
| Split-tender `PosOperationsScreens.kt:311-312` | **Срез 3** того плана | Новая `posTenders(total, splitCash, fallbackMethod)`, RED-тест `PosTenderSplitTest.kt` (пять случаев, включая `cash == total`) |
| Ротация `activeSaleId` / `insertOrThrow` | **Срез 4** того плана | Ветка `Queued` получает ту же очистку, что `Completed`; `OfflineQueueDb.enqueue` ловит `SQLiteConstraintException`, сравнивает тело, бросает `DuplicateMutationException`; `androidTest/OfflineQueueDbTest.kt` |

**Исполнителю:** брать эти три среза оттуда дословно. Дублирование здесь создало бы два
расходящихся описания одной формулы — то самое, что этот план чинит.
Ниже (**срез A0**) — только дельта, которой в том плане нет и которую я нашёл при проверке.

Четвёртый пункт 7.2 (evidence-ключ курьера) вынесен сюда полностью — срез **A5**, потому что
в `~/.claude/plans/...abca5d20a3f9a633a.md` (iOS, Срез 3) Android описан пятью буллетами
в разделе «7. Android — зеркало» **без acceptance и без разбора офлайн-ветки**, а сам
автор в «Чего не смог проверить» п. 9 признаёт: «Android-зеркала размечены по grep'у сигнатур».

### 0.4 Зависимость от iOS — почему паритет идёт вторым

Формулу и семантику согласовывает iOS-срез; Android **зеркалит уже согласованное**.
Если делать наоборот, придётся переделывать дважды. Соответствие:

| Срез Android | Идёт ПОСЛЕ среза iOS |
|---|---|
| A1 (PIN) | `...abca5d20a3f9a633a.md` **Срез 4** — «Сброс PIN с экрана блокировки требует доказательства личности (1.3)» |
| A3 (фон) | `...abca5d20a3f9a633a.md` **Срез 5** — «Замок возвращается при уходе в фон (1.4)» |
| A5 (evidence) | `...abca5d20a3f9a633a.md` **Срез 3** — «Evidence-ключ курьера сквозь весь поток (1.2)» |
| A0 (деньги) | `...a86fded859c891f14.md` **Срезы 2, 3, 4** |
| A2, A4, A6, A7 | ни от чего на iOS не зависят — можно делать параллельно и первыми |

---

## Порядок исполнения

Сначала дешёвое и независимое (A2, A4, A6, A7 — не ждут iOS), затем зеркала (A1 → A3 → A5),
затем A0 как проверочный проход по деньгам.

---

### Срез A1 — PIN нельзя перезаписать с экрана блокировки

**Зависит от:** iOS Срез 4 (`...abca5d20a3f9a633a.md:348`). Оттуда берётся согласованная
семантика трёх операций и тексты ошибок; здесь — построчный перевод на Kotlin.

**Дефект (проверен чтением).** `apps/android/core/.../QuickUnlock.kt:180-190` рисует поля
«Новый PIN» / «Повторите PIN» и кнопку «Настроить PIN» **прямо на экране блокировки**,
безусловно, рядом с полем ввода PIN. Кнопка зовёт `store.savePin(setup)` (`:71-78`), который
перезаписывает хеш **без знания старого PIN** и вдобавок делает
`.putInt(failuresKey, 0).remove(lockedUntilKey)` (`:76`) — то есть **обнуляет счётчик попыток
и снимает действующую блокировку**. Человек с чужим разблокированным-до-экрана-PIN
устройством входит за два касания; лимит в 5 попыток обходится тривиально.

Плюс два соседних дефекта в том же файле, закрываемых здесь же:
- `QuickUnlock.kt:136` — `var unlocked by rememberSaveable { mutableStateOf(false) }`.
  `rememberSaveable` переживает смерть процесса. Приложение, убитое в разблокированном
  состоянии, **восстанавливается сразу в контент**, минуя PIN.
- `QuickUnlock.kt:137` — `var pin by rememberSaveable { ... }`. Введённый PIN попадает в
  `savedInstanceState`, который система пишет на диск. PIN не должен покидать оперативную память.

**Acceptance (пишется первым)**

1. `apps/android/core/src/test/java/kg/alistore/core/QuickUnlockPolicyTest.kt` (новый, JVM).
   Тестирует **чистый** объект `QuickUnlockPolicy` (создаётся в этом срезе, см. «Файлы»),
   чтобы не упираться в отсутствие Robolectric. Форма — как у существующего
   `PinAttemptLimiterTest.kt` (чистые функции, точные числа, никакого Android).
   - `savePinRejectedWhenAlreadyConfigured()` — `QuickUnlockPolicy.save(isConfigured = true, …)`
     возвращает `PinWriteDecision.Rejected(PinWriteError.AlreadyConfigured)`. **Падает до правки** —
     сегодня такой ветки нет вовсе.
   - `changeRequiresMatchingCurrentPin()` — `change(currentMatches = false, status = allowed)` →
     `Rejected(CurrentPinMismatch)` **и** `countsAsFailure = true`.
   - `changeCountsFailuresTowardsLockout()` — пять подряд `Rejected(CurrentPinMismatch)`
     через `PinAttemptLimiter.afterFailure` приводят к `status.allowed == false`.
   - `changeBlockedDuringLockoutEvenWithCorrectPin()` — `change(currentMatches = true,
     status = lockedOut)` → `Rejected(LockedOut)`.
   - `changeSucceedsWithCorrectCurrentPin()` — `Accepted(resetsAttempts = true)`.
   - `biometricResetIsAcceptedWithoutCurrentPin()` — `resetAfterBiometric()` → `Accepted`.
   - `savePinAcceptedOnlyForSixDigits()` — `"12345"`, `"1234567"`, `"12a456"` → `Rejected(InvalidPin)`.
2. `apps/android/core/src/androidTest/java/kg/alistore/core/QuickUnlockStoreTest.kt` (новый,
   инструментальный — `QuickUnlockStore` трогает `SharedPreferences` и `AndroidKeyStore`,
   в JVM не поднимется). Форма — как у `androidTest/ClientLocalStateTest.kt`.
   - `savePinTwiceIsRejectedAndKeepsTheFirstHash()` — после `savePin("123456")` второй
     `savePin("999999")` возвращает ошибку, `matches("123456")` остаётся `true`.
   - `changePinRewritesTheHashOnlyWithTheCurrentPin()`.
   - `failedChangeIncrementsTheSameCounterAsFailedUnlock()` — `pinStatus().failures` растёт.
   - `clearRemovesPinAttemptsAndKeystoreEntry()` — после `clear()` `isPinConfigured == false`
     и новый `savePin` работает (KeyStore-запись пересоздана).
   - Каждый тест обязан использовать **свой** alias (`"test-${UUID.randomUUID()}"`), иначе
     тесты будут делить одну запись KeyStore и станут порядкозависимыми.
3. `apps/android/core/src/androidTest/java/kg/alistore/core/QuickUnlockGateTest.kt` (новый,
   Compose). Форма — `StaffCustomer360ScreenTest.kt`.
   - `lockScreenDoesNotOfferPinSetupWhenPinIsConfigured()` — при настроенном PIN узла с тегом
     `quick-unlock-setup-new` на экране блокировки **нет**; вместо него кнопка
     `quick-unlock-change` (открывает лист). **Падает до правки.**
   - `changeSheetRequiresCurrentPinOrBiometricProof()` — кнопка `quick-unlock-save`
     `assertIsNotEnabled()`, пока поле `quick-unlock-current` не заполнено шестью цифрами.

**Файлы**

- `apps/android/core/src/main/java/kg/alistore/core/QuickUnlock.kt:45-59` — рядом с
  `PinAttemptLimiter` (не внутри) добавить чистый объект-политику. Он существует ровно затем,
  чтобы решение было тестируемо без Android:
  ```kotlin
  sealed interface PinWriteDecision {
    data class Accepted(val resetsAttempts: Boolean) : PinWriteDecision
    data class Rejected(val error: PinWriteError, val countsAsFailure: Boolean = false) : PinWriteDecision
  }
  enum class PinWriteError { InvalidPin, AlreadyConfigured, CurrentPinMismatch, LockedOut }

  internal object QuickUnlockPolicy {
    fun isWellFormed(pin: String) = pin.length == 6 && pin.all(Char::isDigit)
    fun save(isConfigured: Boolean, pin: String): PinWriteDecision = when {
      !isWellFormed(pin) -> PinWriteDecision.Rejected(PinWriteError.InvalidPin)
      isConfigured -> PinWriteDecision.Rejected(PinWriteError.AlreadyConfigured)
      else -> PinWriteDecision.Accepted(resetsAttempts = true)
    }
    fun change(status: PinAttemptStatus, currentMatches: Boolean, next: String): PinWriteDecision = when {
      !status.allowed -> PinWriteDecision.Rejected(PinWriteError.LockedOut)
      !isWellFormed(next) -> PinWriteDecision.Rejected(PinWriteError.InvalidPin)
      !currentMatches -> PinWriteDecision.Rejected(PinWriteError.CurrentPinMismatch, countsAsFailure = true)
      else -> PinWriteDecision.Accepted(resetsAttempts = true)
    }
    fun resetAfterBiometric(next: String): PinWriteDecision =
      if (isWellFormed(next)) PinWriteDecision.Accepted(resetsAttempts = true)
      else PinWriteDecision.Rejected(PinWriteError.InvalidPin)
  }
  ```
- `QuickUnlock.kt:71-78` `savePin` — расщепить на три метода `QuickUnlockStore`, каждый
  делегирует решение `QuickUnlockPolicy`, а запись хеша выносится в общий
  `private fun writePin(pin: String)` (сегодня соль+HMAC живут в одном месте — так и оставить, DRY):
  - `fun savePin(pin: String): PinWriteDecision` — только когда `!isPinConfigured`;
  - `fun changePin(current: String, next: String): PinWriteDecision` — вызывает `matches(current)`,
    при `countsAsFailure` дёргает `registerPinFailure()`;
  - `fun resetPinAfterBiometric(next: String): PinWriteDecision`.
  **Возвращаемый тип меняется с `Boolean` на `PinWriteDecision`** — вызывающему нужен текст ошибки.
- `QuickUnlock.kt:76` — `.putInt(failuresKey, 0).remove(lockedUntilKey)` оставить **только**
  в ветке `Accepted`. Это и есть корень «обнуления счётчика».
- `QuickUnlock.kt:136` — `rememberSaveable` → `remember`. Экран блокировки обязан появляться
  после смерти процесса.
- `QuickUnlock.kt:137` — `rememberSaveable` → `remember` для `pin`, `setup`, `confirmation`
  (все три, `:137-139`). PIN не пишется в `savedInstanceState`.
- `QuickUnlock.kt:185-187` — три виджета настройки убрать с экрана блокировки. Вместо них —
  одна кнопка `testTag("quick-unlock-change")` с текстом
  `if (store.isPinConfigured) "Изменить PIN" else "Настроить PIN"`, открывающая
  `androidx.compose.material3.ModalBottomSheet`. Внутри листа:
  - при `isPinConfigured` — поле «Текущий PIN» (`testTag("quick-unlock-current")`) **и**
    кнопка «Подтвердить биометрией» (активна при `biometricAvailable`), которая ставит
    `biometricProven = true` **только** внутри `onAuthenticationSucceeded`
    (образец — `:149-151`);
  - поля «Новый PIN» (`quick-unlock-setup-new`) и «Повторите PIN» (`quick-unlock-setup-repeat`);
  - кнопка «Сохранить PIN» (`quick-unlock-save`), `enabled` = новый и повтор по 6 цифр **и**
    (`!isPinConfigured` || `biometricProven` || `current.length == 6`);
  - ветвление ровно как на iOS: `!isConfigured` → `savePin`; `biometricProven` → `resetPinAfterBiometric`;
    иначе → `changePin`.
- Тексты ошибок держать **одинаковыми с iOS** (там они задаются в `QuickUnlockError.errorDescription`):
  `InvalidPin` → «Введите 6 цифр», `AlreadyConfigured` → «PIN уже настроен», `CurrentPinMismatch` →
  «Неверный текущий PIN», `LockedOut` → «Слишком много попыток».

**Переиспользовать**
- `PinAttemptLimiter` (`QuickUnlock.kt:45-59`) и `PinAttemptStatus` (`:38-43`) — счётчик уже
  написан и покрыт тестами, **заново не писать**.
- `BiometricPrompt`-обвязка `QuickUnlock.kt:144-159` — готовый образец success-ветки.
- `hmac()` / `key()` (`QuickUnlock.kt:111-123`) — **не трогать** (см. раздел «Что на Android
  уже лучше»).
- `apps/android/core/src/test/java/kg/alistore/core/PinAttemptLimiterTest.kt` — образец
  формы для `QuickUnlockPolicyTest`.

**НЕ делать в этом срезе:** не менять схему хеша `v1:salt:hmac` и не мигрировать существующие
PIN; не переносить хранилище на `EncryptedSharedPreferences` (HMAC-ключ из KeyStore уже
закрывает офлайн-перебор); не трогать автозапуск биометрии в `LaunchedEffect` (`:144`) —
это срез A3; не трогать `quickUnlock.clear()` в `logout` (сброс PIN при выходе — правильно);
не добавлять `FLAG_SECURE` (срез A4).

**Проверка:** `npm run android:test`, затем
`cd apps/android && JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :core:connectedDebugAndroidTest`
(эмулятор `emulator-5556` подключён).

---

### Срез A2 — Троттлинг PIN на часах, которые нельзя перевести

**Зависит от:** ничего. Можно делать первым.

**Дефект.** `QuickUnlock.kt:90` и `:96` берут `nowMillis = System.currentTimeMillis()` —
настенные часы. `lockedUntilMillis` хранится в той же шкале (`:100`). Пользователь с доступом
к настройкам даты (или устройство с автосинхронизацией времени) сдвигает часы вперёд →
`PinAttemptLimiter.status` (`:50`) считает `remaining = lockedUntil - now` отрицательным →
`allowed = true` → блокировка на 30 секунд после пяти неверных попыток снимается мгновенно
и перебор идёт без ограничений.

**Ключевой факт:** `PinAttemptLimiter.status/afterFailure` **уже принимают `nowMillis`
параметром** и остаются чистыми. Правка — в двух местах вызова и в формате хранения.

**Acceptance (пишется первым)**

`apps/android/core/src/test/java/kg/alistore/core/PinAttemptLimiterTest.kt` — дописать
в существующий класс (не заводить новый файл):
- `lockoutSurvivesWallClockJumpForward()` — заблокировать при
  `PinClock(elapsedMillis = 1_000, wallMillis = 1_000)`, затем спросить статус при
  `PinClock(elapsedMillis = 2_000, wallMillis = 999_999_999)` → `allowed == false`.
  **Падает до правки** — сегодня `status` принимает один `Long`.
- `lockoutSurvivesWallClockJumpBackward()` — `PinClock(elapsedMillis = 2_000, wallMillis = 0)`
  → `allowed == false`.
- `lockoutExpiresWhenBothClocksAdvance()` — `PinClock(31_000, 31_000)` → `allowed == true`.
- `lockoutAfterRebootFallsBackToWallClock()` — `elapsedMillis` сброшен в `0`
  (перезагрузка), `wallMillis = 31_000` → `allowed == true`, то есть перезагрузка
  **не** превращает 30-секундную блокировку в вечную.
- Существующие три теста переписать на `PinClock` — их числа не меняются.

**Файлы**

- `QuickUnlock.kt:38-43` — `PinAttemptStatus` получает второе поле блокировки:
  `lockedUntilElapsedMillis` и `lockedUntilWallMillis` вместо одного `lockedUntilMillis`.
- `QuickUnlock.kt:45-59` `PinAttemptLimiter` — сигнатуры принимают
  ```kotlin
  data class PinClock(val elapsedMillis: Long, val wallMillis: Long)
  ```
  и считают остаток как **максимум** двух:
  ```kotlin
  val remaining = maxOf(lockedUntilElapsed - clock.elapsedMillis, lockedUntilWall - clock.wallMillis)
    .coerceAtLeast(0)
  ```
  **Почему максимум, а не одна шкала.** `SystemClock.elapsedRealtime()` монотонен и
  не поддаётся переводу, но обнуляется при перезагрузке — одна эта шкала дала бы вечную
  блокировку после ребута. `System.currentTimeMillis()` переживает ребут, но переводится.
  Максимум остатков закрывает обе атаки: сдвиг вперёд гасится elapsed-слагаемым, сдвиг
  назад — wall-слагаемым. Цена — после перезагрузки блокировка может держаться лишние
  до 30 с аптайма. Это осознанный размен, записать его комментарием над функцией.
- `QuickUnlock.kt:66` — рядом с `lockedUntilKey` завести второй ключ:
  `"$alias.locked-until-elapsed"` и `"$alias.locked-until-wall"`; старый `lockedUntilKey`
  при чтении трактовать как wall-значение (совместимость с уже установленными сборками) и
  переставать писать.
- `QuickUnlock.kt:90` `pinStatus` — дефолт параметра меняется на
  `PinClock(SystemClock.elapsedRealtime(), System.currentTimeMillis())`.
  Импорт `android.os.SystemClock`.
- `QuickUnlock.kt:96` `registerPinFailure` — то же.
- `QuickUnlock.kt:100` — писать оба ключа.
- `QuickUnlock.kt:161-166` — `LaunchedEffect(pinStatus.lockedUntilMillis)` переименовать ключ
  эффекта в `pinStatus.lockedUntilElapsedMillis` (тело не меняется).

**Переиспользовать**
- Сам `PinAttemptLimiter` — менять только шкалу времени, ни `maxFailures = 5`, ни
  `lockoutMillis = 30_000` не трогать.
- `PinAttemptLimiterTest.kt` — тесты уже параметризованы временем, дописывать в него.

**НЕ делать в этом срезе:** не менять политику лимита (5 попыток / 30 с); не вводить
экспоненциальную задержку; не трогать UI (`:180-190`) — это срез A1; не переносить счётчик
попыток на сервер.

**Проверка:** `npm run android:test` (JVM-часть достаточна — все правки в чистых функциях
и двух дефолтах параметров).

---

### Срез A3 — Замок возвращается при уходе в фон

**Зависит от:** iOS Срез 5 (`...abca5d20a3f9a633a.md:445`) — оттуда берётся решение
«блокировать на background, а НЕ на inactive» и правило «пустая сессия не блокируется».
И от среза **A1** — иначе вернувшийся замок обходится кнопкой «Настроить PIN».

**Андроидный эквивалент `scenePhase == .background`.** iOS-й `scenePhase` имеет два
кандидата на Android:
- `Lifecycle.Event.ON_PAUSE` — приходит при диалоге разрешений камеры, при шторке
  уведомлений, при частичном перекрытии. Курьер получал бы PIN-экран посреди съёмки
  Evidence. **Не использовать.**
- `Lifecycle.Event.ON_STOP` — приложение перестало быть видимым: свернули, ушли в другое
  приложение, открыли switcher. Это точный аналог `.background`. **Использовать его.**

`ProcessLifecycleOwner` был бы точнее (процесс, а не активити), но
`androidx.lifecycle:lifecycle-process` **не подключён** к модулю `core`
(`apps/android/core/build.gradle.kts:22-46`). Все четыре приложения одноактивитные
(`app/staff/courier/pos` — по одной `MainActivity : FragmentActivity`), поэтому
`LocalLifecycleOwner` (активити) эквивалентен и не требует новой зависимости.
Новую зависимость в этом срезе **не добавлять**.

**Куда вешать — и почему не в `MainActivity`.** Замок принадлежит менеджеру сессии, а
менеджер живёт в composable (`AliStoreApp.kt:116`, `StaffOperationsScreens.kt:96`,
`CourierOperationsScreens.kt` — `remember`). Обработчик в `MainActivity` до него не
дотянется без прокидывания ссылок через четыре модуля. Вешать в composable рядом с
менеджером, одним переиспользуемым хелпером.

**Скрытый блокер, без которого срез не заработает.** `requiresQuickUnlock` —
обычный `var` на обычном классе:
`StaffSessionManager.kt:25-26` (`var requiresQuickUnlock: Boolean = false; private set`) и
`AuthSessionManager.kt:28-29` — то же. **Compose за ним не наблюдает.** Сегодня это не
видно, потому что состояние «разблокировано» держит сам `QuickUnlockGate` внутри себя
(`QuickUnlock.kt:136`). Как только `lock()` начнёт менять флаг снаружи, экран не
перерисуется. Поле обязано стать наблюдаемым, иначе срез — no-op.

**Acceptance (пишется первым)**

1. `apps/android/core/src/test/java/kg/alistore/core/StaffSessionManagerTest.kt` — дописать
   в существующий класс:
   - `lockRaisesQuickUnlockOnlyWhenSignedIn()` — на свежем менеджере (сессии нет) `lock()`
     оставляет `requiresQuickUnlock == false`; после успешного `login` (фейковый
     `StaffAuthGateway` — он в файле уже есть) `lock()` даёт `true`. **Падает до правки** —
     метода `lock()` нет.
   - `unlockThenLockRaisesTheGateAgain()` — `unlock()` → `false`, `lock()` → `true`.
   - `logoutMakesLockANoOp()` — после `logout()` `lock()` оставляет `false`.
2. `apps/android/core/src/test/java/kg/alistore/core/AuthSessionManagerTest.kt` — те же три
   против `AuthSessionManager` (фейки в файле уже есть).
3. `apps/android/core/src/androidTest/java/kg/alistore/core/QuickUnlockGateTest.kt`
   (файл создаётся в срезе A1) — дописать
   `gateReappearsWhenTheHostLifecycleStops()`: поднять `QuickUnlockGate` под
   `TestLifecycleOwner`, разблокировать по PIN, послать `Lifecycle.Event.ON_STOP`,
   утверждать, что узел `quick-unlock-pin` снова на экране, а контент — нет.

**Файлы**

- `apps/android/core/src/main/java/kg/alistore/core/StaffSessionManager.kt:25-26` —
  `var requiresQuickUnlock: Boolean = false; private set`
  → `var requiresQuickUnlock by mutableStateOf(false); private set`
  (импорт `androidx.compose.runtime.mutableStateOf/getValue/setValue`).
- `StaffSessionManager.kt:50` — после `fun unlock()` добавить:
  ```kotlin
  /** Возвращает замок при уходе приложения в фон. Без сессии не блокируем —
   *  иначе экран логина накрывался бы PIN-экраном. Зеркало iOS StaffAuthStore.lock(). */
  fun lock(hasSession: Boolean) { if (hasSession) requiresQuickUnlock = true }
  ```
  Сигнатура с параметром, а не с чтением поля, потому что `StaffSessionManager` сессию
  **не хранит** — она в `StaffAuthState` у вызывающего (`StaffOperationsScreens.kt:100`).
- `apps/android/core/src/main/java/kg/alistore/core/AuthSessionManager.kt:28-29` и `:61` — то же.
- `apps/android/core/src/main/java/kg/alistore/core/QuickUnlock.kt` — новый переиспользуемый
  composable рядом с `QuickUnlockGate`:
  ```kotlin
  /** Ставит замок, когда приложение перестало быть видимым (ON_STOP ≡ iOS scenePhase == .background).
   *  ON_PAUSE намеренно НЕ используется: он приходит на диалог разрешений и шторку уведомлений. */
  @Composable
  fun LockOnBackground(onLock: () -> Unit) {
    val owner = LocalLifecycleOwner.current
    val current by rememberUpdatedState(onLock)
    DisposableEffect(owner) {
      val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) current() }
      owner.lifecycle.addObserver(observer)
      onDispose { owner.lifecycle.removeObserver(observer) }
    }
  }
  ```
- Четыре точки подключения — **строго внутри ветки «есть сессия»**, чтобы экран логина
  не накрывался:
  - `apps/android/core/src/main/java/kg/alistore/core/AliStoreApp.kt:257` — перед
    `if (authManager.requiresQuickUnlock && authState is AuthState.SignedIn)` добавить
    `LockOnBackground { authManager.lock(authState is AuthState.SignedIn) }`.
  - `apps/android/core/src/main/java/kg/alistore/core/StaffOperationsScreens.kt:109` —
    в ветке `is StaffAuthState.SignedIn` добавить `LockOnBackground { manager.lock(true) }`.
  - `apps/android/core/src/main/java/kg/alistore/core/CourierOperationsScreens.kt:157` —
    `LockOnBackground { manager.lock(true) }`.
  - `apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt:111` —
    `LockOnBackground { auth.lock(true) }`.
- `QuickUnlock.kt:136` — `unlocked` уже стал `remember` в срезе A1; здесь дополнительно
  сбрасывать его при подъёме флага снаружи:
  `LaunchedEffect(externalLockRevision) { unlocked = false }` — либо, проще и без нового
  параметра, поднять состояние «разблокировано» **из** `QuickUnlockGate` в менеджер и
  показывать гейт по `requiresQuickUnlock`. Второй вариант предпочтителен: тогда
  единственный источник правды — `requiresQuickUnlock`, а внутреннего `unlocked` нет вовсе.
  **Выбрать второй вариант**, `onUnlocked` уже зовёт `manager::unlock` во всех четырёх точках.
- `StaffOperationsScreens.kt:109-113` — форма уже правильная (`if (manager.requiresQuickUnlock)`),
  но после того, как `unlocked` исчезнет, ветка `else` начнёт работать по-настоящему; проверить,
  что `StaffSignedInScreen` не дублируется (сегодня он написан дважды, `:110` и `:113`).

**Переиспользовать**
- `LocalLifecycleOwner` уже импортируется в `StaffScannerScreen.kt:56` — тот же приём, файл
  рядом.
- `androidx-lifecycle-runtime-compose` уже в зависимостях `core` (`build.gradle.kts:35`).
- `manager::unlock` / `auth::unlock` — все четыре вызова `QuickUnlockGate` их уже передают.

**НЕ делать в этом срезе:** не подключать `lifecycle-process`; не блокировать по `ON_PAUSE`;
не добавлять таймаут «блокировать через N минут» и настройку этого таймаута; не добавлять
размытие снапшота в switcher — это `FLAG_SECURE`, срез A4.

**Проверка:** `npm run android:test`, затем `:core:connectedDebugAndroidTest`.
Ручная проверка на `emulator-5556`: установить `:staff:assembleDebug`, войти, разблокировать,
`adb shell input keyevent KEYCODE_HOME`, вернуться — должен быть экран PIN.

---

### Срез A4 — `FLAG_SECURE` на экранах с деньгами и ПДн

**Зависит от:** ничего. Можно делать первым, параллельно с A2.

**Дефект.** `grep -rn FLAG_SECURE apps/android --include='*.kt' --include='*.xml'` — **ноль
совпадений** (exit 1). Ни одно из четырёх приложений не запрещает системе снимать скриншот
экрана и класть его превью в switcher, и не блокирует запись экрана / трансляцию.
Следствия: превью с суммой в кассе и с ПДн клиента лежит в switcher; любое приложение с
разрешением записи экрана снимает ввод PIN, паспортные данные продавца и карточку клиента.

**Какие экраны это касается (перечислены поимённо, чтобы не гадать):**

| Экран | Файл | Что утекает |
|---|---|---|
| Слепой пересчёт кассы | `StaffOperationsScreens.kt:640-680` (`countedCash`, `:648`) | Фактический пересчёт и расхождение — весь смысл слепого пересчёта в том, что цифру не видит никто, кроме кассира |
| Customer 360 | `StaffCustomer360Screen.kt` (весь экран) | Телефон, история покупок, ПДн клиента |
| Trade-in: паспорт продавца | `ClientTradeInScreen.kt:166` (поле «Паспорт / ID продавца»), `:141`, `:222` | Документ, удостоверяющий личность |
| Ввод PIN | `QuickUnlock.kt:169-191` (весь `QuickUnlockGate`) | Сам PIN быстрого входа |

**Acceptance (пишется первым)**

Compose-тестом флаг окна не проверяется (он ставится на `Window`, а `createComposeRule()`
поднимает контент без реального окна). Поэтому — два уровня:

1. `apps/android/core/src/androidTest/java/kg/alistore/core/SecureScreenTest.kt` (новый,
   инструментальный, с `createAndroidComposeRule<ComponentActivity>()` — нужна реальная
   активити):
   - `secureScreenSetsFlagWhileVisible()` — поднять контент, обёрнутый в новый
     `SecureScreen { }`, утверждать
     `(activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE) != 0`.
   - `secureScreenClearsFlagOnDispose()` — убрать контент, утверждать, что флаг снят
     (иначе весь остальной интерфейс останется несниммаемым, а Compose-скриншоты в
     существующих UI-тестах перестанут писаться — см. `StaffCustomer360ScreenTest.kt:37-44`,
     там `captureToImage()` в visual-режиме).
2. **Статический барьер** `scripts/validate-android-secure-screens.mjs` (новый, по образцу
   `scripts/validate-deeplink-contract.mjs` — тот же `read`/`requireText`/`failures`/`exit 1`).
   Он нужен потому, что Android **не входит ни в `mvp-verify`, ни в CI** (п. 0.2), а
   инструментальный тест требует эмулятора. Барьер утверждает наличие вызова `SecureScreen(`
   в четырёх файлах:
   ```js
   requireText('apps/android/core/src/main/java/kg/alistore/core/QuickUnlock.kt', 'SecureScreen {');
   requireText('apps/android/core/src/main/java/kg/alistore/core/StaffCustomer360Screen.kt', 'SecureScreen {');
   requireText('apps/android/core/src/main/java/kg/alistore/core/ClientTradeInScreen.kt', 'SecureScreen {');
   requireText('apps/android/core/src/main/java/kg/alistore/core/StaffOperationsScreens.kt', 'SecureScreen {');
   ```
   Плюс `npm`-скрипт `"android:secure-preflight": "node scripts/validate-android-secure-screens.mjs"`
   в корневом `package.json` рядом с существующим `"android:store-preflight"` (строка 30),
   и шаг в `.github/workflows/ci.yml` рядом со строкой `:66`.
   **Барьер не заменяет тест — он ловит удаление вызова, а тест доказывает, что вызов работает.**

**Файлы**

- `apps/android/core/src/main/java/kg/alistore/core/` — новый файл `SecureScreen.kt`
  (отдельный, а не в `QuickUnlock.kt`: им пользуются четыре разных экрана):
  ```kotlin
  /** Запрещает системе снимать скриншот, писать экран и класть превью в switcher,
   *  пока содержимое на экране. Флаг снимается при уходе — иначе несниммаемым
   *  становится всё приложение и ломаются visual-прогоны androidTest. */
  @Composable
  fun SecureScreen(content: @Composable () -> Unit) {
    val window = (LocalContext.current as? Activity)?.window
    DisposableEffect(window) {
      window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
      onDispose { window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
    content()
  }
  ```
  `LocalContext.current as? Activity` — безопасный каст: в `androidTest` контекст активити
  есть, в превью — нет, и тогда обёртка становится прозрачной, а не падает.
- `QuickUnlock.kt:169` — тело `QuickUnlockGate` (Column c полями PIN) обернуть в `SecureScreen { … }`.
  **Внутрь `if (unlocked) { content(); return }` не заходить** — контент приложения
  не должен наследовать флаг от гейта.
- `StaffCustomer360Screen.kt` — корневой composable экрана обернуть целиком.
- `ClientTradeInScreen.kt` — обернуть форму с полем паспорта; достаточно корня экрана.
- `StaffOperationsScreens.kt` — обернуть **только** блок закрытия смены с полем
  `closeCash` (`:640-680`), не весь Staff-экран: иначе несниммаемым станет весь рабочий
  интерфейс и сломаются визуальные прогоны.

**Переиспользовать**
- `scripts/validate-deeplink-contract.mjs` — шаблон барьера (43 строки, копировать структуру).
- `.github/workflows/ci.yml:66` — место, куда встаёт новый шаг.
- `package.json:30` (`android:store-preflight`) — образец именования npm-скрипта.

**НЕ делать в этом срезе:** не ставить `FLAG_SECURE` глобально в четырёх `MainActivity`
(сломает все `captureToImage()` в `androidTest` и превью в switcher для безобидных
экранов); не заводить настройку «разрешить скриншоты»; не трогать iOS (там аналог —
отдельная задача в BACKLOG, в iOS-плане Срез 5 её явно исключает).

**Проверка:** `node scripts/validate-android-secure-screens.mjs` → `npm run android:test`
→ `:core:connectedDebugAndroidTest` → `npm run android:ui` (убедиться, что визуальные
прогоны не сломались).

---

### Срез A5 — Evidence-ключ курьера на Android, сквозь офлайн-очередь

**Зависит от:** iOS Срез 3 (`...abca5d20a3f9a633a.md:135`) — там зафиксирован серверный
контракт и правило «новая фотография — новый ключ», и правится e2e-спека. Здесь — Android,
включая офлайн-ветку, которой в том плане нет.

**Дефект (проверен построчно).**
- Сервер требует ключ **безусловно**: `apps/api/src/courier/courier.controller.ts:92-97` зовёт
  `assertCourierOrderEvidence(dto.evidenceIdempotencyKey, courierId, id, 'Подтверждение доставки')`;
  `apps/api/src/courier/deliveries.controller.ts:43-48` — то же с меткой `'Неуспешная доставка'`.
  `apps/api/src/evidence/evidence.service.ts:189-190`: пустой ключ → `courier_evidence_required`.
- Android ключ **не шлёт**: `ApiClient.kt:277-289` (`completeDelivery`) кладёт в тело только
  `codAmount` и `reason`; `:291-299` (`failDelivery`) — только `reason`.
  `CourierGateway.kt:5-6` — в сигнатурах поля нет вовсе.
  `CourierOperationsScreens.kt:97-109` — `CourierCommandManager.deliver/fail` строят тело
  без ключа, и **именно это тело уходит в офлайн-очередь** (`OfflineQueueDb.enqueue`).
  Итог: курьер не может закрыть доставку ни онлайн, ни отложенной синхронизацией.
- **Метка на Android верна** — `CourierOperationsScreens.kt:405` шлёт ровно
  `"Подтверждение доставки"`, совпадает с `courier.controller.ts:95` посимвольно.
  Это отличие от iOS, где метка расходится. **Проверено, ничего менять не надо** — но
  нужен тест-якорь, иначе строка разъедется молча.
- Ключ **рождается и умирает внутри метода**: `ApiClient.kt:403-412`
  `uploadEvidenceRequest(..., idempotencyKey: String = UUID.randomUUID().toString())`
  ставит заголовок `Idempotency-Key` (`:419`) и возвращает
  `EvidenceAttachment(key, url)` (`Models.kt:413`) — **без** самого idempotency-ключа.
  Вызывающий физически не может узнать, что послать в `/deliver`.
  `uploadStaffEvidence` (`ApiClient.kt:394-401`) параметра ключа не имеет.
- Метка `'Неуспешная доставка'` на Android **не отправляется никогда**: `CourierEvidencePicker`
  (`CourierOperationsScreens.kt:400-406`) грузит только с меткой доставки, а кнопка
  «Не удалось доставить» (`:341-354`) Evidence не требует и не грузит.
  Проверено грепом: строка встречается только в `apps/api/src/courier/deliveries.controller.ts:47`,
  `apps/web/app/courier/page.tsx:345` и `apps/api/test/courier-print-rbac.e2e-spec.ts:213`.
  На Android и iOS её нет вовсе.
- **Офлайн-доставка умирает молча — проверено чтением воркера.**
  `ApiClient.sendResponse` (`:448-462`) отправляет `mutation.body` **дословно** (`:455`),
  то есть исправленное тело доедет через очередь без дополнительных правок — это хорошая
  новость. Плохая: `CourierSyncWorker.kt:24` при `status == 422` ставит мутации состояние
  `"conflict"`, а `OfflineQueueDb.pending()` (`:60-64`) состояние `conflict` из выборки
  **исключает**. Сегодняшний сервер отвечает на deliver без ключа именно 422
  (`evidence.service.ts:190` → `courier_evidence_required`). Значит каждая отложенная
  доставка после первой же синхронизации уходит в состояние, из которого её ничто
  не достаёт и никто о ней не узнаёт. Срез обязан покрыть это тестом (см. acceptance п. 6).

**Acceptance (пишется первым)**

1. `apps/android/core/src/test/java/kg/alistore/core/CourierCommandManagerTest.kt` —
   дописать в существующий класс, по форме тестов `:12-35`:
   - `deliver puts evidenceIdempotencyKey into the queued body()` —
     `manager.deliver("order-1", 2500, null, "ev-key-1", "staff-token", "delivery-key")`,
     затем `assertEquals("ev-key-1", JSONObject(queue.body!!).getString("evidenceIdempotencyKey"))`.
     **Не компилируется до правки** — параметра нет.
   - `fail puts evidenceIdempotencyKey into the queued body()` — то же для `/fail`.
   - `queued deliver body carries codAmount reason and evidence key together()` — все три поля
     в одном теле (офлайн-реплей должен пройти серверный барьер).
2. `apps/android/core/src/test/java/kg/alistore/core/CourierEvidenceLabelTest.kt` (новый) —
   тест-якорь на строки:
   - `assertEquals("Подтверждение доставки", CourierEvidenceLabel.DELIVERED)`
   - `assertEquals("Неуспешная доставка", CourierEvidenceLabel.FAILED)`
   Зачем: если кто-то поправит строку, она разъедется с `courier.controller.ts:95` /
   `deliveries.controller.ts:46` **громко**, а не тихим 422 у курьера на улице.
3. `apps/android/core/src/androidTest/java/kg/alistore/core/CourierEvidenceTicketTest.kt`
   (новый, инструментальный — `OfflineQueueDb` это `SQLiteOpenHelper`):
   - `ticketIsReusedForTheSameOrderAndLabel()` — дважды `readTicket("order-1", DELIVERED)`
     даёт один ключ.
   - `ticketRotatesWhenANewPhotoIsUploaded()` — после `saveTicket` с новым ключом
     старый не возвращается.
   - `ticketSurvivesReopeningTheDatabase()` — закрыть/открыть helper, ключ на месте.
   - `upgradeFromVersion2CreatesTheTicketTable()` — создать БД версии 2, открыть версией 3,
     утверждать, что таблица есть и старые `pending_mutation` целы. **Это единственный
     тест, который ловит забытый `onUpgrade`.**
4. `apps/android/core/src/androidTest/java/kg/alistore/core/CourierOperationsScreenTest.kt`
   (новый либо дополнение к `CourierAppScreenTest.kt`, Compose):
   - `deliverButtonIsDisabledUntilEvidenceIsUploaded()` —
     `onNodeWithTag("courier-deliver").assertIsNotEnabled()` пока фото не загружено;
     после успешной загрузки через фейковый gateway — `assertIsEnabled()`.
   - `failButtonIsDisabledUntilFailureEvidenceIsUploaded()`.
   Для этого кнопкам `:332` и `:342` нужны `testTag("courier-deliver")` / `("courier-fail")` —
   их сегодня нет, добавить в этом же срезе.
6. `apps/android/core/src/androidTest/java/kg/alistore/core/CourierQueueReplayTest.kt`
   (новый) — ловит молчаливую смерть отложенной доставки:
   - `replayedDeliveryBodyStillCarriesTheEvidenceKey()` — положить мутацию через
     `CourierCommandManager.deliver` (офлайн-ветка), прочитать `queue.pending().first().body`,
     утверждать наличие `evidenceIdempotencyKey`. Это доказывает, что `sendResponse` (`:455`)
     отправит дословно то, что нужно.
   - `conflictStateIsVisibleToTheCourier()` — мутация в состоянии `"conflict"` обязана быть
     доступна через `queue.pending(includeConflicts = true)` **и** отражаться в интерфейсе.
     Сегодня 422 отправляет доставку в `conflict`, откуда её ничто не достаёт
     (`OfflineQueueDb.pending()` `:60-64` фильтрует `state != 'conflict'`).
     Минимум этого среза — не молчать: показать курьеру счётчик застрявших команд.
     **Полноценный разбор конфликтов офлайн-очереди в этот срез не входит** —
     он записан в BACKLOG как `AUDIT-OPEN-006` («статус `syncing` — могила»).
7. **Статический барьер** `scripts/validate-courier-evidence-contract.mjs` (новый, по образцу
   `validate-deeplink-contract.mjs`). Точные места меток **проверены грепом**, гадать не нужно:
   ```js
   const delivered = 'Подтверждение доставки';
   const failed = 'Неуспешная доставка';
   requireText('apps/api/src/courier/courier.controller.ts', delivered);       // строка 96
   requireText('apps/api/src/courier/deliveries.controller.ts', failed);       // строка 47
   requireText('apps/web/app/courier/page.tsx', delivered);                    // строка 307
   requireText('apps/web/app/courier/page.tsx', failed);                       // строка 345
   requireText('apps/android/core/src/main/java/kg/alistore/core/CourierEvidenceLabels.kt', delivered);
   requireText('apps/android/core/src/main/java/kg/alistore/core/CourierEvidenceLabels.kt', failed);
   // iOS добавляется барьером ПОСЛЕ iOS Среза 3 — сегодня в apps/ios обеих строк НЕТ (проверено грепом).
   ```
   Шаг в `.github/workflows/ci.yml` рядом со строкой `:66`.
   **Внимание:** iOS-строку в барьер добавлять только после того, как iOS Срез 3 её создаст,
   иначе барьер приедет красным и его отключат.

**Файлы**

- `apps/android/core/src/main/java/kg/alistore/core/CourierEvidenceLabels.kt` (новый):
  ```kotlin
  /** Метки Evidence, которые сервер сверяет побайтово:
   *  apps/api/src/courier/courier.controller.ts:95 и
   *  apps/api/src/courier/deliveries.controller.ts:46. */
  object CourierEvidenceLabel {
    const val DELIVERED = "Подтверждение доставки"
    const val FAILED = "Неуспешная доставка"
  }
  ```
  Затем заменить литерал в `CourierOperationsScreens.kt:405` на `CourierEvidenceLabel.DELIVERED`.
- `apps/android/core/src/main/java/kg/alistore/core/CourierGateway.kt:5-6` —
  `completeDelivery` и `failDelivery` получают `evidenceIdempotencyKey: String`
  (**не** nullable: сервер без него всегда отвергает, `String?` только вернёт дефект).
- `apps/android/core/src/main/java/kg/alistore/core/ApiClient.kt:277-289` — в тело
  `completeDelivery` добавить `.put("evidenceIdempotencyKey", evidenceIdempotencyKey)`.
- `ApiClient.kt:291-299` — то же для `failDelivery`.
- `ApiClient.kt:394-401` `uploadStaffEvidence` — добавить параметр `idempotencyKey: String`
  и пробросить в `uploadEvidenceRequest`; убрать дефолт `= UUID.randomUUID().toString()`
  в `uploadEvidenceRequest` (`:412`), чтобы ключ нельзя было потерять молча.
  Остальные вызовы (`ApiClient.kt:374-391` — клиентские) передают явный
  `UUID.randomUUID().toString()` в месте вызова, логику не расширять.
- `apps/android/core/src/main/java/kg/alistore/core/StaffScannerScreen.kt:69-76` —
  интерфейс `StaffEvidenceGateway.uploadStaffEvidence` получает тот же параметр;
  вызов `:206` передаёт свежий UUID.
- `apps/android/core/src/main/java/kg/alistore/core/OfflineQueueDb.kt:12` — версия
  `SQLiteOpenHelper` **2 → 3**; в `onCreate` (`:15`) и в `onUpgrade` (`:30`) при
  `oldVersion < 3` создать:
  ```sql
  CREATE TABLE courier_evidence_ticket (
    order_id TEXT NOT NULL,
    label TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    uploaded_at INTEGER NOT NULL,
    PRIMARY KEY (order_id, label)
  )
  ```
  плюс методы `saveTicket(orderId, label, key)` (`insertWithOnConflict … CONFLICT_REPLACE`)
  и `readTicket(orderId, label): String?`.
  **Создание обязано быть в обеих ветках** — иначе установленные сборки уйдут в
  `no such table` при первой доставке.
- `apps/android/core/src/main/java/kg/alistore/core/CourierOperationsScreens.kt:97-109` —
  `CourierCommandManager.deliver/fail` получают `evidenceIdempotencyKey: String` и кладут
  его в `body` **до** `submit(...)`, чтобы тело ушло в очередь уже полным.
- `CourierOperationsScreens.kt:363-417` `CourierEvidencePicker` — при загрузке
  порождать ключ **на месте** (`val key = UUID.randomUUID().toString()`), передавать его в
  `uploadStaffEvidence`, при успехе класть в `courier_evidence_ticket` и поднимать наверх
  через новый колбэк `onUploaded: (String) -> Unit`. Метка передаётся параметром
  (`label: String`), чтобы тем же компонентом снимать и фото неудачи.
- `CourierOperationsScreens.kt:314` — вызов пикера получает `CourierEvidenceLabel.DELIVERED`
  и колбэк; рядом с кнопкой «Не удалось доставить» (`:341`) добавить **второй** пикер с
  `CourierEvidenceLabel.FAILED`.
- `CourierOperationsScreens.kt:332` и `:342` — кнопки «Доставлено» и «Не удалось доставить»
  становятся `enabled` только при непустом тикете соответствующей метки; добавить
  `testTag("courier-deliver")` / `("courier-fail")` и подпись
  «Фото доставки обязательно» / «Фото неудачи обязательно», когда тикета нет.
- `apps/android/core/src/main/java/kg/alistore/core/CourierSyncWorker.kt:24` — **проверено:
  тело реплеится дословно** (`ApiClient.sendResponse:455`), правок для передачи ключа
  не требуется. Но добавить видимость застрявших команд: после цикла посчитать
  `queue.pending(includeConflicts = true).count { it.state == "conflict" }` и отдать это число
  в UI (простейший канал — `SharedPreferences`, откуда `CourierOperationsScreens` читает
  и показывает бейдж «Застряло: N»). Без этого 422-ветка (`:24`) остаётся немой.

**Переиспользовать**
- `apps/web/app/courier/page.tsx:296-320` (deliver) и `:331-350` (fail) — **эталон порядка**:
  сначала загрузка Evidence, потом команда с ключом. Web трогать нельзя, он уже верен.
- `RecordingQueue` (`CourierCommandManagerTest.kt:49-61`) — готовый фейк очереди.
- `OfflineQueueDb.onUpgrade` (`:30-37`) — образец миграции внутри helper'а, уже написанный
  для версии 2.
- `StaffEvidenceDraft` и `courierEvidenceDraft()` (`CourierOperationsScreens.kt:419-423`) —
  снятие и сжатие фото уже реализовано.

**НЕ делать в этом срезе:** не класть **фото** в офлайн-очередь (сервер не примет deliver
без загруженного Evidence — очередь фото это отдельная задача); не менять серверный контракт;
не трогать web; не менять `EvidenceAttachment` (`Models.kt:413`) — ключ хранится в тикете,
а не в ответе; не трогать `uploadEvidence`/`uploadEvidenceWithKey` клиентской ветки
(`ApiClient.kt:374-391`) сверх добавления явного ключа.

**Проверка:** `npm run android:test` → `:core:connectedDebugAndroidTest` →
`node scripts/validate-courier-evidence-contract.mjs`.
Сквозная: `npm run ecosystem:courier-cod:e2e` (после того, как iOS Срез 3 починит
`e2e/ecosystem-courier-cod.spec.ts:137-138` — сегодня спека шлёт `/deliver` без ключа
и, по разбору истории git в iOS-плане, уже красная).

---

### Срез A0 — Деньги: дельта к уже написанному плану

**Зависит от:** срезов 2, 3, 4 плана `...a86fded859c891f14.md`. Делается **после** них,
как проверочный проход.

**Это не новый план формул.** Округление, split-tender и жизненный цикл `activeSaleId`
на Android описаны там построчно (см. п. 0.3). Здесь — только то, чего в нём нет и что
я нашёл при чтении `PosOperationsScreens.kt`.

**Находка: скидка и split-cash не сбрасываются после чека.**
`PosOperationsScreens.kt:327` в ветке `Completed` чистит
`cart`, `selectedImeis`, `approvalId` и ротирует `activeSaleId` — но **не** `discount`
(`:190-ish`, поле «Скидка, %», `:305`) и **не** `splitCash` (`:309`).
Следующий покупатель получает скидку предыдущего молча: `pct` остаётся, `total` считается
с ней, тендеры уходят с ней, сервер её принимает — это законная скидка по контракту.
Кассир видит уже применённую цифру в поле, но при быстрой работе на неё не смотрит.
В плане `...a86fded859c891f14.md` таблица жизненного цикла (Срез 4) перечисляет ключ и
корзину; про `discount`/`splitCash` там ничего нет. На iOS то же поведение —
`POSSaleView.swift` держит их в `@State` и в ветке `.completed` не трогает.

**Acceptance (пишется первым)**

`apps/android/core/src/test/java/kg/alistore/core/PosReceiptResetTest.kt` (новый) — против
чистой функции, а не UI:
- `completedSaleResetsDiscountAndSplitCash()` — `PosReceiptState.afterCompleted(previous)`
  возвращает состояние с `discountPct == 0`, `splitCash == 0`, пустой корзиной и **новым**
  `activeSaleId`.
- `queuedSaleResetsTheSameFields()` — то же для офлайн-постановки (согласовано со Срезом 4
  того плана: офлайн-ветка ведёт себя как успех).
- `approvalRequiredKeepsDiscountAndSplitCash()` — при `ApprovalRequired` скидка и split
  сохраняются: чек тот же, кассир ждёт одобрения именно этой скидки.

**Файлы**
- `apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt:327` — добавить
  `discount = ""; splitCash = ""` в ветку `Completed`.
- `PosOperationsScreens.kt` ветка `Queued` (`:322`) — тот же сброс (после того, как Срез 4
  того плана добавит туда очистку корзины и ротацию ключа).
- Состояние чека вынести в чистую `data class PosReceiptState` рядом с `PosSaleManager`
  (`:82`), чтобы сброс был тестируем без Compose. Если Срез 4 того плана уже перенёс это
  в `SharedPreferences("alistore-pos-flow")` — добавлять поля туда же, отдельного хранилища
  не заводить.

**Переиспользовать**
- `PosSaleManager` (`PosOperationsScreens.kt:82-93`) — готовая форма «логика вне UI».
- `PosRecordingQueue` (`PosSaleManagerTest.kt:64-72`).

**НЕ делать в этом срезе:** не переписывать формулу округления и split (они уже
спланированы); не менять сервер; не трогать `scannerCode` и `method` — метод оплаты
кассир осознанно держит выбранным между чеками, скидку — нет.

**Проверка:** `npm run android:test`, `npm run ios:test` (парность сброса), затем
`node scripts/check-pos-golden-parity.mjs` — сторож из Среза 2 того плана.

---

### Срез A6 — Ловушки в чеклисте владельца: пути ведут в мёртвый пакет

**Зависит от:** ничего. Дешевле и срочнее всего остального — стоит 20 минут, экономит
владельцу вечер отладки непонятной ошибки сборки.

**Дефект (проверен построчно и `git check-ignore`).**
`docs/OWNER-LAUNCH-CHECKLIST.md:229-233` велит:
> скачать `google-services.json` → положить в **`apps/mobile/google-services.json`**
> (путь покрыт `.gitignore`; проверка: `git check-ignore apps/mobile/google-services.json`)

`apps/mobile` — **мёртвый Expo-монолит**. Его `package.json:3` прямо помечен
`DEPRECATED (legacy reference)`, все релизные скрипты выведены через
`scripts/legacy-expo-retired.mjs`, который печатает отказ и `exit 1`.
Файл, положенный туда, ни одной Android-сборкой не читается.

Куда его читают на самом деле — из gradle, посимвольно:
- `apps/android/app/build.gradle.kts:7` — `val firebaseConfigured = file("google-services.json").isFile`,
  `:8` — `if (firebaseConfigured) apply(plugin = "com.google.gms.google-services")`,
  `:11` — `require(!releaseRequested || firebaseConfigured) { "Client Release requires apps/android/app/google-services.json" }`.
- `apps/android/staff/build.gradle.kts:4-7` — то же, сообщение `"Staff Release requires apps/android/staff/google-services.json"`.
- `apps/android/courier/build.gradle.kts:4-7` — то же, `"Courier Release requires apps/android/courier/google-services.json"`.
- `apps/android/pos/build.gradle.kts` — **Firebase не подключён вообще** (ни `firebaseConfigured`,
  ни google-services). POS push не получает. Значит нужны **три** файла, а не четыре.

Владелец, выполнивший чеклист буквально, получит:
`Client Release requires apps/android/app/google-services.json` — сообщение верное,
но чеклист прямо перед этим сказал класть файл в другое место. Плюс отладка усложняется тем,
что **debug-сборка проходит** (`require` срабатывает только при `releaseRequested`,
`build.gradle.kts:6`), — то есть проблема всплывёт на самом последнем шаге.

`git check-ignore` для всех пяти путей возвращает IGNORED (`.gitignore:31` — правило
`google-services.json` без пути), так что перенос безопасен.

Тот же дефект рядом, тем же лечится:
- `OWNER-LAUNCH-CHECKLIST.md:194` — `AuthKey_<KEYID>.p8` в `apps/mobile/`.
  Реально читается из `apps/ios/.env.production` → `ASC_API_KEY_PATH`
  (`apps/ios/.env.production.example:7` указывает на `~/.appstoreconnect/private_keys/`).
- `OWNER-LAUNCH-CHECKLIST.md:212` — `apps/mobile/google-service-account-<имя>.json`.
  Единственный, кто его читает, — `apps/mobile/eas.json` submit-профиль, то есть мёртвый
  пакет (срез A7).
- `OWNER-LAUNCH-CHECKLIST.md:234` — `GoogleService-Info.plist` в `apps/mobile/`.
  Проверить грепом, откуда его читает `apps/ios/project.yml`, и поправить туда же.

**Acceptance (пишется первым)**

Документ тестом не покрыть, поэтому — **статический барьер**, ровно по образцу
`scripts/validate-deeplink-contract.mjs`. Новый `scripts/validate-owner-checklist-paths.mjs`:
```js
// Чеклист не должен отправлять владельца в мёртвый Expo-пакет.
const checklist = read('docs/OWNER-LAUNCH-CHECKLIST.md');
if (/apps\/mobile\//.test(checklist)) failures.push('OWNER-LAUNCH-CHECKLIST.md ссылается на apps/mobile — мёртвый Expo-пакет');
// Три модуля, которым google-services.json реально нужен (pos — без Firebase).
for (const module of ['app', 'staff', 'courier']) {
  requireText('docs/OWNER-LAUNCH-CHECKLIST.md', `apps/android/${module}/google-services.json`);
  requireText(`apps/android/${module}/build.gradle.kts`, 'google-services.json');
}
// POS Firebase не использует — чеклист не должен требовать для него файл.
if (checklist.includes('apps/android/pos/google-services.json')) {
  failures.push('POS не использует Firebase (apps/android/pos/build.gradle.kts) — файл для него не нужен');
}
```
Скрипт `"android:checklist-preflight"` в корневом `package.json` рядом с `"android:store-preflight"`
(строка 30) и шаг в `.github/workflows/ci.yml` рядом со строкой `:66`.
**Барьер обязателен, а не желателен:** без него правка документа снова разъедется с gradle
при следующем рефакторинге модулей, и поймать это будет нечем — Android в пайплайне нет (п. 0.2).

RED-шаг: написать барьер, запустить на текущем HEAD, убедиться, что он **красный** и
называет строки 194/212/229-234. Только потом править документ.

**Файлы**
- `docs/OWNER-LAUNCH-CHECKLIST.md:229-233` — заменить один пункт на три, по одному на модуль,
  с точными путями `apps/android/app|staff|courier/google-services.json` и явной оговоркой,
  что для `kg.alistore.pos` файл **не нужен** (Firebase в модуле не подключён).
  Проверку заменить на `git check-ignore apps/android/app/google-services.json`.
- `docs/OWNER-LAUNCH-CHECKLIST.md:194` — путь `.p8` заменить на тот, что читает
  `apps/ios/scripts/store-preflight.sh` через `ASC_API_KEY_PATH`.
- `docs/OWNER-LAUNCH-CHECKLIST.md:212` — пункт про `google-service-account.json` пометить
  как относящийся к выведенному из эксплуатации `eas submit` и переписать под ручную
  загрузку AAB в Play Console (см. срез A7).
- `docs/OWNER-LAUNCH-CHECKLIST.md:234` — путь `GoogleService-Info.plist` привести к тому,
  что читает `apps/ios/project.yml`.

**Переиспользовать**
- `scripts/validate-deeplink-contract.mjs` — шаблон.
- Сообщения `require { ... }` в трёх `build.gradle.kts` — они уже содержат правильные пути,
  цитировать их в чеклисте дословно.

**НЕ делать в этом срезе:** не удалять `apps/mobile` (это `GAP-EXPO-RETIRE-001` в BACKLOG,
отдельный срез); не менять `.gitignore` (правило `google-services.json` уже покрывает все
пути); не трогать `eas.json` (срез A7); не переписывать чеклист сверх четырёх перечисленных
пунктов.

**Проверка:** `node scripts/validate-owner-checklist-paths.mjs` (должен позеленеть) →
`git check-ignore apps/android/app/google-services.json apps/android/staff/google-services.json apps/android/courier/google-services.json`
(все три IGNORED — проверено, работает).

---

### Срез A7 — `ALISTORE_API_BASE_URL` зафиксирован, `eas submit` обезврежен

**Зависит от:** среза A6 (чеклист правится один раз, чтобы не было двух коммитов в один файл).

**Дефект 1: адрес API нигде не зафиксирован для Android.**
Все четыре модуля читают gradle-свойство:
`app/build.gradle.kts:6`, `staff:2`, `courier:2`, `pos:2` —
`providers.gradleProperty("ALISTORE_API_BASE_URL").orElse("")`, с проверкой
`require(!releaseRequested || releaseApiBaseUrl.startsWith("https://")) { "Release requires -PALISTORE_API_BASE_URL=https://..." }`.
Это **gradle-property**, а не переменная окружения — то есть передаётся как
`./gradlew :app:assembleRelease -PALISTORE_API_BASE_URL=https://api.ali.kg/api`
либо строкой в `gradle.properties` / `~/.gradle/gradle.properties`.

У iOS для того же значения есть образец файла — `apps/ios/.env.production.example`
(`ALISTORE_API_BASE_URL=https://api.ali.kg/api`) и runbook
`apps/ios/store/release-runbook.md:12`. У Android **нет ничего**: грep по `*.md`, `*.yml`,
`*.json`, `*.mjs`, `*.sh`, `*.properties` даёт только упоминания в `PROGRESS.md`/`BACKLOG.md`
(история) и iOS-файлы. Ни в `apps/android/gradle.properties`, ни в чеклисте, ни в скрипте
имени `ALISTORE_API_BASE_URL` нет.
Последствие: релизная сборка Android либо не соберётся с непонятным `require`-сообщением,
либо (при опечатке в значении) соберётся и уедет в стор с чужим адресом. Проверять нечем.

**Дефект 2: мёртвый пакет сохраняет рабочий submit-профиль.**
`apps/mobile/eas.json:33-43`:
```json
"submit": { "production": { "android": {
  "serviceAccountKeyPath": "./google-service-account.json",
  "track": "internal", "releaseStatus": "draft" } } }
```
Корневые npm-скрипты `eas:submit:*` уже перехвачены `scripts/legacy-expo-retired.mjs`
(проверено: печатает отказ, `exit 1`, и в шапке файла прямо написано «один запуск eas:submit
отправит в сторы устаревшее приложение»). Но `eas.json` сам по себе цел: прямой
`cd apps/mobile && eas submit --profile production --platform android` профиль найдёт и
отработает. `app.json` и `store.config.json` на месте, `updates.enabled` включён.
Скрипт-заглушка защищает только npm-путь, не сам инструмент.

**Acceptance (пишется первым)**

Расширить `scripts/validate-owner-checklist-paths.mjs` из среза A6 (не заводить третий
барьер — он про то же: конфигурация, которая врёт):
- `ALISTORE_API_BASE_URL` обязан упоминаться в `apps/android/gradle.properties.example`
  **и** в `docs/OWNER-LAUNCH-CHECKLIST.md`.
- В `apps/android/gradle.properties.example` значение обязано начинаться с `https://`
  и **не** быть реальным доменом-заглушкой без пометки (иначе кто-нибудь соберёт релиз
  с примером).
- `apps/mobile/eas.json` **не должен** содержать `"submit"` — либо, если владелец хочет
  сохранить файл для археологии, обязан содержать строку-маркер
  `"_retired": "GAP-EXPO-RETIRE-001"`. Выбрать первое (удалить блок) — маркер не мешает
  `eas submit` работать.

RED-шаг: прогнать барьер на текущем HEAD, убедиться, что он красный по всем трём пунктам.

**Файлы**
- `apps/android/gradle.properties.example` (новый) — зеркало `apps/ios/.env.production.example`
  по форме и по тону:
  ```properties
  # ЭТО ПРИМЕР. Не редактировать apps/android/gradle.properties — он в git и общий для проекта.
  # Значение передавать одним из двух способов:
  #   1) флагом сборки:  ./gradlew :app:bundleRelease -PALISTORE_API_BASE_URL=https://api.ali.kg/api
  #   2) в пользовательском ~/.gradle/gradle.properties (вне репозитория)
  # Читается: apps/android/{staff,courier,pos}/build.gradle.kts строка 2, apps/android/app/build.gradle.kts строка 6.
  # Release-сборка падает без него: "Release requires -PALISTORE_API_BASE_URL=https://..."
  ALISTORE_API_BASE_URL=https://api.ali.kg/api
  ```
- **`.gitignore` не трогать — вопрос решён проверкой.** `git ls-files apps/android/gradle.properties`
  подтверждает: файл **отслеживается** и содержит только общие настройки Gradle
  (`org.gradle.jvmargs`, `caching`, `configuration-cache`, `useAndroidX`, `kotlin.code.style`,
  `nonTransitiveRClass`). Класть туда секрет-подобное значение нельзя — оно уедет в git.
  `local.properties` тоже не подходит: `providers.gradleProperty()` его **не читает**
  (AGP берёт оттуда только `sdk.dir`).
  Поэтому единственные два законных места, и оба документируются в примере:
  1. флаг сборки `-PALISTORE_API_BASE_URL=https://…` (рекомендуемый — не оставляет следа);
  2. пользовательский `~/.gradle/gradle.properties` (вне репозитория).
  Файл `apps/android/gradle.properties.example` — **документация, а не рабочий конфиг**;
  он отслеживается git'ом намеренно и содержит пример-заглушку.
- `docs/OWNER-LAUNCH-CHECKLIST.md`, раздел 4 (сборки) — добавить пункт с точной командой
  релизной сборки Android:
  ```
  cd apps/android && JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
    ./gradlew :app:bundleRelease -PALISTORE_API_BASE_URL=https://api.ali.kg/api
  ```
  и оговоркой, что `JAVA_HOME` обязателен (системного `java` на машине нет — проверено).
- `apps/mobile/eas.json:32-43` — удалить блок `"submit"` целиком.
- `apps/mobile/README.md` — одна строка: submit-профиль удалён намеренно, релиз идёт из
  `apps/android` / `apps/ios`, восстановление профиля = отправка мёртвого монолита в стор.
- `scripts/legacy-expo-retired.mjs` — шапку не трогать, она уже верна.

**Переиспользовать**
- `apps/ios/.env.production.example` — форма и тон файла-примера.
- `apps/ios/store/release-runbook.md:12,56` — образец «как экспортировать значение перед сборкой».
- `scripts/legacy-expo-retired.mjs` — уже написанное объяснение, почему пакет мёртв; цитировать,
  не переписывать.

**НЕ делать в этом срезе:** не удалять `apps/mobile` целиком; не заводить Android-workflow
в CI (отдельное решение владельца); не хардкодить реальный домен в `build.gradle.kts`;
не трогать `buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000/api\"")`
для debug (`app/build.gradle.kts:24`) — это правильный адрес эмулятора.

**Проверка:** `node scripts/validate-owner-checklist-paths.mjs` →
`cd apps/android && JAVA_HOME=... ./gradlew :app:assembleDebug` (debug не должен требовать
свойство) → **не запускать** `assembleRelease` без подписи, достаточно
`./gradlew :app:assembleRelease --dry-run` для проверки, что `require` не срабатывает
при переданном `-P`.

---

## Что на Android уже лучше, чем на iOS — не сломать при выравнивании

Проверено чтением обеих реализаций. Выравнивание идёт **в сторону Android**, а не наоборот.

### 1. Хеш PIN: HMAC-SHA256 ключом из AndroidKeyStore против голого SHA256 — **подтверждаю**

| | Android `QuickUnlock.kt` | iOS `QuickUnlock.swift` |
|---|---|---|
| Функция | `Mac.getInstance("HmacSHA256")` с ключом из KeyStore (`:111-115`) | `SHA256.hash(Data((salt + pin).utf8))` (`:82`) |
| Ключ | `KeyGenerator.getInstance(KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore")`, `PURPOSE_SIGN` (`:120-121`) | ключа нет |
| Сравнение | `MessageDigest.isEqual(expected, hmac(...))` (`:86`) — **постоянного времени** | `expected == actual` (`:94`) — обычное сравнение строк |
| Хранилище | `SharedPreferences` MODE_PRIVATE (`:62`) | Keychain |

**Почему Android строго сильнее, несмотря на менее защищённое хранилище.** PIN — шесть
цифр, пространство 10⁶. Голый SHA256 с солью перебирается за миллисекунды **сразу после
того, как атакующий прочитал хранилище**: соль и хеш лежат вместе, ключа нет. На Android
перебор требует ключ HMAC, а он не экспортируется из KeyStore (на устройствах с
StrongBox/TEE — вообще не покидает железо). Прочитанные `SharedPreferences` дают атакующему
`v1:salt:digest` и ничего больше.
Дополнительно `MessageDigest.isEqual` снимает тайминговый канал, который у Swift-го `==`
на `String` есть.

**Правило для исполнителя:** в срезе A1 методы `hmac()` (`QuickUnlock.kt:111-115`),
`key()` (`:117-123`) и сравнение `MessageDigest.isEqual` (`:86`) **не трогать**.
Расщепление `savePin` касается только политики записи, не криптографии.
Формат `v1:salt:digest` сохранить — иначе установленные сборки потеряют настроенный PIN.

**Что подтянуть на iOS (не в этом плане, задача iOS-инженеру):** ключевой хеш
(`CryptoKit.HMAC<SHA256>` с ключом из Keychain с
`kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`, либо Secure Enclave) и
константное сравнение вместо `==` на `QuickUnlock.swift:94`.

### 2. Метка Evidence курьера уже верна — **подтверждаю**

`CourierOperationsScreens.kt:405` шлёт `"Подтверждение доставки"` — посимвольно совпадает
с `apps/api/src/courier/courier.controller.ts:95`. На iOS метка расходится (это чинит
iOS Срез 3). При выравнивании **строку на Android не переписывать под iOS-ю** — двигать
надо iOS. Срез A5 фиксирует это тест-якорем.

### 3. Логика продажи уже вынесена из UI

`PosSaleManager` (`PosOperationsScreens.kt:82-93`) — отдельный класс с внедрёнными
`PosGateway` и `MutationQueue`, покрытый юнит-тестами. На iOS та же логика заперта во
`View` (`POSSaleView.swift`), и план `...a86fded859c891f14.md` (Срез 4) прямо предписывает
делать iOS-й `POSSaleFlow` **зеркалом андроидного `PosSaleManager`**. Не сворачивать
`PosSaleManager` обратно в composable.

### 4. Офлайн-очередь падает громко, а не глотает

`OfflineQueueDb.enqueue` (`OfflineQueueDb.kt:42`) — `insertOrThrow` по `UNIQUE(idempotency_key)`.
Симптом уродливый (кассир видит текст SQLite-констрейнта), но **деньги не теряются**.
iOS-я `OfflinePOSQueue.enqueue` при том же условии делает `return` молча — вторая продажа
исчезает, а UI пишет «Продажа сохранена офлайн». При выравнивании (Срез 4 того плана)
семантика берётся андроидная — «то же тело → идемпотентно, другое тело → ошибка», —
а не iOS-я. Не заменять `insertOrThrow` на `insertWithOnConflict(CONFLICT_IGNORE)`.

### 5. `rememberSaveable` переживает смерть процесса

`PosOperationsScreens.kt:193` — `activeSaleId` в `rememberSaveable`, то есть выживает при
системном убийстве процесса. iOS-й `@State` (`POSSaleView.swift:20`) не выживает нигде.
Android хуже только в одном сценарии — свайп из switcher. Срез 4 того плана доводит обе
платформы до персистентного хранилища; при этом **не понижать** Android до `remember`.

⚠ **Исключение из пункта 5:** в `QuickUnlock.kt:136-139` тот же `rememberSaveable` —
дефект, а не достоинство (сохранённое `unlocked = true` пропускает мимо PIN после
смерти процесса, сохранённый `pin` пишет PIN на диск). Срез A1 меняет его на `remember`
**только там**. Не путать с POS.

---

## Чего не смог проверить

1. **Не запускал `npm run android:ui`** (`connectedDebugAndroidTest`). Эмулятор
   `emulator-5556` подключён и `adb devices` его видит, но прогон пяти модулей занимает
   десятки минут и занял бы устройство. Все утверждения «инструментальный тест возможен»
   выведены из наличия существующих `androidTest`-классов и подключённого устройства,
   а не из наблюдённого зелёного прогона. **Первое, что должен сделать исполнитель, —
   прогнать `:core:connectedDebugAndroidTest` на текущем HEAD и убедиться, что база зелёная,
   до написания новых инструментальных тестов.**
2. **`OfflineSyncWorker.kt` (клиент/POS) не читал.** `CourierSyncWorker.kt` прочитан целиком,
   `ApiClient.sendResponse` (`:448-462`) тоже — тело реплеится дословно, вопрос закрыт.
   Про `OfflineSyncWorker` то же **предполагается по аналогии**, не проверено; на срез A5
   не влияет (он про курьера).
3. **Не проверял, читает ли `apps/ios/project.yml` `GoogleService-Info.plist` и откуда.**
   Срез A6 требует поправить `OWNER-LAUNCH-CHECKLIST.md:234`, но правильный путь надо
   установить грепом.
4. **Не проверял релизную сборку Android** (`assembleRelease` / `bundleRelease`). Нет
   подписи, нет `google-services.json`, нет `ALISTORE_API_BASE_URL` — она заведомо упадёт.
   Утверждения про поведение `require(...)` выведены из чтения `build.gradle.kts`, а не
   из прогона. `--dry-run` тоже не запускал.
5. **Не проверял, красна ли `e2e/ecosystem-courier-cod.spec.ts` прямо сейчас.**
   iOS-план утверждает это по истории git (барьер `7e56e03` приехал позже правки спеки
   `ad51033`). Прогон требует поднятого API и Postgres — не запускал.
6. **Compose-тесты `apps/android/core/src/androidTest/` прочитал выборочно** —
   `StaffCustomer360ScreenTest.kt` целиком, остальные одиннадцать по именам и грепу.
   Если в них уже есть покрытие `QuickUnlockGate` или курьерских кнопок, новые тесты
   в срезах A1/A3/A5 надо дописывать в существующие классы, а не заводить новые файлы.
7. **Не проверял iOS-й `POSSaleView.swift` на предмет сброса `discount`/`splitCash`**
   (срез A0). Утверждение «на iOS то же поведение» сделано по аналогии со структурой
   `@State`, а не по чтению ветки `.completed`. Проверить перед тем, как называть это паритетом.
8. **Состояние рабочего дерева.** `git status` на момент написания чист, HEAD `32a67c0`.
   Но `CLAUDE.md` предупреждает, что дерево может параллельно править другой инструмент —
   перед каждым срезом сверяться `git status` заново; номера строк могли сдвинуться.

### Что успел проверить и снял с этого списка

- **Потребители `PinAttemptLimiter`** — только `QuickUnlock.kt:90,99` и
  `PinAttemptLimiterTest.kt`. Смена сигнатуры в срезе A2 безопасна (проверено грепом).
- **Реплей офлайн-очереди** — `ApiClient.sendResponse:455` шлёт `mutation.body` дословно;
  исправленное тело доедет без дополнительных правок (проверено чтением).
- **Места строк-меток Evidence** — установлены грепом, перечислены в acceptance среза A5 п. 7.
- **`apps/android/gradle.properties`** — отслеживается git'ом, содержит только общие
  настройки Gradle; решение для A7 принято окончательно (флаг `-P` либо `~/.gradle/`).
- **POS не использует Firebase** — `apps/android/pos/build.gradle.kts` не содержит ни
  `firebaseConfigured`, ни `google-services`; нужны три файла, а не четыре.

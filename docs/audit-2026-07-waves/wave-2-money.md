# План починки офлайн-денег (iOS / Android / API)

Все дефекты перепроверены чтением кода на `codex/open-source-integrations`. Ниже — план по TDD,
исполнимый без догадок. **Один срез = один коммит.** Правки в рабочем дереве уже есть
(`git status` в начале сессии) — перед каждым срезом сверяйся с `git status`, чужие правки не трогай.

## Что подтверждено измерением (а не чтением)

Расхождение округления скидки (2.3) проверено численно:

| gross | pct | сервер `Math.round(g*(1-p/100))` | iOS `g - g*p/100` (Int) | Android `g*(100-p)/100` (Int) |
|---|---|---|---|---|
| 4990 | 5 | **4741** | 4741 | **4740** |
| 4990 | 3 | **4840** | **4841** | 4840 |
| 333 | 10 | **300** | 300 | **299** |
| 1 | 50 | **1** | 1 | **0** |

Дополнительно: **порядок операций в Double тоже значим.** `Math.round(g*(1-p/100))` и
`Math.round(g*(100-p)/100)` расходятся в 38 120 случаях на сетке g∈[1,300000] × 13 значений pct
(например g=5,p=90 → 0 против 1). Значит клиенту нельзя «переписать формулу как удобно» —
порядок вычисления обязан совпасть посимвольно с `saleTotal`.

---

### Срез 1 — SwiftData: версия 1 задним числом + отказ вместо краша

**Зависит от:** ничего. **Должен быть первым:** срезы 4 и 6 добавляют поля в `PendingMutation`;
без плана миграции это ровно то «несовместимое изменение модели», от которого сейчас
`preconditionFailure` кладёт приложение на старте у всех, включая кассы с непроведёнными продажами.

**RED первым**
Файл: `apps/ios/Tests/OfflineStoreMigrationTests.swift` (новый).

1. `testVersionedSchemaV1MatchesTheUnversionedStoreShape()`
   Утверждает ДО реализации: `Schema(versionedSchema: OfflineSchemaV1.self).entities`
   поэлементно равна `Schema([PendingMutation.self]).entities` (сравнивать `name` и
   отсортированный список `properties.map(\.name)` каждой сущности).
   Это машинная проверка инварианта «версия 1 описывает ровно то, что уже лежит на устройствах».
2. `testCorruptStoreReturnsFailureInsteadOfTrapping()`
   Пишет мусорные байты в `tmp/<uuid>/offline.store`, вызывает
   `OfflineStore.makeContainer(url:)` и утверждает `.failure`. Сегодня такого API нет →
   тест не компилируется. **Это компиляционный RED, и он честно слабее рантайм-RED:**
   `preconditionFailure` — трап, XCTest его не ловит, поэтому рантайм-RED здесь невозможен
   в принципе. Зафиксируй это в комментарии над тестом.
3. `testExistingV0StoreSurvivesTheVersionedContainer()` — тест на реальном старом файле,
   см. «Фикстура» ниже. Утверждает: две строки `PendingMutation`, записанные кодом ДО среза,
   читаются после среза, `idempotencyKey` совпадают.

**Фикстура (сделать ДО правки кода, иначе фикстуру уже нечем породить)**
Создай временный тест `apps/ios/Tests/__TempStoreFixtureDump.swift` на текущем HEAD:
создаёт `ModelContainer(for: PendingMutation.self, configurations: ModelConfiguration(url: tmpURL))`,
вставляет две `PendingMutation` (`endpoint: "pos/sale"`, ключи `fixture-key-1`/`fixture-key-2`),
сохраняет, печатает путь. Запусти `npm run ios:test`, скопируй тройку `offline.store`,
`offline.store-shm`, `offline.store-wal` в `apps/ios/Tests/Fixtures/offline-v0/`, удали временный файл.
Контингенция: если `Bundle(for:).url(forResource:withExtension:subdirectory:)` вернёт `nil` —
добавь в `apps/ios/project.yml` в таргет `AliStoreCoreTests` (после `sources: Tests`) блок
`resources: [Tests/Fixtures]` и перегенерируй `npm run ios:generate`.

**Файлы**
- iOS новый `apps/ios/Shared/OfflineSchema.swift` (папка `Shared` = таргет `AliStoreCore`,
  xcodegen подхватит автоматически):
  ```swift
  public enum OfflineSchemaV1: VersionedSchema {
      public static var versionIdentifier: Schema.Version { Schema.Version(1, 0, 0) }
      public static var models: [any PersistentModel.Type] { [PendingMutation.self] }
  }
  public enum OfflineMigrationPlan: SchemaMigrationPlan {
      public static var schemas: [any VersionedSchema.Type] { [OfflineSchemaV1.self] }
      public static var stages: [MigrationStage] { [] }
  }
  ```
- iOS `apps/ios/Shared/OfflineQueue.swift:267-278` — `OfflineStore` целиком заменить:
  - `public static func makeContainer(url: URL? = nil) -> Result<ModelContainer, OfflineStoreFailure>`;
    внутри `ModelContainer(for: Schema(versionedSchema: OfflineSchemaV1.self), migrationPlan: OfflineMigrationPlan.self, configurations: url.map { ModelConfiguration(url: $0) } ?? ModelConfiguration())`;
    `catch` → `.failure(.init(underlying: error, storeURL: url))`. **Никакого `preconditionFailure`,
    никакого удаления файла.**
  - `public static func container() -> ModelContainer` — обёртка: `.success` → контейнер;
    `.failure` → записывает ошибку в `@MainActor public static private(set) var lastFailure` и
    возвращает **in-memory** контейнер (`ModelConfiguration(isStoredInMemoryOnly: true)`).
    Если и он не создаётся — только тогда `fatalError` (это уже баг сборки, не данные).
- iOS `apps/ios/POS/POSSaleView.swift:274-279` (ветка офлайна) — если
  `OfflineStore.lastFailure != nil`, НЕ ставить в очередь: `errorMessage = "Офлайн-очередь
  недоступна: <описание>. Не проводите продажи без сети — они не сохранятся. Позовите
  поддержку, файл базы не удалён."` Кнопка «Оплатить» при этом остаётся активной (онлайн-продажи
  работают), но плашка висит постоянно.
- iOS `apps/ios/POS/POSOperationsView.swift:16-20` (`POSOfflineView`) — над списком показать ту же
  плашку с `accessibilityIdentifier("pos-offline-store-failed")`.

**Паритет платформ**
Совпадать не обязаны: Android уже версионирует хранилище руками —
`OfflineQueueDb` наследует `SQLiteOpenHelper(..., version = 2)` с рабочим `onUpgrade`
(`apps/android/core/src/main/java/kg/alistore/core/OfflineQueueDb.kt:12,30-37`). Это и есть эталон
поведения: версия объявлена, апгрейд описан, данные не теряются. iOS догоняет Android, не наоборот.
Совпасть обязаны: правило «повреждённое хранилище не удаляем, офлайн-приём выключаем, кассиру
говорим прямым текстом» — на Android этой ветки сейчас нет вообще, но в этом срезе её НЕ добавляем
(см. «НЕ делать»).

**Переиспользовать**
- `apps/android/core/src/main/java/kg/alistore/core/OfflineQueueDb.kt:30-37` — образец
  «версия + явный onUpgrade».
- `apps/api/scripts/test-refund-migration-upgrade.mjs` (подключён в `scripts/mvp-verify.mjs:18`) —
  образец жанра «отдельный тест на то, что старое хранилище переживает новую схему».
  Тест №3 выше — его iOS-аналог.
- API `SchemaMigrationPlan` / `VersionedSchema` / `MigrationStage` — iOS 17+, проект уже на
  `deploymentTarget iOS: "17.0"` (`apps/ios/project.yml:5`), доступны без условной компиляции.

**Три запрета, каждый из которых молча ломает существующие хранилища**
1. **Не вкладывай** `PendingMutation` внутрь `OfflineSchemaV1` (стиль Apple-сэмплов).
   Вложение меняет имя типа на `OfflineSchemaV1.PendingMutation` → меняется имя сущности →
   старый store не открывается.
2. **Не переименовывай и не переноси** `PendingMutation` в другой файл/модуль и не трогай ни одно
   её свойство в этом срезе. V1 обязана быть посимвольной копией сегодняшней формы.
3. **Не задавай** `ModelConfiguration` с кастомным `name`/`url` в продакшн-пути — сменится имя
   файла, старые очереди осиротеют. Кастомный URL — только из тестов, через параметр.

**НЕ делать в этом срезе:** не добавлять поля в `PendingMutation` (это срезы 4 и 6);
не создавать V2 и `MigrationStage` — их сейчас неоткуда взять; не трогать Android;
не удалять и не переименовывать файл хранилища ни при каких ошибках.

**Проверка:** `npm run ios:test` (схема `AliStoreClient` → таргет `AliStoreCoreTests`),
`npm run ios:build`.

---

### Срез 2 — Округление скидки: сервер единственный оракул

**Зависит от:** ничего.

**RED первым**
Тест обязан сверять клиент с СЕРВЕРОМ, а не с ожиданием автора. Механика — золотая фикстура,
порождаемая сервером:

1. Генератор `apps/api/scripts/emit-pos-discount-golden.mjs` (новый): импортирует `saleTotal`
   из `apps/api/src/pos/margin-control.ts`, прогоняет матрицу
   `gross ∈ {1, 5, 75, 333, 4990, 24900, 45900, 109900, 299999}` × `pct ∈ {0,1,3,5,7,10,15,17,20,25,33,50,66,90,100}`
   и пишет `apps/api/test/fixtures/pos-discount-golden.json` — массив `{gross, discountPct, total}`.
   Матрица обязана содержать все четыре расхождения из таблицы выше.
   Скрипт в `apps/api/package.json` как `"pos:golden"` — рядом с существующими
   `test:*-migration-upgrade` (строки 17-23).
2. RED-тест сервера `apps/api/test/pos-discount-golden.spec.ts` (новый, без БД):
   читает фикстуру и для каждой строки утверждает `saleTotal([{price: gross, qty: 1}], discountPct) === total`.
   Падает, пока фикстуры нет. Это замок: фикстура не может разъехаться с сервером.
3. RED-тест iOS `apps/ios/Tests/POSDiscountParityTests.swift` (новый):
   `testDiscountTotalMatchesServerGolden()` — читает
   `apps/ios/Tests/Fixtures/pos-discount-golden.json` из бандла, для каждой строки утверждает
   `POSMoney.saleTotal(gross: row.gross, discountPct: row.discountPct) == row.total`.
   ДО реализации `POSMoney` нет → RED.
4. RED-тест Android `apps/android/core/src/test/java/kg/alistore/core/PosDiscountParityTest.kt` (новый):
   читает `/pos-discount-golden.json` через `javaClass.getResourceAsStream` (модуль `core` —
   `android.library`, `src/test/resources` — стандартный ресурс-рут JVM-тестов), утверждает
   `posSaleTotal(gross, pct) == total`.
5. Сторож копий `scripts/check-pos-golden-parity.mjs` (новый): три файла обязаны быть
   байт-идентичны, иначе exit 1. Вписать шагом в `scripts/mvp-verify.mjs` в массив `steps`
   сразу после строки 24 (`'Нет новых фикстур в ERP'`) — это единственный способ поймать дрейф
   копий, потому что мобильных шагов в `mvp:verify` и в CI нет намеренно
   (см. комментарий `scripts/mvp-verify.mjs:27-32`).

**Файлы**
- Сервер: `apps/api/src/pos/margin-control.ts:32-35` — **не менять**. Это эталон.
- iOS новый `apps/ios/Shared/POSMoney.swift`:
  ```swift
  public enum POSMoney {
      /// Зеркало apps/api/src/pos/margin-control.ts:34 — saleTotal().
      /// Порядок операций обязан совпадать: сначала (1 - pct/100), потом умножение.
      public static func saleTotal(gross: Int, discountPct: Int) -> Int {
          let pct = min(100, max(0, discountPct))
          return Int((Double(gross) * (1.0 - Double(pct) / 100.0)).rounded())
      }
  }
  ```
  `Double.rounded()` = `.toNearestOrAwayFromZero`; для gross ≥ 0 это ровно JS `Math.round`.
- iOS `apps/ios/POS/POSSaleView.swift:32` — заменить
  `private var total: Int { max(0, gross - gross * discountPct / 100) }`
  на `private var total: Int { POSMoney.saleTotal(gross: gross, discountPct: discountPct) }`.
- Android новый top-level в `apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt`
  (рядом с `PosSaleManager`, строка ~82) или в новом `PosMoney.kt`:
  ```kotlin
  fun posSaleTotal(gross: Int, discountPct: Int): Int {
    val pct = discountPct.coerceIn(0, 100)
    return Math.round(gross.toDouble() * (1.0 - pct.toDouble() / 100.0)).toInt()
  }
  ```
- Android `apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt:239` — заменить
  `val total = gross * (100 - pct) / 100` на `val total = posSaleTotal(gross, pct)`.

**Порядок операций — не косметика.** Писать именно `g * (1 - p/100)`, не `g * (100-p) / 100`.
Второй вариант расходится с сервером в 38 120 случаях (проверено численно, см. шапку).
Ревьюеру: это единственная строка, которую надо читать посимвольно.

**Паритет платформ**
Обязаны совпасть: iOS `POSMoney.saleTotal` ≡ Android `posSaleTotal` ≡ сервер `saleTotal` —
на всей золотой матрице, побитово. Расходятся сознательно: клиппинг `pct` в 0…100 на клиентах
(iOS `POSSaleView.swift:28`, Android `PosOperationsScreens.kt:238`) — на сервере валидация
делает `PosSaleDto`, дублировать её в `saleTotal` не надо.

**Переиспользовать**
- `apps/api/src/pos/margin-control.ts:31-35` — эталон округления (в шапке функции уже написано
  «pure, so the POS replay check reuses it»).
- `apps/api/src/pos/pos.service.ts:490-497` (`normalizePayments`) — источник 422
  `payment_split_mismatch`, который этот срез гасит.
- `apps/android/core/src/test/java/kg/alistore/core/CheckoutRequestParityTest.kt` — образец
  теста-паритета: чистые функции, точные числа, никакого UI.
- `apps/ios/Shared/POSReturnFlow.swift:3-8` — образец комментария-ссылки «зеркало серверного
  файла X, строка Y». Скопируй этот стиль в `POSMoney.swift`.

**НЕ делать в этом срезе:** не трогать split-логику (срез 3); не менять сервер; не переносить
округление в `POSSaleRequest` — оно нужно и для отображения «Итого», и для тендеров.

**Проверка:** `npm run pos:golden -w @alistore/api` → `cd apps/api && NODE_PATH=./node_modules npx jest --runInBand --testPathPattern pos-discount-golden` → `npm run ios:test` → `npm run android:test` → `node scripts/check-pos-golden-parity.mjs`.

---

### Срез 3 — Split-tender при `cash == total`

**Зависит от:** срез 2 (обе правки в одном `submit()`; при обратном порядке будет конфликт слияния
в `apps/ios/POS/POSSaleView.swift:225-236`).

**RED первым**
Тест сверяется с сервером не через golden-файл, а через сам серверный инвариант: сумма тендеров
обязана равняться `total` И метод обязан отражать то, что физически в ящике.

- iOS `apps/ios/Tests/POSTenderSplitTests.swift` (новый):
  - `testCashEqualToTotalProducesASingleCashTender()` — `POSMoney.tenders(total: 4741, splitCash: 4741, fallbackMethod: "card")`
    == `[POSTender(method: "cash", amount: 4741)]`. Сегодня весь чек уходит `card` → RED.
  - `testPartialCashSplitsIntoCashPlusFallback()` — `(total: 4741, splitCash: 1000, fallbackMethod: "card")`
    == `[cash 1000, card 3741]`.
  - `testZeroCashProducesASingleFallbackTender()` — `(total: 4741, splitCash: 0, fallbackMethod: "qr_mbank")`
    == `[qr_mbank 4741]`.
  - `testTendersAlwaysSumToTotal()` — по матрице `total ∈ {1, 4741, 109900}` × `splitCash ∈ {0,1,total-1,total,total+1}`
    утверждать `tenders.reduce(0){$0+$1.amount} == total`. Это ровно предикат
    `apps/api/src/pos/pos.service.ts:492` — 422 `payment_split_mismatch`.
  - `testCashSelectedAndFullCashDoesNotFabricateACardTender()` — `(total: 4741, splitCash: 4741, fallbackMethod: "cash")`
    == `[cash 4741]`, ровно один элемент.
- Android `apps/android/core/src/test/java/kg/alistore/core/PosTenderSplitTest.kt` — те же пять
  тестов против `posTenders(total, splitCash, fallbackMethod)`. Класть рядом с существующим
  `PosTenderOptionsTest.kt`.

**Файлы**
- iOS `apps/ios/POS/POSSaleView.swift:230-236` — три строки условия заменить на
  `let payments = POSMoney.tenders(total: total, splitCash: Int(splitCash) ?? 0, fallbackMethod: paymentMethod)`.
  Новая функция в `apps/ios/Shared/POSMoney.swift` (создан в срезе 2):
  ```swift
  public static func tenders(total: Int, splitCash: Int, fallbackMethod: String) -> [POSTender] {
      let cash = min(total, max(0, splitCash))
      if cash == 0 { return [POSTender(method: fallbackMethod, amount: total)] }
      if cash == total { return [POSTender(method: "cash", amount: total)] }
      let rest = fallbackMethod == "cash" ? "card" : fallbackMethod
      return [POSTender(method: "cash", amount: cash), POSTender(method: rest, amount: total - cash)]
  }
  ```
- Android `apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt:311-312` —
  `val cash = ...` и `val tenders = if (cash in 1 until total) ...` заменить на
  `val tenders = posTenders(total, splitCash.toIntOrNull() ?: 0, method)`;
  саму `posTenders` объявить рядом с `posSaleTotal`, тело — построчный перевод свифтового.

**Паритет платформ**
Обязаны совпасть полностью: тот же порядок элементов (`cash` первым), тот же fallback
`cash → card`, тот же клиппинг `0…total`. Расхождений быть не должно ни одного —
это единственная функция, чей выход напрямую сравнивается сервером с `total`.

**Переиспользовать**
- `apps/api/src/pos/pos.service.ts:487-503` (`normalizePayments`) — единственный источник правды
  о том, что сервер примет.
- `apps/ios/UITests/POS/AliStorePOSUITests.swift:50` уже утверждает
  `"Оплата: cash=10000, card=99900"` — этот UI-тест проходит и сейчас, потому что бьёт по
  DEBUG-ветке `POSSaleView.swift:248-265`, а не по `submit()`. **Он не покрывает дефект.**
  После правки добавь в него второй прогон: ввести в поле split полную сумму `109900` и
  утверждать `"Оплата: cash=109900"` без `card`.

**НЕ делать в этом срезе:** не трогать ротацию ключа (срез 4); не добавлять новые методы оплаты;
не менять `posTenderOptions`.

**Проверка:** `npm run ios:test`, `npm run android:test`, `npm run ios:ui`.

---

### Срез 4 — Жизненный цикл `activeSaleId` целиком

**Зависит от:** срез 1 (форма `PendingMutation` зафиксирована как V1 — теперь её можно менять
осознанно; в этом срезе всё ещё НЕ меняем), срезы 2 и 3 (иначе в очередь ложится уже неверное тело).

**Полный жизненный цикл — записан целиком, чтобы не осталось суждений**

| Событие | Ключ | Корзина | Что видит кассир |
|---|---|---|---|
| Открытие экрана, ключа в хранилище нет | родить UUID, записать | пустая | — |
| Открытие экрана, ключ в хранилище есть | **взять сохранённый** | восстановить из хранилища | «Незавершённый чек» |
| Добавление/удаление товара | не менять | меняется | — |
| Успех `.completed` | **ротировать** | очистить | чек с сервера |
| Ответ `.approvalRequired` | **не ротировать** | сохранить | «Требуется одобрение» |
| Успешная постановка в очередь (офлайн) | **ротировать** | очистить | «Сохранено офлайн · в очереди N» |
| Постановка в очередь упала (дубль ключа, другое тело) | не менять | сохранить | «Этот чек уже в очереди с другим составом» |
| Сеть/сервер 5xx онлайн | не менять | сохранить | ошибка + «в очереди N» |
| 409 `idempotency_key_reused` / `sale_key_burned` | **не ротировать автоматически** | сохранить | сообщение сервера + кнопка «Начать новый чек» |
| Нажата «Начать новый чек» | ротировать | **сохранить корзину** | — |
| Явная очистка корзины кассиром | ротировать | очистить | — |
| Убийство приложения | ключ и корзина переживают (персист) | — | «Незавершённый чек» |

Почему 409 не ротируем молча: `idempotency_key_reused` сервер бросает
(`apps/api/src/pos/pos.service.ts:450-452`) только когда состав отличается от сохранённого —
то есть текущая корзина точно НЕ продана, и авторотация была бы безопасна. Но `sale_key_burned`
(`:479-482`) прилетает и для `cancelled`, и для завершённых в других статусах. Одна кнопка на оба
кода — единственный вариант, при котором кассир видит, что произошло, а касса не встаёт.
Корзину при этом не чистим: кассиру не надо пересканировать десять IMEI.

Почему персистим ключ и корзину: сегодня `@State` (`POSSaleView.swift:20`) теряется при убийстве
приложения; Android чуть лучше — `rememberSaveable` (`PosOperationsScreens.kt:193`) переживает
системную смерть процесса, но не свайп из свитчера. После правки обе платформы ведут себя одинаково.

**Почему очередь сегодня теряет вторую продажу**
`OfflinePOSQueue.enqueue` (`apps/ios/Shared/OfflineQueue.swift:180-193`) при совпадении ключа
делает `if try !context.fetch(descriptor).isEmpty { return }` — молча. UI печатает «Продажа
сохранена офлайн» (`POSSaleView.swift:277`). Вторая продажа исчезает.
На Android симптом другой: `OfflineQueueDb.enqueue` (`OfflineQueueDb.kt:42`) — `insertOrThrow`
по `UNIQUE(idempotency_key)`, исключение всплывает в `runCatching{}.onFailure { message = it.message }`
(`PosOperationsScreens.kt:333`) и кассир видит текст SQLite-констрейнта. Деньги не теряются,
но касса встаёт. Обе ветки чинятся одной семантикой.

**RED первым**

Логика сейчас заперта во `View` — сначала выдели её (иначе тесты писать не на что).
Новый тип `apps/ios/Shared/POSSaleFlow.swift` — зеркало андроидного `PosSaleManager`
(`apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt:82-93`).

`apps/ios/Tests/POSSaleKeyLifecycleTests.swift` (новый):
1. `testOfflineEnqueueRotatesTheKeyAndClearsTheCart()` — прогнать `submit` с падающим
   транспортом (`URLError(.notConnectedToInternet)`), утверждать: в очереди 1 строка;
   `flow.activeSaleId` ≠ ключу этой строки; `flow.cart.isEmpty`.
2. `testTwoOfflineSalesProduceTwoQueueRowsWithDifferentKeys()` — **главный тест среза.**
   Две разные корзины подряд офлайн → 2 строки, ключи различны, тела различны.
   Сегодня будет 1 строка → RED.
3. `testEnqueuingTheIdenticalSaleTwiceIsIdempotent()` — та же корзина, тот же ключ, дважды →
   1 строка, ошибки нет (легальный ретрай, не должен ломаться).
4. `testEnqueuingADifferentCartUnderTheSameKeyThrows()` — тот же ключ, другой состав →
   бросает `OfflineQueueError.keyReusedWithDifferentPayload`, строка в очереди не перезаписана.
   Это клиентское зеркало серверного `idempotency_key_reused`.
5. `testApprovalRequiredKeepsTheKeyAndTheCart()` — ответ `.approvalRequired` → ключ тот же,
   корзина цела.
6. `testKeyAndCartSurviveAColdStart()` — создать `POSSaleFlow` поверх того же хранилища,
   утверждать, что ключ и состав корзины совпали с досмертными.
7. `testKeyBurnedConflictDoesNotRotateUntilTheCashierAsks()` — ответ 409 `sale_key_burned` →
   ключ не изменился, корзина цела, `flow.needsFreshReceipt == true`; после `flow.startFreshReceipt()`
   ключ сменился, корзина цела.

Android `apps/android/core/src/test/java/kg/alistore/core/PosSaleKeyLifecycleTest.kt` (новый) —
те же семь, против `PosSaleManager` + `OfflineQueueDb` на `Robolectric`? **Нет** — Robolectric в
зависимостях модуля нет (`apps/android/core/build.gradle.kts:42-44`). Вместо этого:
тесты 2/3/4 писать против фейкового `MutationQueue` с той же семантикой (образец —
`PosRecordingQueue` в `PosSaleManagerTest.kt:64-72`, расширь его до хранения `Map<key, body>`),
а поведение реального `OfflineQueueDb` покрыть инструментальным тестом
`apps/android/core/src/androidTest/java/kg/alistore/core/OfflineQueueDbTest.kt` (новый):
вставка того же ключа с тем же телом — идемпотентна; с другим телом — бросает
`DuplicateMutationException`.

**Чего существующие тесты не ловят — назови в описании коммита**
- `apps/android/core/src/test/java/kg/alistore/core/PosSaleManagerTest.kt:19-28` проверяет ровно
  одну постановку в очередь; второй продажи там нет.
- `apps/ios/UITests/POS/AliStorePOSUITests.swift:19-53` бьёт по DEBUG-ветке
  `POSSaleView.swift:248-265`, где ключ **уже** ротируется (строка 262). Реальную ветку
  `submit()` (`:267-279`) UI-тесты не трогают вовсе.
- Ни один тест не проверяет, что происходит после холодного старта с непустой очередью.

**Файлы**
- iOS новый `apps/ios/Shared/POSSaleFlow.swift` — `@MainActor @Observable final class POSSaleFlow`
  с полями `activeSaleId`, `cart`, `selectedIMEI`, `splitCash`, `approvalId`, `needsFreshReceipt`;
  методы `submit(products:shift:token:)`, `rotateKey()`, `startFreshReceipt()`, `clearCart()`.
  Персист ключа и корзины — `UserDefaults` под ключами
  `alistore.pos.activeSaleId` и `alistore.pos.cart` (JSON), запись при каждой мутации.
- iOS `apps/ios/POS/POSSaleView.swift` — `@State` строки 13/14/19/20/21 удалить, читать из
  `POSSaleFlow`; `submit()` (`:225-280`) свести к вызову `flow.submit(...)`;
  `consume(_:)` (`:282-297`) — ветка `.completed` перестаёт сама ротировать (это делает flow).
- iOS `apps/ios/Shared/OfflineQueue.swift:180-193` — `OfflinePOSQueue.enqueue`:
  вместо `if try !context.fetch(descriptor).isEmpty { return }` —
  сравнить `existing.body` с новым `Data`; равны → `return` (идемпотентно); различны →
  `throw OfflineQueueError.keyReusedWithDifferentPayload(idempotencyKey)`.
  То же в `OfflineCourierQueue.enqueueEncoded` (`:112-116`) — понадобится в срезе 7.
- iOS `apps/ios/POS/POSSaleView.swift` (панель чека, около `:150-153`) — при
  `flow.needsFreshReceipt` показать сообщение сервера и кнопку «Начать новый чек»
  с `accessibilityIdentifier("pos-fresh-receipt")`; при непустой очереди — бейдж
  «В очереди: N» с `accessibilityIdentifier("pos-queued-badge")` (источник — `@Query` как в
  `POSOperationsView.swift:9`).
- Android `apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt:320-336` —
  в ветке `is PosSubmitResult.Queued` добавить ровно то, что уже есть в ветке `Completed` (`:327`):
  `cart = emptyMap(); selectedImeis = emptyMap(); approvalId = null; activeSaleId = UUID.randomUUID().toString()`.
- Android `apps/android/core/src/main/java/kg/alistore/core/OfflineQueueDb.kt:39-55` — `enqueue`
  оборачивает `insertOrThrow`: при `SQLiteConstraintException` прочитать существующую строку,
  сравнить `body`; равны → вернуть существующий `id`; различны → бросить
  `DuplicateMutationException(idempotencyKey)`.
- Android `PosOperationsScreens.kt:193` — `rememberSaveable` заменить на чтение/запись
  `SharedPreferences("alistore-pos-flow")`, чтобы ключ пережил свайп из свитчера.

**Паритет платформ**
Обязаны совпасть: таблица жизненного цикла выше — построчно; семантика `enqueue`
(то же тело → идемпотентно, другое тело → ошибка); тексты «Сохранено офлайн · в очереди N» и
«Начать новый чек».
Расходятся сознательно: механизм персиста (`UserDefaults` vs `SharedPreferences`) и
имена тест-идентификаторов (`accessibilityIdentifier` vs `testTag`) — но сами строки-идентификаторы
держи одинаковыми (`pos-fresh-receipt`, `pos-queued-badge`), это уже конвенция репозитория
(`pos-sale-submit`, `pos-close-shift`, `pos-open-shift`).

**Переиспользовать**
- `apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt:82-93` (`PosSaleManager`) —
  готовая форма «логика продажи вне UI»; `POSSaleFlow` делай её зеркалом.
- `apps/api/src/pos/pos.service.ts:432-455` (`replaySale` + `saleRequestHash`) — эталон
  «тот же ключ + тот же состав = реплей, другой состав = 409».
- `apps/api/src/courier/courier-handover.ts:16-17` — та же идея в трёх строках.
- `apps/android/core/src/test/java/kg/alistore/core/PosSaleManagerTest.kt:64-72` (`PosRecordingQueue`) —
  образец фейковой очереди, утверждающей тело запроса.
- `apps/api/test/pos-sale-replay.e2e-spec.ts:92-181` — какие именно исходы сервер считает
  правильными; клиентские тесты не должны им противоречить.

**НЕ делать в этом срезе:** не добавлять `staffId` в `PendingMutation` (срез 6);
не менять серверное открытие смены (срез 5); не трогать `OfflineOrderQueue` (срез 8).

**Проверка:** `npm run ios:test`, `npm run android:test`, `npm run ios:ui`,
`npm run android:ui` (нужен эмулятор/устройство).

---

### Срез 5 — Сервер: фантомная смена вместо тихого `shifts.open`

**Зависит от:** ничего (серверный срез), но исполнять после среза 4 — там офлайн-очереди
наконец начинают накапливаться, и путь «долив после закрытия» становится частым.

**Что именно ломается сегодня**
`apps/api/src/pos/pos.service.ts:298-303` и `:704-709`:
```ts
let shift = await this.shifts.currentOpen(dto.staffId);
if (!shift) shift = await this.shifts.open({ staffId, point, openCash: 0 }, actor);
```
Офлайн-продажа, долившаяся после закрытия смены, открывает смену-фантом с `openCash: 0`.
Последствия: закрытая смена посчитана без этих денег (ложная недостача у кассира,
`shifts.service.ts:277` пишет `diff`), а `BlindCashReadGuard`
(`apps/api/src/auth/blind-cash-read.guard.ts:17-23`) видит новую открытую смену и блокирует
кассиру `/reports/*` (`reports.controller.ts:23`), `/finance/*` (8 точек) и весь AI-read
(`ai-read.decorator.ts:12`) — бессрочно, пока фантом не закроют.

**Какой код ошибки вместо тихого открытия**
`ConflictError('shift_not_open', 'Смена кассира не открыта; откройте смену с пересчитанным разменом и повторите продажу')`
→ HTTP 409 (`apps/api/src/common/errors.ts:21-25`).
Именно 409, а не 422: это конфликт состояния, и iOS-очередь уже маппит 409 в `state = "conflict"`
(`apps/ios/Shared/OfflineQueue.swift:229`), то есть строка **остаётся** в очереди и деньги не пропадают.
422 дал бы то же самое, но 409 честнее описывает «состояние мира не то».

**Почему это не ломает легитимный первый заказ дня**
Оба мобильных клиента уже блокируют кнопку оплаты, пока смены нет:
iOS `POSSaleView.swift:170` (`.disabled(... || shift == nil || ...)`),
Android `PosOperationsScreens.kt:330` (`enabled = ... && shift != null`),
плюс оба показывают отдельный блок «Откройте кассовую смену до первой продажи».
То есть онлайновая первая продажа дня по построению всегда идёт при открытой смене.
Автооткрытие обслуживало только jest-спеки.

**RED первым**
`apps/api/test/pos-phantom-shift.e2e-spec.ts` (новый; каркас копировать с
`apps/api/test/pos-sale-replay.e2e-spec.ts:19-90` — та же ручная сборка сервисов и та же
`beforeEach`-чистка):
1. `it('rejects a POS sale when the cashier has no open shift (409 shift_not_open)')` —
   продажа без смены → `ConflictError`, `err.code === 'shift_not_open'`;
   `await prisma.cashShift.count()` === 0 (фантом не создан);
   `await prisma.order.count()` === 0 (заказ не создан).
2. `it('does not resurrect a closed shift when an offline sale lands after close')` —
   открыть смену, продать, закрыть (`shifts.close`), затем продать с новым `clientSaleId` →
   409 `shift_not_open`; у кассира по-прежнему ровно одна смена и она закрыта.
3. `it('leaves the cashier able to read reports after the rejected late sale')` —
   после сценария 2 у кассира нет открытых смен, значит `BlindCashReadGuard` не срабатывает:
   `prisma.cashShift.findFirst({ where: { staffId, closedAt: null } })` === null.
4. `it('resumeSale also refuses to open a shift')` — довести заказ до статуса `reserved`
   (образец — `apps/api/test/pos-sale-resume.e2e-spec.ts`), закрыть смену, повторить продажу
   тем же ключом → 409 `shift_not_open`, не 200.

**Файлы**
- `apps/api/src/pos/pos.service.ts:298-303` — заменить `if (!shift) { shift = await this.shifts.open(...) }`
  на `if (!shift) throw new ConflictError('shift_not_open', '…');`, тип `shift` становится
  не-nullable без `let`.
- `apps/api/src/pos/pos.service.ts:704-709` (внутри `resumeSale`) — то же самое, дословно.
- `apps/api/src/pos/pos.controller.ts` — правок не нужно, `DomainError` уже маппится в 409.

**Blast radius и как его закрыть механически**
`pos.sale(` вызывается 60 раз в 6 спеках:
`pos-sale.e2e-spec.ts` (27), `pos-sale-resume.e2e-spec.ts` (12), `pos-sale-replay.e2e-spec.ts` (10),
`product-bundles.e2e-spec.ts` (7), `quantity-inventory.e2e-spec.ts` (3), `ledger-coverage.e2e-spec.ts` (1).
Плюс HTTP-уровень: `staff-session-ops.e2e-spec.ts:296-311`.

Не правь 60 мест. Сделай так:
1. Новый хелпер `apps/api/test/pos-shift-fixture.ts`:
   ```ts
   export async function openShiftsFor(prisma: PrismaService, staffIds: string[], point = 'BISHKEK-1') {
     for (const staffId of staffIds) {
       await prisma.cashShift.create({ data: { staffId, point, openCash: 0 } });
     }
   }
   ```
   (создаём напрямую через prisma, а не через `shifts.open`, — чтобы не писать в Event Ledger
   лишние `ShiftOpened` и не ломать `ledger-coverage.e2e-spec.ts`).
2. В каждом из 6 спеков список staffId получить командой
   `grep -on "staffId: '[a-z_0-9-]*'" <файл> | cut -d: -f3- | sort -u`
   и вписать константой рядом с `beforeEach`. Для `pos-sale.e2e-spec.ts` это 16 идентификаторов
   (`staff_pos_1`…`staff_pos_wrong_imei`), для `pos-sale-resume.e2e-spec.ts` — 5
   (`staff_resume_conflict`, `staff_resume_created`, `staff_resume_discount`, `staff_resume_pay`,
   `staff_resume_split`). Остальные четыре файла — тем же grep.
3. Вызвать `await openShiftsFor(prisma, STAFF_IDS)` в `beforeEach` **после**
   `await prisma.cashShift.deleteMany()` (`pos-sale.e2e-spec.ts:55`,
   `pos-sale-resume.e2e-spec.ts:65`, `pos-sale-replay.e2e-spec.ts:60`,
   `product-bundles.e2e-spec.ts:67`, `quantity-inventory.e2e-spec.ts:61`,
   `ledger-coverage.e2e-spec.ts:51`).

**Два теста придётся переписать, а не просто досеять смену — не пропусти**
- `apps/api/test/pos-sale.e2e-spec.ts:393-407` — `'reuses an already-open shift instead of opening a second'`.
  Он сегодня опирается на автооткрытие при первой продаже. После хелпера смена уже открыта,
  утверждения `second.shiftId === first.shiftId` и `count === 1` остаются валидными —
  но переименуй тест в `'attaches both sales to the cashier's already-open shift'`, иначе имя врёт.
- `apps/api/test/staff-session-ops.e2e-spec.ts:296-311` — HTTP-тест
  `'requires staff JWT for POS sale and books the shift under the JWT staff id'`.
  Перед `POST /pos/sale` открыть смену для `staffId` (через `POST /shifts/open`, как уже делается
  на строках 135/206/221 этого же файла), иначе получишь 409 вместо 201.
  Добавь туда же новый `it('rejects a POS sale without an open shift (409)')` — HTTP-зеркало
  RED-теста №1.

**Что делает клиент**
- iOS: 409 уже уводит строку в `state = "conflict"` (`OfflineQueue.swift:229`) с текстом сервера;
  `POSOfflineView` (`POSOperationsView.swift:35-40`) уже рисует кнопку «Повторить».
  Правка нужна одна: над кнопкой «Повторить» при `lastError` с кодом `shift_not_open` показать
  подсказку «Откройте смену на вкладке «Смена», затем повторите» и сделать её тапабельной
  (переключение на `selectedTab = 2`, роутер уже есть — `AliStorePOSApp.swift:169`).
- Android: `PosSyncWorker` маркирует 409 как `conflict` (сверь по
  `apps/android/core/src/main/java/kg/alistore/core/PosSyncWorker.kt`); подсказку добавить в
  экран офлайн-очереди тем же текстом.
- **Никакой автоповтор.** Кассир обязан пересчитать размен и открыть смену руками — иначе
  `openCash` снова окажется выдуманным.

**Переиспользовать**
- `apps/api/src/shifts/shifts.service.ts:121-134` — `open()` уже бросает 409 `shift_already_open`;
  формулировка сообщения и стиль кода — оттуда.
- `apps/api/src/courier/courier.service.ts:414-416` — образец «состояние не то → 409 с внятным текстом».
- `apps/api/test/pos-sale-replay.e2e-spec.ts:19-90` — каркас спеки.
- `apps/api/test/shifts.e2e-spec.ts:119-129` — как в этом репозитории проверяют «одна открытая смена».

**НЕ делать в этом срезе:** не менять `BlindCashReadGuard` (он ведёт себя правильно — это
фантом был неправильным); не трогать `shifts.open`; не добавлять эндпоинт «привязать
продажу к закрытой смене» — это отдельная бизнес-задача, в бэклог; не менять мобильные
расчёты.

**Проверка:** `cd apps/api && NODE_PATH=./node_modules npx jest --runInBand --testPathPattern 'pos-|shift|ledger-coverage|product-bundles|quantity-inventory|staff-session-ops'`,
затем `npm run api:test`, затем `npx tsc --noEmit -p apps/api/tsconfig.json`.

---

### Срез 6 — Очередь знает своего кассира

**Зависит от:** срез 1 (добавляем поле в `PendingMutation` — теперь это осознанная V2, а не
случайный брик), срез 4 (тот же `enqueue`/`replay`), срез 5 (иначе чужая продажа ещё и фантом откроет).

**Что ломается сегодня**
`PendingMutation` (`apps/ios/Shared/OfflineQueue.swift:4-28`) не хранит владельца.
`POSRootView.replayQueuedSales()` (`apps/ios/POS/AliStorePOSApp.swift:210-215`) висит на
`.task` (`:162`) корневого `TabView` и реплеит **все** строки токеном текущей сессии.
`staffId` сервер берёт из JWT (`apps/api/src/pos/pos.controller.ts:61-62`,
`requireActiveStaff(user)`), поэтому продажа кассира A уходит в смену кассира B
(`pos.service.ts:298` — `currentOpen(dto.staffId)`). Если точки разные, спасёт
`staff_point_mismatch` (`pos.service.ts:196-198`); если точка одна — молчаливая подмена.
Плюс фильтр `mutation.state == "queued"` (`:212`) не подхватывает строки, застрявшие в
`"syncing"` (их туда ставит `replay` на `:200` перед сетевым вызовом — обрыв процесса
между этими строками оставляет запись навсегда).

**RED первым**
`apps/ios/Tests/OfflineQueueOwnershipTests.swift` (новый):
1. `testReplaySkipsMutationsOwnedByAnotherStaff()` — положить две строки
   (`staffId: "cashier-a"`, `staffId: "cashier-b"`), реплеить с сессией `cashier-b`;
   утверждать, что транспорт получил ровно один запрос и это тело `cashier-b`.
   Сегодня `staffId` в модели нет → RED (компиляционный, зафиксируй в комментарии).
2. `testReplayPicksUpRowsStuckInSyncing()` — строка со `state = "syncing"` и
   `updatedAt` старше 60 с попадает в выборку; со `state = "syncing"` и свежим `updatedAt` — нет.
3. `testForeignMutationsAreCountedButNotSent()` — `OfflinePOSQueue.foreignPendingCount(for:)` > 0,
   чтобы кассир B видел «в очереди 2 чека другого кассира» и не думал, что база пуста.
4. `testMigrationFromV1BackfillsStaffIdAsUnknown()` — открыть фикстуру `offline-v0` из среза 1
   контейнером V2, утверждать: строки на месте, `staffId == nil`.
   И отдельно: строки с `staffId == nil` **никогда не реплеятся автоматически** — только
   вручную из `POSOfflineView` с явным подтверждением «это мои продажи».

**Файлы**
- iOS `apps/ios/Shared/OfflineQueue.swift:4-28` — добавить `public var staffId: String?`
  (**именно optional** — у строк из V1 владельца нет и выдумывать его нельзя).
- iOS `apps/ios/Shared/OfflineSchema.swift` — добавить `OfflineSchemaV2` с той же моделью и
  `versionIdentifier = Schema.Version(2, 0, 0)`; в `OfflineMigrationPlan.schemas` — `[V1, V2]`;
  в `stages` — `[.lightweight(fromVersion: OfflineSchemaV1.self, toVersion: OfflineSchemaV2.self)]`.
  Lightweight достаточно: добавление optional-свойства без переименований — ровно тот случай,
  который SwiftData тянет сам. `container()` начинает строить `Schema(versionedSchema: OfflineSchemaV2.self)`.
- iOS `apps/ios/Shared/OfflineQueue.swift:172-193` (`OfflinePOSQueue.enqueue`) — принимать
  `staffId: String` и писать его в строку.
- iOS `apps/ios/POS/POSSaleView.swift` (вызов enqueue, после среза 4 — внутри `POSSaleFlow`) —
  передавать `session.staffId`. Если в `StaffSession` такого поля нет — сверься с
  `apps/ios/Shared/Models.swift` и `apps/ios/Shared/StaffAuthStore.swift`; при отсутствии
  используй `session.username` и назови поле `staffRef`, но **не** генерируй суррогат.
- iOS `apps/ios/POS/AliStorePOSApp.swift:210-215` — переписать выборку:
  ```swift
  for mutation in queued where mutation.endpoint == "pos/sale"
      && mutation.staffId == session.staffId
      && (mutation.state == "queued"
          || (mutation.state == "syncing" && mutation.updatedAt < Date().addingTimeInterval(-60)))
  ```
- iOS `apps/ios/POS/POSOperationsView.swift:9` — `@Query` уже тянет всё; добавить фильтр
  отображения по владельцу и отдельную секцию «Чужие/безымянные чеки (N)» с явной кнопкой
  «Это мои продажи, отправить» — она проставляет `staffId` текущего кассира и снимает блокировку.
- iOS `apps/ios/POS/POSOperationsView.swift:60-66` (`replayAll`) — добавить тот же фильтр по владельцу.
- Android: `OfflineQueueDb` — версия 2 → **3**, `onUpgrade` добавляет
  `ALTER TABLE pending_mutation ADD COLUMN staff_id TEXT` (без `NOT NULL`, без DEFAULT —
  старые строки честно получают `NULL`); `enqueue` принимает `staffId`;
  `pending()` получает параметр `staffId` и добавляет `AND (staff_id = ? )`;
  `PosSyncWorker`/`OfflineSyncWorker`/`StaffSyncWorker` — передать владельца из сессии.
  Сверься с `apps/android/core/src/main/java/kg/alistore/core/PosSyncWorker.kt` перед правкой.

**Паритет платформ**
Обязаны совпасть: `staffId` nullable; строки с `NULL` не реплеятся автоматически ни на одной
платформе; строки в `syncing` старше 60 с подбираются обеими.
Расходятся сознательно: iOS идёт по версиям SwiftData (V1→V2), Android — по
`SQLiteOpenHelper` версии 2→3. Номера версий не синхронизируем и не пытаемся выровнять —
это разные счётчики разных хранилищ.

**Переиспользовать**
- `apps/android/core/src/main/java/kg/alistore/core/OfflineQueueDb.kt:30-37` — существующий
  `onUpgrade` (миграция 1→2 добавляла `state`/`last_error`/`updated_at`) — точный образец
  того, как в этом репозитории добавляют колонку без потери строк.
- `apps/ios/Shared/OfflineQueue.swift:196-234` (`OfflinePOSQueue.replay`) — не переписывай,
  меняется только выборка вызывающих.
- `apps/api/src/pos/pos.controller.ts:61-62` — доказательство, что `staffId` берётся из JWT
  (поэтому чужой токен = чужая смена).

**НЕ делать в этом срезе:** не добавлять `staffId` в тело запроса (сервер его игнорирует и
берёт из JWT — `PosSaleDto.staffId` помечен `Derived from staff JWT`,
`apps/api/src/pos/pos.dto.ts:55-57`; `PosSaleManagerTest.kt:27` прямо утверждает,
что тела без `staffId`); не удалять чужие строки; не трогать `OfflineCourierQueue`.

**Проверка:** `npm run ios:test`, `npm run android:test`, `npm run ios:build`, `npm run android:build`.

---

### Срез 7 — IMEI: присвоение вместо сложения, один IMEI на товар

**Зависит от:** срез 4 (тот же файл, `POSSaleFlow`).

**RED первым**
- iOS `apps/ios/Tests/POSSaleFlowIMEITests.swift` (новый):
  1. `testScanningAnIMEIAddsAUnitInsteadOfResettingTheQuantity()` — корзина `[p: 3]`,
     сканируем IMEI товара `p` → `cart[p] == 4`. Сегодня `cart[product.id] = 1`
     (`POSSaleView.swift:218`) → RED.
  2. `testTwoIMEIsOfTheSameProductAreBothRetained()` — сканируем два IMEI одного товара →
     `cart[p] == 2` и `flow.imeis(for: p) == [imei1, imei2]`. Сегодня
     `selectedIMEI[product.id] = unit.imei` (`:219`) затирает первый → RED.
  3. `testTheSameIMEIScannedTwiceIsRejected()` — повтор того же IMEI → количество не растёт,
     сообщение «IMEI уже в чеке».
  4. `testRequestCarriesOnePerUnitLineForEachIMEI()` — **тест против сервера:**
     утверждать, что `POSSaleRequest.lines` содержит **по строке на каждый IMEI**
     (`qty: 1` каждая), а не одну строку `qty: 2` с одним IMEI. Обоснование в коде сервера:
     `saleRequestHash` агрегирует по `sku:price` и прямо комментирует
     «auto-assigned IMEI units are split into per-unit rows server-side»
     (`apps/api/src/pos/pos.service.ts:456-460`). Одна строка `qty:2` с одним `imei` серверу
     соврала бы про то, какой аппарат ушёл.
  5. `testDecrementDropsTheLastScannedIMEIOnly()` — `change(product, by: -1)` при двух IMEI
     снимает последний, а не оба.
- Android `apps/android/core/src/test/java/kg/alistore/core/PosImeiCartTest.kt` (новый) —
  те же пять против выделенной чистой функции `applyScannedUnit(cart, imeis, unit, product)`.

**Файлы**
- iOS `apps/ios/POS/POSSaleView.swift:218-219` — `cart[product.id] = 1` →
  `cart[product.id] = (cart[product.id] ?? 0) + 1`;
  `selectedIMEI[product.id] = unit.imei` → `selectedIMEI: [String: [String]]`,
  `selectedIMEI[product.id, default: []].append(unit.imei)`.
- iOS `apps/ios/POS/POSSaleView.swift:14` — тип `@State private var selectedIMEI: [String: String]`
  → `[String: [String]]` (после среза 4 это поле живёт в `POSSaleFlow`).
- iOS `apps/ios/POS/POSSaleView.swift:101-103` — отображение: `IMEI …xxxxxx` → список,
  или «IMEI: N шт.» при N > 1.
- iOS `apps/ios/POS/POSSaleView.swift:239-242` — сборка `lines`: вместо одной `POSLine`
  на товар порождать по строке на каждый IMEI (`qty: 1`) плюс одну строку без IMEI на остаток
  `qty - imeis.count`, если он положительный.
- iOS `apps/ios/POS/POSSaleView.swift:299-303` (`change`) — при уменьшении снимать
  последний IMEI (`selectedIMEI[product.id]?.removeLast()`), при `next == 0` — очищать.
- iOS `apps/ios/POS/POSSaleView.swift:110-111` — `.disabled((cart[product.id] ?? 0) >= product.availableUnits)`
  оставить как есть.
- Android `apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt:215-220` —
  `cart = cart + (matched.id to 1)` → `+ 1` к текущему; `selectedImeis` сделать
  `Map<String, List<String>>`.
- Android `apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt:290-292` —
  сейчас кнопка «+» дизейблится при `selectedImei != null`; после правки это ограничение снять
  (иначе второй IMEI не отсканируешь), но «+» без IMEI при уже привязанном IMEI —
  добавлять строку без IMEI, как на iOS.
- Android `PosOperationsScreens.kt:314` — сборка `lines` тем же правилом «строка на IMEI».

**Паритет платформ**
Обязаны совпасть: правило сборки `lines` (строка на каждый IMEI + одна строка на остаток),
запрет дубля IMEI, поведение «минус» (снимаем последний).
Расходятся сознательно: iOS показывает список IMEI в карточке товара, Android — счётчик;
это чисто визуально.

**Переиспользовать**
- `apps/api/src/pos/pos.service.ts:456-478` (`saleRequestHash`) — доказательство, почему
  нужна строка на IMEI.
- `apps/api/test/pos-sale.e2e-spec.ts` — тест `imei_product_mismatch` (`:385-391`) показывает,
  как сервер валидирует привязку IMEI к товару; клиент не должен уметь собрать невалидное тело.
- `apps/android/core/src/test/java/kg/alistore/core/StaffScannerTest.kt` — образец
  тестирования сканер-логики отдельно от Compose.

**НЕ делать в этом срезе:** не менять серверную аллокацию IMEI; не трогать бандлы
(`pos.service.ts:322-340`); не менять экран возвратов.

**Проверка:** `npm run ios:test`, `npm run android:test`, `npm run ios:ui`.

---

### Срез 8 — Сумма COD в ключе идемпотентности

**Зависит от:** срез 4 (там `OfflineCourierQueue.enqueueEncoded` получает сравнение тел).

**Что ломается**
`apps/ios/Courier/CourierOperationsView.swift:555` — `let key = "courier-handover-\(run.id)"`.
Курьер ошибся суммой, отправил офлайн, исправил — `OfflineCourierQueue.enqueueEncoded`
(`apps/ios/Shared/OfflineQueue.swift:112-116`) видит тот же ключ и молча выходит.
Исправленная сумма никуда не уезжает. Сервер, до которого она бы доехала, повёл бы себя
правильно: `replayCourierHandover` (`apps/api/src/courier/courier-handover.ts:16-17`)
бросает 409 `idempotency_key_reused`, если `handoverAmount`/`handoverReason` не совпали.
То есть баг ровно в клиентском дедупе, срезающем разговор до сервера.

**RED первым**
`apps/ios/Tests/CourierHandoverKeyTests.swift` (новый):
1. `testKeyChangesWhenTheAmountChanges()` — `CourierHandoverKey.make(runId:amount:reason:)`
   для (run-1, 5000, nil) и (run-1, 4500, "…") даёт разные ключи. Сегодня функции нет → RED.
2. `testKeyIsStableForTheSamePayload()` — тот же runId+amount+reason → тот же ключ
   (иначе каждый ретрай создаст новую сдачу).
3. `testCorrectedAmountReachesTheQueueAsASecondRow()` — поставить в очередь 5000, затем 4500 →
   две строки, тела различны. Сегодня одна → RED.
4. `testIdenticalRetryStaysOneRow()` — 5000 дважды → одна строка, без ошибки.
5. `testKeyMirrorsTheServerReplayContract()` — **сверка с сервером:** утверждать, что ключ
   зависит ровно от того набора полей, который сервер сравнивает в
   `replayCourierHandover` — `runId`, `amount`, `reason` (после `trim`, пустая строка → nil,
   как в `courier.service.ts:391`). Ни больше, ни меньше.

Android — расширить существующий `apps/android/core/src/test/java/kg/alistore/core/CourierHandoverTest.kt`
(там уже фиксируется ключ `"courier-handover-run-1"`, строки 19/23/35): добавить те же пять и
заменить литерал на вызов той же функции.

**Файлы**
- iOS новый `apps/ios/Shared/CourierHandoverKey.swift`:
  ```swift
  public enum CourierHandoverKey {
      /// Зеркало apps/api/src/courier/courier-handover.ts:16 — сервер сравнивает
      /// runId + amount + reason (trim, пусто → nil). Ключ обязан зависеть ровно от них.
      public static func make(runId: String, amount: Int, reason: String?) -> String {
          let normalized = reason?.trimmingCharacters(in: .whitespacesAndNewlines)
          let material = "\(runId)#\(amount)#\(normalized?.isEmpty == false ? normalized! : "")"
          return "courier-handover-" + sha256Hex(material).prefix(32)
      }
  }
  ```
  `sha256Hex` — через `CryptoKit.SHA256`; если `CryptoKit` в таргете `AliStoreCore` ещё не
  используется, `import CryptoKit` достаточно, отдельной зависимости в `project.yml` не нужно.
- iOS `apps/ios/Courier/CourierOperationsView.swift:555` — заменить литерал на
  `CourierHandoverKey.make(runId: run.id, amount: amountValue, reason: reason.nilIfBlank)`.
- Android новый `courierHandoverKey(runId, amount, reason)` рядом с `CourierCommandManager`;
  вызывающий код — там, где сейчас формируется `"courier-handover-$runId"` (найди
  `grep -rn "courier-handover-" apps/android --include='*.kt'`).
- Длина: сервер ограничивает ключ 128 символами (`courier.service.ts:390`) — `"courier-handover-"`
  + 32 hex = 49, запас есть.

**Паритет платформ**
Обязаны совпасть побитово: iOS `CourierHandoverKey.make` ≡ Android `courierHandoverKey` —
одна и та же строка-материал, тот же SHA-256, тот же префикс 32 hex. Один и тот же курьер
может сдать рейс с одного устройства, а доотправить с другого; разные ключи создадут две сдачи.
Добавь общий golden-файл по образцу среза 2 (`courier-handover-key-golden.json`, 6 строк) и
включи его в тот же `scripts/check-pos-golden-parity.mjs`.

**Переиспользовать**
- `apps/api/src/courier/courier-handover.ts:8-20` — контракт сервера целиком, 13 строк.
- `apps/api/src/pos/pos.service.ts:390-407` (`saleFingerprint`) — образец детерминированного
  ключа из полей в этом репозитории (sha256 → `.slice(0, 32)`); повторяй эту форму.
- `apps/android/core/src/test/java/kg/alistore/core/CourierHandoverTest.kt:11-67` — готовый спек,
  расширяется на месте.
- `apps/api/test/courier-handover.spec.ts` — серверные ожидания, с ними нельзя разойтись.

**НЕ делать в этом срезе:** не менять сервер; не убирать `run.id` из ключа; не хешировать
`collectedTotal`/`codTotal` — сервер их не сравнивает.

**Проверка:** `npm run ios:test`, `npm run android:test`,
`cd apps/api && NODE_PATH=./node_modules npx jest --runInBand --testPathPattern courier-handover`.

---

### Срез 9 — Заказ создан, платёж — нет

**Зависит от:** ничего.

**Что ломается**
`apps/ios/Client/AliStoreClientApp.swift:1844-1877`: `POST orders/mine` (`:1845`) и
`POST payments/intents/mine` (`:1852`) под одним `do`. `catch` (`:1866`) различает только
`error is URLError` и в этой ветке кладёт **заказ** в очередь с сообщением «сохранено офлайн».
Если заказ создался, а intent упал — очередь получит дубль заказа (сервер его отобьёт по
`idempotencyKey`), а пользователь увидит «сохранено офлайн» при уже существующем заказе,
за который никто не заплатил.

**RED первым**
`apps/ios/Tests/CheckoutFailureAttributionTests.swift` (новый; каркас — существующий
`apps/ios/Tests/CheckoutContractTests.swift`, там уже есть мок-транспорт):
1. `testOrderSuccessThenIntentFailureDoesNotQueueTheOrder()` — транспорт: `orders/mine` → 201,
   `payments/intents/mine` → `URLError(.timedOut)`; утверждать: очередь пуста,
   `completedOrder != nil`, показан экран «Заказ создан, оплата не прошла» с кнопкой
   «Повторить оплату». Сегодня заказ уедет в очередь → RED.
2. `testOrderFailureQueuesTheOrder()` — `orders/mine` → `URLError`; очередь = 1 строка,
   `completedOrder == nil`.
3. `testIntentFailureReusesTheExistingRetryPath()` — после сценария 1 вызов `retryPayment()`
   (`AliStoreClientApp.swift:1880+`) шлёт `payments/intents/mine` с тем же `orderId`.
4. `testDomainErrorOnOrderIsNotQueued()` — `orders/mine` → 422; очередь пуста,
   показано сообщение сервера (сегодня уже так — регресс-замок).

**Файлы**
- `apps/ios/Client/AliStoreClientApp.swift:1843-1877` — разбить на два `do/catch`:
  ```
  do { order = try await post("orders/mine", …) }
  catch { if error is URLError { enqueue(order); queuedOffline = true; cart.removeAll() }
          else { errorMessage = … }
          return }
  completedOrder = order
  cart.removeAll()
  guard let onlineMethod = OnlinePaymentMethod(rawValue: paymentMethod) else { return }
  do { paymentIntent = try await post("payments/intents/mine", …) }
  catch { paymentErrorMessage = "Заказ №… создан, но оплата не прошла: \(…). Повторите оплату." }
  ```
  Ключевое: после успешного `orders/mine` заказ **никогда** не попадает в очередь,
  корзина чистится, а сбой платежа — отдельное состояние с отдельным текстом.
- Переиспользовать уже существующий `retryPayment()` (`:1880`) и `retryErrorMessage` —
  новый экран должен вести именно туда, а не заводить второй механизм.

**Паритет платформ**
Проверь Android-аналог: `apps/android/core/src/main/java/kg/alistore/core/` — `CheckoutManager`
(есть `CheckoutManagerTest.kt`). Если там та же однокатчевая форма — почини тем же разбиением
в этом же срезе; если платёж уже отделён — расхождение сознательное, зафиксируй в коммите
одной строкой.

**Переиспользовать**
- `apps/ios/Tests/CheckoutContractTests.swift` — мок-транспорт и стиль ассертов.
- `apps/android/core/src/test/java/kg/alistore/core/CheckoutManagerTest.kt` — как этот
  репозиторий тестирует чекаут без UI.
- `apps/ios/Shared/OfflineQueue.swift:47-88` (`OfflineOrderQueue.replay`) — уже умеет
  различать 409/422 → `conflict`; менять его не надо.

**НЕ делать в этом срезе:** не менять сервер; не трогать `OfflineOrderQueue`;
не добавлять автоматический ретрай платежа.

**Проверка:** `npm run ios:test`, `npm run android:test`.

---

### Срез 10 — Корзина, привязанная к аккаунту

**Зависит от:** ничего. Идёт последним осознанно: денег не теряет.

**Что ломается**
`ClientLocalState` (`apps/ios/Client/AliStoreClientApp.swift:873-914`) — три глобальных ключа
`UserDefaults` (`alistore.client.cart.v1` и т. д.).
`CustomerAuthStore.logout()` (`apps/ios/Shared/CustomerAuthStore.swift:89-99`) чистит токены и
quick-unlock, но не их. `restoreLocalState()` вызывается один раз на `.task` корня
(`AliStoreClientApp.swift:1021-1022`) и не реагирует на смену сессии. Следующий вошедший видит
чужую корзину, избранное и сравнение.

**RED первым**
`apps/ios/Tests/ClientLocalStateScopeTests.swift` (новый):
1. `testCartIsScopedToTheCustomerId()` — сохранить корзину под `customer-a`, прочитать под
   `customer-b` → пусто. Сегодня ключ глобальный → RED.
2. `testLogoutClearsTheGuestScopeButKeepsTheAccountScope()` — после `logout()` гостевая корзина
   пуста; корзина `customer-a` при повторном входе восстанавливается.
3. `testGuestCartMigratesIntoTheAccountOnFirstLogin()` — гость положил товар, вошёл →
   корзина аккаунта = гостевая (слияние по максимуму количеств), гостевая очищена.
   Это единственное поведение здесь, где есть выбор: **сливаем, не затираем** — иначе
   пользователь теряет то, что клал до входа.
4. `testSwitchingAccountsDoesNotLeakFavorites()` — то же для `favorites` и `compared`.

Android-зеркало: `apps/android/core/src/androidTest/java/kg/alistore/core/ClientLocalStateTest.kt`
уже существует — расширь его теми же четырьмя случаями.

**Файлы**
- `apps/ios/Client/AliStoreClientApp.swift:874-876` — ключи становятся функциями от scope:
  `private static func cartKey(_ scope: String) -> String { "alistore.client.cart.v2.\(scope)" }`
  (и так для favorites/compared). Скоуп: `session?.customerId ?? "guest"`.
  **Версию поднять до v2** — старые глобальные `…v1` остаются на диске нетронутыми и
  один раз мигрируют в скоуп `guest` при первом запуске (иначе гость, который что-то положил
  до обновления, потеряет корзину).
- `apps/ios/Client/AliStoreClientApp.swift:900-913` (`save`) и `:878-899` (`cart/favorites/compared`) —
  принимают `scope`.
- `apps/ios/Client/AliStoreClientApp.swift:1021-1022` — `restoreLocalState()` перевести с
  `.task { }` на `.task(id: auth.session?.customerId ?? "guest")`, чтобы он перезапускался при
  входе/выходе. Образец такой формы уже есть в этом же файле: `:2539` и `:3712`
  (`.task(id: auth.session?.accessToken)`).
- `apps/ios/Shared/CustomerAuthStore.swift:89-99` (`logout`) — **не** трогать: чистка чужого
  UI-стейта из auth-стора — это связь не туда. Реакция на выход обеспечивается `.task(id:)` выше.
  Отдельно: гостевой скоуп при выходе чистится в `restoreLocalState`, если предыдущий скоуп был
  аккаунтом.
- Android: найти зеркало через `grep -rn "alistore.client.cart" apps/android --include='*.kt'`
  и применить ту же схему.

**Паритет платформ**
Обязаны совпасть: имя ключа со скоупом (`alistore.client.cart.v2.<scope>`), правило слияния
гостевой корзины при входе, отсутствие утечки между аккаунтами.
Расходятся сознательно: iOS `UserDefaults` vs Android `SharedPreferences`/DataStore — механизм,
не контракт.

**Переиспользовать**
- `apps/android/core/src/androidTest/java/kg/alistore/core/ClientLocalStateTest.kt` — готовый спек.
- `apps/ios/Client/AliStoreClientApp.swift:2539` — образец `.task(id:)`, завязанного на сессию.

**НЕ делать в этом срезе:** не переносить корзину на сервер (это отдельная фича);
не удалять `…v1`-ключи с диска; не трогать `OfflineOrderQueue`.

**Проверка:** `npm run ios:test`, `npm run android:test`, `npm run android:ui`.

---

## Чего не смог проверить

1. **Ничего не запускал.** Ограничение задачи — только чтение. Ни один тест из репозитория в
   этой сессии не выполнялся: ни `npm run api:test` (нужен живой Postgres `alistore_test`,
   а `alistore_dev` мне запрещено трогать на запись), ни `npm run ios:test`, ни `npm run android:test`.
   Все «сегодня будет RED» — вывод из чтения кода, а не наблюдение.
2. **Что SwiftData действительно откроет старый store под `OfflineSchemaV1`.** Это самое
   рискованное место плана. Аргумент — идентичность сущности (то же имя типа, тот же модуль,
   те же свойства), и он верен по документации, но не проверен на реальном файле. Поэтому
   в срезе 1 есть тест №3 на настоящей фикстуре старого хранилища — **пока он не позеленел,
   срез 1 не считается сделанным.** Если он покраснеет, срезы 6 и вся стратегия версионирования
   пересматриваются: тогда правильным ответом будет `MigrationStage.custom` с ручным
   переносом строк, а не lightweight.
3. **Реальные устройства и симулятор.** Не запускал `xcodebuild` и `gradlew`; не проверял,
   что xcodegen подхватит `apps/ios/Tests/Fixtures` как ресурс (поэтому в срезе 1 записана
   контингенция с `resources:` в `project.yml`), и не проверял, что `apps/android/core/src/test/resources`
   попадёт в classpath JVM-тестов (стандартно — да, но не измерено).
4. **Android-зеркала для срезов 9 и 10.** Файлы `CheckoutManager` и клиентское локальное
   состояние на Android я не читал построчно — в плане стоят grep-инструкции, а не точные
   `файл:строка`. Это единственные два места, где исполнителю придётся сначала посмотреть.
5. **`StaffSession` на iOS**: не проверил, есть ли в нём `staffId` (нужен в срезе 6).
   В срезе записана развилка на случай отсутствия.
6. **Web/ERP-поверхность** (`apps/web`) не смотрел вообще. Если POS-продажи оформляются ещё и
   оттуда, срез 5 (`shift_not_open`) её тоже затронет — проверь
   `grep -rn "pos/sale" apps/web` перед исполнением среза 5.
7. **Плавающая точка на реальном ARM64.** Расхождение порядка операций посчитано в Node на
   этой машине. IEEE-754 binary64 детерминирован и одинаков в JS/Swift/Kotlin для одного и того
   же порядка операций, но золотая фикстура из среза 2 — единственное, что это подтвердит
   на устройстве. Не считай паритет доказанным, пока `POSDiscountParityTests` не позеленел
   на симуляторе, а не только в голове.

## Порядок по невосстановимости

**Теряют деньги молча — не оставлять несделанными ни при каких сроках**

1. **2.2 (срез 4) — вторая офлайн-продажа исчезает.** На iOS никакого следа: очередь молча
   вернула `return`, UI сказал «сохранено офлайн». Ни кассир, ни владелец, ни леджер никогда
   не узнают, что продажа была. Восстановить нечем — записи не существует нигде.
   Единственный дефект в списке, у которого нулевая наблюдаемость.
2. **2.10 (срез 6) — деньги кассира A уходят в смену кассира B.** Деньги в леджере есть, но
   в чужой смене: у A недостача, у B излишек, и оба искренне не понимают почему.
   Восстановимо только ручным разбором `AuditEvent` задним числом, и только если кто-то заметил.
   Плюс строки, застрявшие в `syncing`, не реплеятся вообще — тихая потеря второго рода.
3. **2.9 (срез 5) — фантомная смена.** Закрытая смена посчитана без этих денег → ложная
   недостача кассира (реальный финансовый вред человеку), а `BlindCashReadGuard` бессрочно
   блокирует ему отчёты и финансы. Деньги в леджере остаются, но приписаны к смене, которой
   не должно существовать; исправлять придётся руками в БД.
4. **2.6 (срез 8) — исправленная сумма COD игнорируется.** Курьер уверен, что отправил 4500,
   уехал 5000 (или наоборот). Расхождение всплывёт при сверке, но виновника установить нечем:
   на устройстве осталась одна строка, вторая никогда не создавалась.
5. **2.1 (срез 1) — краш на старте у всех.** Сам по себе денег не теряет **сегодня**, но
   превращает любой будущий срез в потерю: несовместимое изменение модели кладёт приложение
   на устройствах с непроведёнными продажами, и достать их оттуда уже нечем.
   Поэтому он первый в исполнении, хотя пятый по прямому ущербу.

**Ломают чек, но следы остаются**

6. **2.3 (срез 2) — округление.** Сервер отбивает 422 `payment_split_mismatch`, продажа не
   проходит. Денег не теряет — заклинивает кассу. Но офлайн этот же чек уляжется в очередь и
   отобьётся только при синхронизации, задним числом.
7. **2.4 (срез 3) — `cash == total` уходит картой.** Деньги на месте, но в ящике наличные,
   а в леджере карта. Слепой пересчёт (`shifts.close`) немедленно даёт расхождение —
   дефект громкий, восстанавливается сверкой.
8. **2.5 (срез 7) — IMEI.** Продажа проходит, но с неверным аппаратом или неверным
   количеством. Ловится инвентаризацией и гарантийными обращениями — дорого, но восстановимо.
9. **2.7 (срез 9) — заказ без платежа.** Заказ в системе есть, деньги не списаны; расходится
   с реальностью в понятную сторону и виден в отчётах как неоплаченный. Плюс дубль в очереди,
   который сервер сам отобьёт по `idempotencyKey`.

**Неудобно, денег не касается**

10. **2.8 (срез 10) — чужая корзина после смены аккаунта.** Приватность и раздражение,
    ноль финансовых последствий. Единственный дефект в списке, который можно отложить,
    не отложив при этом деньги.

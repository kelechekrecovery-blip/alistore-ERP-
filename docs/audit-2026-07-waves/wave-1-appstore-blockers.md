# План устранения дефектов iOS-релиза (1.1–1.13)

Формат по `.claude/skills/writing-plans`: один вертикальный срез = один коммит,
acceptance пишется первым, файлы и функции названы поимённо.

Общая рамка репозитория (проверено, не догадка):
- Статический гейт — только `tsc` и `prisma validate`. ESLint/Prettier нет.
- iOS **не входит** ни в `scripts/mvp-verify.mjs`, ни в `.github/workflows/ci.yml`
  (в CI прямо написано: сборки iOS живут в отдельном воркфлоу на macOS-раннере).
  Значит iOS-acceptance выполняется руками через `npm run ios:test` / `ios:build`
  или через MCP `xcodebuild`.
- Swift-юнит-тесты живут в `apps/ios/Tests` (таргет `AliStoreCoreTests`, XCTest,
  не Swift Testing — держись существующего стиля `XCTestCase` + `XCTAssert`).
- UI-тесты: `apps/ios/UITests/<App>/`, запуск через launch-аргументы из
  `apps/ios/Shared/UITestBootstrap.swift`.
- API-тесты и Playwright требуют живой Postgres (`alistore_test`).

---

### Срез 1 — Контракт OTP: вход в Client
**Зависит от:** ничего.

**Acceptance (пишется первым):**
Новый файл `apps/ios/Tests/OtpContractTests.swift`, таргет `AliStoreCoreTests`.

1. `func testDecodesOtpChallengeFromProductionShape()` — декодирует ровно то,
   что отдаёт `apps/api/src/auth/auth.service.ts:86` без dev-echo:
   ```
   {"challengeId":"clx_otp_1"}
   ```
   утверждает `challenge.challengeId == "clx_otp_1"` и `challenge.devCode == nil`.
   **До правки этот тест падает** — сейчас `OTPChallenge` требует `expiresIn`.
2. `func testDecodesOtpChallengeWithDevEcho()` — тело
   `{"challengeId":"clx_otp_1","devCode":"123456"}` → `devCode == "123456"`.
3. `func testRequestOtpPostsPhoneOnly()` — через `MockURLProtocol` (шаблон копируй
   из `apps/ios/Tests/CustomerMeContractTests.swift:6-22`, там уже есть
   `makeSession(status:body:)` и `CustomerMeMockURLProtocol.lastRequest`): утверждает
   `lastRequest?.url?.path == "/api/auth/otp/request"` и что тело — `{"phone":...}`.

Запуск: `npm run ios:test` (схема `AliStoreClient`, симулятор iPhone 17 Pro).

**Файлы:**
- `apps/ios/Shared/Models.swift:264-267` — заменить
  ```swift
  public struct OTPChallenge: Decodable, Sendable {
      public let expiresIn: Int
      public let devCode: String?
  }
  ```
  на
  ```swift
  /// Ответ POST /auth/otp/request. Сервер (apps/api/src/auth/auth.service.ts:86)
  /// всегда отдаёт challengeId и НИКОГДА не отдаёт expiresIn.
  /// challengeId клиенту не нужен для verify (VerifyOtpDto = {phone, code}),
  /// но декодируется явно, чтобы поломка контракта сервера падала тестом.
  public struct OTPChallenge: Decodable, Sendable {
      public let challengeId: String
      public let devCode: String?
  }
  ```
- `apps/ios/Shared/CustomerAuthStore.swift:54` — код не меняется
  (`devCode = challenge.devCode` остаётся), меняется только тип.

**Переиспользовать:**
- `MockURLProtocol` / `makeSession` из `apps/ios/Tests/APIClientTests.swift` и
  `CustomerMeContractTests.swift` — не писать новый мок-транспорт.
- `APIClient.post(_:body:)` из `apps/ios/Shared/APIClient.swift:93`.

**НЕ делать в этом срезе:**
- Не добавлять `challengeId` в `OTPVerification` — сервер его не принимает
  (`apps/api/src/auth/auth.dto.ts:12-20`, `VerifyOtpDto` = только `phone` + `code`).
- Не трогать таймер повторной отправки, экран ввода кода, ретраи.
- Не трогать `CustomerAuthTokens.expiresIn` (там `String`, и это верно —
  `issueTokens` отдаёт `"15m"`).

---

### Срез 2 — Демо-данные: сотрудники, зоны, слоты, заказы, смена (1.12)
**Зависит от:** ничего. Ставится вторым, потому что без `StaffUser` ни один
из последующих срезов нельзя проверить руками ни на симуляторе, ни на устройстве.

**Acceptance (пишется первым):**
Новый файл `apps/api/test/seed-demo.e2e-spec.ts` (jest, живой Postgres).
Запуск: `cd apps/api && NODE_PATH=./node_modules npx jest --runInBand --testPathPattern seed-demo`.

1. `it('создаёт учётки для всех четырёх ролевых входов', ...)` — вызывает
   экспортированную функцию сида и проверяет, что в БД есть активные `StaffUser`
   с ролями `courier`, `cashier`, `admin`, `owner`, и что `staff-auth/login`
   каждым из логинов возвращает 200 + JWT. Роли выбраны по фактам:
   `apps/ios/Courier/AliStoreCourierApp.swift:63` пускает **строго** `role == "courier"`,
   `apps/ios/POS/AliStorePOSApp.swift:62` — `["cashier","admin","owner"]`.
2. `it('создаёт зону доставки со слотами', ...)` — есть `DeliveryZone` с
   `active: true` и минимум 2 связанных `DeliverySlot` с `startsAt > now`.
3. `it('создаёт заказы в статусах paid / courier_assigned / out_for_delivery / delivered', ...)`
4. `it('оставляет одну открытую CashShift на точке', ...)` — `CashShift` без
   `closedAt`, чтобы `GET /shifts/current` в POS отдавал смену.
5. `it('идемпотентен: повторный запуск не дублирует StaffUser', ...)` — сид
   гоняется дважды, `staffUser.count()` не растёт.

**Файлы:**
- `apps/api/prisma/seed.ts` (312 строк, сейчас нет ни одного `staffUser`) —
  добавить блок после `storePoint.upsert` (`:115`) и до `customer.upsert` (`:139`):
  - `prisma.staffUser.upsert` по `username` для 4 ролей;
    пароль берётся из `process.env.SEED_STAFF_PASSWORD`, при отсутствии — падать
    с внятной ошибкой, **не** зашивать дефолтный пароль в код
    (`~/.claude/rules/ecc/common/security.md`: секреты только из окружения);
    хеш — `argon2.hash(...)`, как в `apps/api/src/staff-auth/staff-auth.service.ts:43`;
    `point: 'BISHKEK-1'` (дефолт схемы, `schema.prisma:3037`).
  - `prisma.deliveryZone.upsert` по `code` (уникален, `schema.prisma:995`),
    обязательны `createdBy` и `idempotencyKey` (`:1001-1002`).
  - `prisma.deliverySlot.upsert` по `idempotencyKey` (`:1018`); уникальность пары
    `[zoneId, startsAt, endsAt]` (`:1023`) — считай слоты от начала текущих суток,
    не от `new Date()`, иначе повторный сид создаст дубли.
  - заказы: собирай через существующие в файле `product`/`deviceUnit`/`customer`,
    выставляй `courierId` на демо-курьера для `courier_assigned` / `out_for_delivery`.
  - `prisma.cashShift.upsert` — открытая смена на демо-кассира.
- `apps/api/prisma/seed.ts` — вынести тело в `export async function seedDemo(prisma)`
  и оставить вызов на верхнем уровне, чтобы e2e мог импортировать функцию.

**Переиспользовать:**
- `argon2.hash` — точно как `apps/api/src/staff-auth/staff-auth.service.ts:43`.
- `e2e/helpers.ts:169-185` `seedStaffCredentials` — как образец полей `StaffUser`
  и выпуска JWT. **Не копировать в seed.ts**, только как образец: helpers
  подписывают токен вручную dev-секретом, а сид должен создавать логин/пароль.
- Скрипт запуска уже есть: `npm run db:seed` (`apps/api/package.json:16`).

**НЕ делать в этом срезе:**
- Не создавать `CourierRun` — рейс назначается через `POST /courier/runs`
  (`apps/api/src/courier/courier.controller.ts:59`), это часть демо-сценария, а не сида.
- Не сидить Evidence-файлы (нужен `MediaService` и реальные байты).
- Не менять `schema.prisma` и не заводить миграции — все нужные модели есть.

---

### Срез 3 — Evidence-ключ курьера сквозь весь поток (1.2) ⚠ самый дорогой
**Зависит от:** Срез 2 (без демо-курьера и заказа в `out_for_delivery` руками не проверить).

#### Контракт сервера (менять НЕЛЬЗЯ, зафиксирован)
1. `POST /evidence/images`, multipart, заголовок `Idempotency-Key: K`,
   поля `entityType=order`, `entityId=<orderId>`, `label=<L>`.
   `apps/api/src/evidence/evidence.controller.ts:117` подставляет
   `actor = "staff:" + user.customerId`, `:107` проверяет
   `assertStaffCanAttachOrder` (курьер видит только свой заказ).
   Строка сохраняется в `EvidenceUpload{ idempotencyKey: K, actor, entityType, entityId, label }`.
2. `POST /courier/orders/:id/deliver` — `apps/api/src/courier/courier.controller.ts:90-96`
   зовёт `assertCourierOrderEvidence(dto.evidenceIdempotencyKey, courierId, orderId, 'Подтверждение доставки')`.
3. `POST /deliveries/:id/fail` — `apps/api/src/courier/deliveries.controller.ts:42-47`,
   тот же барьер с меткой `'Неуспешная доставка'`.
4. `apps/api/src/evidence/evidence.service.ts:190` — нет ключа → `courier_evidence_required`;
   `:201-208` — не совпал `actor` / `entityType` / `entityId` / `label` → `courier_evidence_mismatch`.
5. Повторная загрузка **тех же байт** с тем же ключом — идемпотентный replay
   (`evidence.service.ts:54-67, 85-101`). Повторная загрузка **других байт**
   с тем же ключом → 409 `idempotency_key_reused` (`:57`, `:87`).

Из (5) следует главное правило слайса: **ключ живёт вместе с конкретной фотографией.
Новая фотография — новый ключ.**

Эталон правильного порядка — `apps/web/app/courier/page.tsx:296-320` (deliver) и
`:331-350` (fail): сначала `uploadEvidenceImages(... idempotencyKeyPrefix)`,
потом команда с `evidenceIdempotencyKey: \`${prefix}:0\``.

#### Acceptance (пишется первым)

**A. API/e2e (ловит текущую красноту гейта):**
`e2e/ecosystem-courier-cod.spec.ts:137-138` сейчас шлёт `/deliver` **без**
`evidenceIdempotencyKey`, а `postJson` (`e2e/helpers.ts:207`) ассертит `response.ok()`.
Барьер приехал коммитом `7e56e03` позже последней правки спеки (`ad51033`), значит
спека почти наверняка красная уже сейчас. Правка входит в этот срез:
- перед `/deliver` загрузить фото через `POST /evidence/images` с меткой
  `Подтверждение доставки` (образец multipart — `e2e/courier-ui.spec.ts:4-9`,
  там уже лежит валидный `evidencePng`), и передать его ключ в тело `/deliver`.
- добавить негативную проверку: `/deliver` **без** ключа → 422 с кодом
  `courier_evidence_required`.

**B. iOS-контракт (`apps/ios/Tests/CourierEvidenceContractTests.swift`, новый):**
1. `func testCompleteDeliveryRequestCarriesEvidenceKey()` — кодирует
   `CompleteCourierDeliveryRequest(codAmount:reason:evidenceIdempotencyKey:)`,
   утверждает наличие ключа `evidenceIdempotencyKey` в JSON.
   Падает до правки — поля нет.
2. `func testFailDeliveryRequestCarriesEvidenceKey()` — то же для
   `FailCourierDeliveryRequest`.
3. `func testUploadEvidenceSendsCallerProvidedKeyAndLabel()` — через `MockURLProtocol`
   утверждает `Idempotency-Key == "courier-evidence-order-1-delivered-abc"` и что
   тело multipart содержит `name="label"\r\n\r\nПодтверждение доставки`.
4. `func testCourierEvidenceLabelsMatchServerContract()` —
   `XCTAssertEqual(CourierEvidenceLabel.delivered, "Подтверждение доставки")` и
   `XCTAssertEqual(CourierEvidenceLabel.failed, "Неуспешная доставка")`.
   Тест-«якорь»: если кто-то поменяет строку, она разъедется с
   `courier.controller.ts:95` / `deliveries.controller.ts:46` громко, а не тихо.
5. `func testEvidenceTicketIsReusedForSameOrderAndLabel()` и
   `func testEvidenceTicketRotatesKeyWhenPhotoChanges()` — на in-memory
   `ModelContainer` (`ModelConfiguration(isStoredInMemoryOnly: true)`), см. хелперы
   в `apps/ios/Tests/APIClientTests.swift` (там уже конструируется SwiftData-контекст).

**C. UI-тест (`apps/ios/UITests/Courier/AliStoreCourierUITests.swift`):**
- расширить `testSignedInCourierRouteAndCODShell`: кнопка
  `"Доставлено · 45900 сом"` должна быть **disabled**, пока фото не загружено.
  `XCTAssertFalse(app.buttons["Доставлено · 45900 сом"].isEnabled)`.
- добавить `XCTAssertTrue(app.staticTexts["Фото доставки обязательно"].exists)`.

**D. Android (`apps/android/core/src/test/java/kg/alistore/core/CourierCommandManagerTest.kt`):**
- `deliver` без evidence-ключа не компилируется (параметр обязателен);
  новый тест `deliver puts evidenceIdempotencyKey into queued body` — ассертит,
  что `JSONObject(mutation.body).getString("evidenceIdempotencyKey")` равен переданному.

#### Файлы

**1. `apps/ios/Shared/Models.swift`**
- рядом с `CourierDelivery` (`:1187`) добавить:
  ```swift
  /// Метки Evidence, которые сервер сверяет побайтово:
  /// apps/api/src/courier/courier.controller.ts:95 и
  /// apps/api/src/courier/deliveries.controller.ts:46.
  public enum CourierEvidenceLabel {
      public static let delivered = "Подтверждение доставки"
      public static let failed = "Неуспешная доставка"
  }
  ```
- `:1206-1213` `CompleteCourierDeliveryRequest` — добавить
  `public let evidenceIdempotencyKey: String` (**не** optional: сервер без него
  всегда отвергает, optional только вернёт дефект) и обновить `init`.
- `:1215-1218` `FailCourierDeliveryRequest` — то же самое.

**2. `apps/ios/Shared/APIClient.swift:148-185` `uploadEvidence`**
- `idempotencyKey: String? = nil` → `idempotencyKey: String` (обязателен, без дефолта).
- `:173` — `request.setValue(idempotencyKey ?? UUID().uuidString, ...)` →
  `request.setValue(idempotencyKey, ...)`. Это и есть корень дефекта: ключ рождался
  и умирал внутри метода.

**3. Новый `apps/ios/Shared/CourierEvidenceTicket.swift`**
```swift
import Foundation
import SwiftData

/// Долгоживущая привязка «заказ + метка → idempotency-key загруженного фото».
/// Нужна потому, что сервер принимает deliver/fail только по ключу уже
/// загруженного Evidence, а курьер может закрыть приложение между фото и
/// подтверждением. Живёт в том же SwiftData-контейнере, что и PendingMutation.
@Model
public final class CourierEvidenceTicket {
    @Attribute(.unique) public var id: String   // "\(orderId)|\(label)"
    public var orderId: String
    public var label: String
    public var idempotencyKey: String
    public var uploadedAt: Date?
    public var createdAt: Date
    ...
}

@MainActor
public enum CourierEvidenceTickets {
    /// Возвращает существующий тикет или заводит новый с свежим ключом.
    public static func ticket(orderId: String, label: String, context: ModelContext) throws -> CourierEvidenceTicket
    /// Курьер выбрал ДРУГОЕ фото → новый ключ, uploadedAt = nil.
    /// Иначе сервер вернёт 409 idempotency_key_reused (evidence.service.ts:57).
    public static func rotate(_ ticket: CourierEvidenceTicket, context: ModelContext) throws
    public static func markUploaded(_ ticket: CourierEvidenceTicket, context: ModelContext) throws
    /// Вызывается после подтверждения команды сервером.
    public static func clear(orderId: String, context: ModelContext) throws
}
```
Формат ключа: `"ios-courier-evidence-\(orderId)-\(labelSlug)-\(UUID().uuidString)"`,
где `labelSlug` — `"delivered"` / `"failed"`. Длина < 128 (лимит
`evidence.service.ts:39` и `evidence.controller.ts:91`) — проверить в тесте.

**4. `apps/ios/Shared/OfflineQueue.swift:271`**
- `ModelContainer(for: PendingMutation.self)` →
  `ModelContainer(for: PendingMutation.self, CourierEvidenceTicket.self)`.
  Новая сущность — lightweight-миграция SwiftData, `PendingMutation` не трогаем.

**5. `apps/ios/Courier/CourierOperationsView.swift`**
- `CourierEvidenceView` (`:426-489`):
  - добавить свойства `let label: String` и `@Environment(\.modelContext) private var modelContext`;
  - `:481` `label: "delivery_proof"` → `label: label` — **это вторая половина
    дефекта: даже если бы ключ дошёл, метка не совпала бы и сервер вернул
    `courier_evidence_mismatch`** (`evidence.service.ts:206`);
  - `upload()` (`:470-488`): взять `ticket = try CourierEvidenceTickets.ticket(orderId:label:context:)`,
    передать `idempotencyKey: ticket.idempotencyKey`, на успехе
    `CourierEvidenceTickets.markUploaded(...)`;
  - в `.onChange(of: selectedPhoto)` (`:461`) и в колбэке `CourierCameraPicker`
    (`:460`) — перед присвоением новых байт вызвать `CourierEvidenceTickets.rotate(...)`;
  - при ошибке сети показать текст «Фото не отправлено: нет сети. Доставку нельзя
    подтвердить без фото» (не молчать — `~/.claude/rules/ecc/common/coding-style.md`).
- `CourierDeliveryCard` (`:293-424`):
  - `:331` `CourierEvidenceView(orderId:session:)` → две штуки:
    одна с `label: CourierEvidenceLabel.delivered` над блоком COD,
    вторая с `label: CourierEvidenceLabel.failed` над полем причины неудачи;
  - `@Query` тикетов заказа; кнопка `"Доставлено · N сом"` (`:342`) получает
    в `disabled` дополнительное условие «нет тикета `delivered` с `uploadedAt != nil`»;
    кнопка `"Не удалось доставить"` (`:355`) — то же с меткой `failed`;
    рядом статичный текст `"Фото доставки обязательно"`, когда фото нет;
  - `:345-350` — передать `evidenceIdempotencyKey: ticket.idempotencyKey`;
  - `:359` — то же для `FailCourierDeliveryRequest`;
  - `execute(...)` (`:400-410`): `UUID().uuidString` → детерминированный ключ
    команды `"ios-courier-deliver-\(delivery.id)"` / `"ios-courier-fail-\(delivery.id)"`.
    Сейчас двойной тап = две разные команды; образец правильного —
    `CourierRunCard.handover` (`:555`, `"courier-handover-\(run.id)"`);
  - после успешного ответа сервера — `CourierEvidenceTickets.clear(orderId:context:)`.

**6. Остальные вызовы `uploadEvidence` (сигнатура стала строгой)**
Передать явный `idempotencyKey: UUID().uuidString` **без расширения логики**:
- `apps/ios/Staff/StaffScannerView.swift:440`
- `apps/ios/POS/POSOperationsView.swift:409`
- `apps/ios/Client/AliStoreClientApp.swift:3162` и `:3493`

**7. Android — зеркало**
- `apps/android/core/src/main/java/kg/alistore/core/CourierGateway.kt:6-7` —
  `completeDelivery` и `failDelivery` получают `evidenceIdempotencyKey: String`.
- `apps/android/core/src/main/java/kg/alistore/core/ApiClient.kt:277-298` —
  положить `.put("evidenceIdempotencyKey", evidenceIdempotencyKey)` в тело обеих команд.
- `ApiClient.kt:394-401` `uploadStaffEvidence` — добавить параметр
  `idempotencyKey: String` и пробросить в `uploadEvidenceRequest` (`:403-412`),
  где сейчас `idempotencyKey: String = UUID.randomUUID().toString()` съедает ключ.
- `apps/android/core/src/main/java/kg/alistore/core/CourierOperationsScreens.kt:97-109` —
  `CourierCommandManager.deliver/fail` получают ключ и кладут его в `body`
  (важно: тело уходит в офлайн-очередь как есть, `OfflineQueueDb.enqueue`).
- `CourierOperationsScreens.kt:405` — метка `"Подтверждение доставки"` уже верная,
  но ключ теряется; сохранить его в новой таблице.
- `apps/android/core/src/main/java/kg/alistore/core/OfflineQueueDb.kt` — версия
  SQLiteOpenHelper `2 → 3`, новая таблица
  `courier_evidence_ticket(order_id, label, idempotency_key, uploaded_at, PRIMARY KEY(order_id,label))`,
  создание в `onCreate` **и** в `onUpgrade` при `oldVersion < 3`.

**8. Web — не трогать.** `apps/web/lib/api/courier.ts:67,83` и
`apps/web/app/courier/page.tsx:296-350` уже корректны, это эталон.

**Переиспользовать:**
- `EvidenceMultipart.build` (`apps/ios/Shared/APIClient.swift:20-40`) — уже умеет `label`.
- `OfflineCourierQueue.enqueueEncoded` (`apps/ios/Shared/OfflineQueue.swift:107-125`) —
  она уже дедуплицирует по `idempotencyKey`, второй раз ту же команду не поставит.
- `shouldQueue(_:)` (`CourierOperationsView.swift:203-212`) — правило «что уходит в офлайн».
- `evidencePng` из `e2e/courier-ui.spec.ts:4-9` для e2e-правки.

**НЕ делать в этом срезе:**
- Не ставить **фото** в офлайн-очередь. Сервер не примет deliver без Evidence,
  значит очередь дала бы гарантированный `conflict`. Правильное поведение
  сегодня — кнопка заблокирована, пока фото не улетело. Отдельная задача в BACKLOG.
- Не менять `courier.dto.ts` на `@IsNotEmpty()` — DTO остаётся `@IsOptional()`,
  барьер держит `evidence.service.ts:190`, и его уже покрывает
  `apps/api/test/courier-print-rbac.e2e-spec.ts:213`.
- Не переписывать `CourierRunCard.handover` — там ключ уже стабильный.
- Не трогать retention/purge Evidence (`evidence-retention.policy.ts`).
- Не добавлять несколько фото на одну доставку (web умеет `uploadEvidenceImages`
  с префиксом, iOS — одно фото; паритет — отдельная задача).

---

### Срез 4 — Сброс PIN с экрана блокировки требует доказательства личности (1.3)
**Зависит от:** ничего.

**Acceptance (пишется первым):**
Новый `apps/ios/Tests/LocalPINStoreTests.swift`.

⚠ Предварительное условие: `LocalPINStore` сейчас жёстко зашит на
`SecureTokenStore` (Keychain). Таргет `AliStoreCoreTests` — `bundle.unit-test`
**без host application** (`apps/ios/project.yml:215-223`), доступ к Keychain
оттуда не гарантирован. Поэтому первым шагом — DI по правилу
`~/.claude/rules/ecc/swift/patterns.md`:
```swift
public protocol QuickUnlockSecretStorage: Sendable {
    func read(account: String) throws -> String?
    func save(_ value: String, account: String) throws
    func clear(account: String) throws
}
extension SecureTokenStore: QuickUnlockSecretStorage {}

public struct LocalPINStore: Sendable {
    private let storage: any QuickUnlockSecretStorage
    public init(service: String) { self.storage = SecureTokenStore(service: service) }
    public init(storage: any QuickUnlockSecretStorage) { self.storage = storage }
}
```
Тесты гоняются на in-memory реализации.

1. `func testSaveRejectsOverwriteWhenPinAlreadyConfigured()` — после `save(pin:)`
   второй `save(pin:)` бросает `QuickUnlockError.pinAlreadyConfigured`.
   **Падает до правки** — сейчас `:80-86` молча перетирает хеш.
2. `func testChangeRequiresMatchingCurrentPin()` — `change(currentPIN:"000000", to:"111111")`
   при сохранённом `123456` бросает `.currentPINMismatch` и **не меняет** хеш
   (`matches(pin:"123456")` остаётся `true`).
3. `func testChangeCountsFailuresTowardsLockout()` — 5 неверных `change` подряд
   переводят `attemptStatus.allowed` в `false`. Сейчас обход тривиален: сброс PIN
   не считается попыткой и вдобавок чистит счётчик (`:85`).
4. `func testChangeSucceedsWithCorrectCurrentPin()` — хеш меняется, счётчик очищен.
5. `func testResetAfterBiometricUnlockWritesNewPin()` — путь без старого PIN,
   разрешён только вызывающему, который уже получил `true` от биометрии.
6. `func testLockoutBlocksChangeEvenWithCorrectPin()`.

UI-часть (нельзя покрыть юнитом) — через MCP `xcodebuild`:
`build_run_sim` схемы `AliStoreCourier` с `--ui-testing-signed-in --ui-testing-role=courier
--ui-testing-quick-unlock`, затем `snapshot_ui`: убедиться, что кнопка
«Изменить PIN» открывает лист, где есть поле «Текущий PIN» либо кнопка
«Подтвердить Face ID», и что «Сохранить PIN» неактивна без одного из них.

**Файлы:**
- `apps/ios/Shared/QuickUnlock.swift:50-119` `LocalPINStore`:
  - добавить проток-хранилище и второй `init` (см. выше);
  - `:80-86` `save(pin:)` — в начале `guard !isConfigured else { throw QuickUnlockError.pinAlreadyConfigured }`;
  - добавить `public func change(currentPIN: String, to newPIN: String) throws`:
    `attemptStatus.allowed` → иначе `.lockedOut`; `matches(pin: currentPIN)` →
    иначе `registerFailure()` + `.currentPINMismatch`; затем запись + `registerSuccess()`;
  - добавить `public func resetAfterBiometricUnlock(to newPIN: String) throws`
    (та же запись без проверки PIN);
  - вынести запись хеша в `private func write(pin:) throws`, чтобы соль/SHA256
    (`:82-84`) не дублировались в трёх местах (DRY).
- `apps/ios/Shared/QuickUnlock.swift:121-127` `QuickUnlockError` — добавить кейсы
  `pinAlreadyConfigured`, `currentPINMismatch`, `lockedOut` с русскими
  `errorDescription` в стиле существующего.
- `apps/ios/Shared/QuickUnlock.swift:241-250` — кнопка `showingSetup = true`
  остаётся видимой всегда (менять PIN нужно уметь), но лист `pinSetup`
  (`:282-346`) получает:
  - `@State private var currentPin = ""` и `@State private var biometricProven = false`;
  - когда `pinStore.isConfigured`: поле `SecureField("Текущий PIN", ...)` +
    кнопка «Подтвердить Face ID» (доступна при `biometricAvailable`), которая
    ставит `biometricProven = true` только внутри success-ветки
    `BiometricAuthenticator().unlock(reason:)` (`:407-411` — образец);
  - `:313-324` — ветвление: `!isConfigured` → `save(pin:)`;
    `biometricProven` → `resetAfterBiometricUnlock(to:)`;
    иначе → `change(currentPIN:to:)`; ошибки писать в `message`;
  - кнопка «Сохранить PIN» (`:334`) — в `disabled` добавить
    «`isConfigured` и не (`biometricProven` или `currentPin.count == 6`)».
- Зеркало Android:
  - `apps/android/core/src/main/java/kg/alistore/core/QuickUnlock.kt:71-79`
    `savePin` — расщепить на `savePin` (только когда `!isPinConfigured`),
    `changePin(current, next)`, `resetPinAfterBiometric(next)`;
  - `QuickUnlock.kt:185` — экран показывает поля настройки безусловно; добавить
    поле «Текущий PIN» / подтверждение биометрией по той же логике;
  - тест-зеркало в `apps/android/core/src/test/java/kg/alistore/core/` рядом с
    существующими `PinAttemptLimiter`-тестами.

**Переиспользовать:**
- `PINAttemptLimiter` / `attemptStatus` / `registerFailure` — уже есть, не писать заново.
- `BiometricAuthenticator` (`QuickUnlock.swift:12-34`).
- `SecureTokenStore` (`apps/ios/Shared/SecureTokenStore.swift`).

**НЕ делать в этом срезе:**
- Не менять хеш-схему (`v1:salt:sha256`) и не мигрировать существующие PIN.
- Не переносить PIN в `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`.
- Не убирать автозапуск биометрии в `.task` (`:269-273`) — это Срез 5.
- Не трогать `clearQuickUnlock()` в `StaffAuthStore`/`CustomerAuthStore` —
  сброс PIN при логауте остаётся правильным.

---

### Срез 5 — Замок возвращается при уходе в фон (1.4)
**Зависит от:** Срез 4 (иначе замок, который приходит чаще, легче обходится
кнопкой «Изменить PIN»).

**Acceptance (пишется первым):**
Юнитом покрывается только store-часть — новый
`apps/ios/Tests/AuthLockTests.swift`:
1. `func testStaffLockRaisesQuickUnlockOnlyWhenSessionExists()` —
   `StaffAuthStore` c `restoresStoredSession: false`, без сессии `lock()` не
   поднимает `requiresQuickUnlock`; после `login` (мок-транспорт) — поднимает.
2. `func testCustomerLockRaisesQuickUnlock()` — то же для `CustomerAuthStore`;
   после `logout()` `lock()` ничего не делает.
3. `func testUnlockClearsFlag()`.

Поведенческая часть (scenePhase) юнитом не покрывается — проверка через MCP
`xcodebuild`: `build_run_sim` схемы `AliStoreCourier`
(`--ui-testing-signed-in --ui-testing-role=courier`), затем
`button` с `home` (увести в фон) → `launch_app_sim` обратно → `snapshot_ui`
должен показать экран `QuickUnlockView` («Открыть по PIN»), а не «Мой маршрут».
Повторить для `AliStoreStaff`, `AliStorePOS`, `AliStoreClient`.

**Файлы:**
- `apps/ios/Shared/StaffAuthStore.swift` — после `unlock()` (`:78`) добавить:
  ```swift
  /// Возвращает замок при уходе приложения в фон. Пустая сессия не блокируется —
  /// иначе экран логина накрывался бы PIN-экраном.
  public func lock() { if session != nil { requiresQuickUnlock = true } }
  ```
- `apps/ios/Shared/CustomerAuthStore.swift` — тот же метод после `unlock()` (`:124`).
- `apps/ios/Courier/AliStoreCourierApp.swift` — в `body: some Scene` добавить
  `@Environment(\.scenePhase) private var scenePhase` и на корневом контенте
  `WindowGroup`:
  ```swift
  .onChange(of: scenePhase) { _, phase in
      if phase == .background { auth.lock() }
  }
  ```
  Ставить **на уровне App**, а не в `CourierRootView`, потому что обработчик в
  `CourierOperationsView.swift:84` живёт внутри вида, который при блокировке
  исчезает — легко потерять при рефакторинге.
- `apps/ios/POS/AliStorePOSApp.swift` — то же (обработчика scenePhase сейчас нет вообще).
- `apps/ios/Staff/AliStoreStaffApp.swift` — то же на уровне `App`. Существующий
  обработчик на `:1304` (реплей очереди посещаемости) **не трогать**, он про другое.
- `apps/ios/Client/AliStoreClientApp.swift:1041-1046` — расширить существующий
  обработчик:
  ```swift
  .onChange(of: scenePhase) { _, phase in
      if phase == .background { auth.lock() }
      if phase == .active, auth.session != nil { ... как было ... }
  }
  ```

**Переиспользовать:**
- `QuickUnlockView` и `auth.unlock` — точки подключения уже есть во всех четырёх
  приложениях (`AliStoreCourierApp.swift:63`, `AliStorePOSApp.swift:60`,
  `AliStoreClientApp.swift:997-1000`, аналог в Staff).
- `UITestBootstrap.requiresQuickUnlock` — флаг для UI-прогонов уже существует.

**НЕ делать в этом срезе:**
- Не блокировать на `.inactive`. `.inactive` прилетает при шторке уведомлений,
  Control Center и входящем звонке — курьер получил бы PIN-экран посреди работы.
- Не добавлять таймаут «блокировать через N минут» и настройку этого таймаута.
- Не добавлять privacy-блюр снапшота в переключателе приложений (отдельная задача,
  в BACKLOG).

---

### Срез 6 — Фальшивый статус-бар и сломанная safe area в Client (1.7)
**Зависит от:** ничего.

**Решение: удалить.** Обоснование фактом, не вкусом: компонент рисует
константы `«9:41»` и `«▪▪▪ 100%»` (`AliStoreClientApp.swift:156-170`), ради него
включён `.statusBarHidden(true)` (`:996`) и `.ignoresSafeArea(edges: [.top, .bottom])`
(`:992`). Последствия: (а) нижняя навигация лезет под home-indicator,
(б) VoiceOver первым читает на каждом экране «9:41 / 100%» — это прямое нарушение
`~/.claude/rules/ecc/web/testing.md`-раздела про доступность и повод для
Guideline 4.0 при ревью. Функции у компонента нет никакой.

**Acceptance (пишется первым):**
1. `apps/ios/UITests/Client/AliStoreClientUITests.swift` — новый
   `func testDoesNotRenderFakeStatusBar()`:
   `XCTAssertFalse(app.staticTexts["9:41"].exists)` и
   `XCTAssertFalse(app.staticTexts["▪▪▪ 100%"].exists)` на стартовом экране гостя.
   Падает до правки.
2. Визуальная проверка через MCP `xcodebuild` `build_run_sim` +
   `screenshot`: реальный системный статус-бар виден, таб-бар не перекрыт
   home-indicator. Прогнать на iPhone (с вырезом) и iPad — оба размера уже
   гоняет `apps/ios/scripts/visual-capture.sh:106-107`.
3. Перезапустить `npm run ios:visual` — скрипт считает количество PNG-вложений
   (`visual-capture.sh:97`), число не меняется, но скриншоты обновятся.

**Файлы:**
- `apps/ios/Client/AliStoreClientApp.swift:156-170` — удалить `private struct ClientStatusBar`.
- `:964` — удалить строку `ClientStatusBar()`.
- `:992` — `.ignoresSafeArea(edges: [.top, .bottom])` удалить; вместо этого фон:
  `.background(ClientTheme.background.ignoresSafeArea())` (цвет уходит под
  safe area, контент — нет). Строку `:991` `.background(ClientTheme.background)` заменить.
- `:996` — удалить `.statusBarHidden(true)`.
- `.preferredColorScheme(.dark)` (`:995`) — **оставить**: системный статус-бар
  должен быть светлым на тёмном фоне.

**Переиспользовать:**
- `ClientTheme.background`, `ClientBottomNav` (`:213-236`) — уже имеет
  `.padding(.bottom, 8)`, после возврата safe area отступ станет корректным
  автоматически, дополнительных костылей не добавлять.

**НЕ делать в этом срезе:**
- Не переверстывать `ClientHeader` и `ClientBottomNav`.
- Не менять высоты/отступы вслепую «на глаз» — сначала скриншот, потом правка.
- Не трогать `.ignoresSafeArea` внутри overlay-экранов и `ClientOverlayView`.

---

### Срез 7 — «Войти по Face ID» на экране логина Client (1.8)
**Зависит от:** ничего.

**Решение: удалить кнопку.** Обоснование фактом: экран `ClientLoginView`
показывается только когда `auth.session == nil` (`AliStoreClientApp.swift:960`).
В этот момент в Keychain нет ни `customer-session`, ни токенов — биометрия
физически не может никого аутентифицировать, ей нечего разблокировать.
Существующий код (`:342-356`) при успешной биометрии вызывает `onGuest()`, то есть
пользователь, «вошедший по Face ID», оказывается **гостем без аккаунта** — это
ложь интерфейса о факте аутентификации. Разблокировка биометрией существующей
сессии уже реализована и работает — `QuickUnlockView` (`:997-1000`).
Подключить сюда бэкенд нельзя: серверного эндпоинта «логин по биометрии» нет
(`apps/api/src/auth/auth.controller.ts` — только otp/request, otp/verify,
refresh, logout, recovery).

**Acceptance (пишется первым):**
`apps/ios/UITests/Client/AliStoreClientUITests.swift` — новый
`func testLoginScreenHasNoBiometricShortcut()`:
запуск с `--ui-testing-signed-out`, затем
`XCTAssertFalse(app.buttons["client-faceid"].exists)` и
`XCTAssertTrue(app.buttons["client-request-otp"].exists)`.
Падает до правки (сейчас `client-faceid` есть, `:355`).

**Файлы:**
- `apps/ios/Client/AliStoreClientApp.swift:342-356` — удалить весь `Button` с
  `.accessibilityIdentifier("client-faceid")`.
- Кнопку «Продолжить как гость →» (`:357-361`) оставить как есть — это честная
  и единственная гостевая точка входа.
- Проверить, не осиротел ли импорт `LocalAuthentication`/`BiometricAuthenticator`
  в этом файле; если `BiometricAuthenticator` больше не используется в Client —
  импорт убрать, но **не удалять** сам тип из `Shared/QuickUnlock.swift`
  (его использует QuickUnlockView во всех четырёх приложениях).

**НЕ делать в этом срезе:**
- Не реализовывать серверный биометрический вход.
- Не трогать `NSFaceIDUsageDescription` в `project.yml:47` — Face ID остаётся
  нужен для QuickUnlock, и `store-preflight.sh:80` сверяет эту строку.

---

### Срез 8 — Фикстурные экраны Client уходят из Release (1.6)
**Зависит от:** Срез 6 (обе правки в одном месте `AccountView`/шелла — чтобы не
конфликтовать по одному файлу дважды).

**Решение по каждому экрану — «убрать вход из Release», файлы оставить.**
Обоснование по фактам бэкенда:

| Экран | Что вызывается сейчас | Есть ли эндпоинт | Решение |
|---|---|---|---|
| `OrderTrackingView` (`:3816`) | `.sample`: заказ №4102, курьер «Данияр», телефон | `GET /orders/mine`, `GET /orders/:id` есть, **и уже подключены** через `OrdersView` (`:3797`) | убрать плитку — дубль реального экрана |
| `InstallmentView` (`:3820`) | `.sample`, кнопка «Оплатить» — пустое действие | `/debts` есть, но контроллер целиком под `JwtAuthGuard + ActiveStaffGuard + PermissionGuard` (`debts.controller.ts:22`) — **клиентского эндпоинта нет** | убрать плитку |
| `SupportChatView` (`:3823`) | локальный бот, утверждает «Тикет создан», сети не касается | `POST/GET /support/tickets/mine` есть и **уже подключены** через `CustomerSupportView` (`:3806`) | убрать плитку — дубль + ложное утверждение |
| `WaitlistView` (`:3826`) | `UserDefaults`, при первом запуске сам себе выдумывает 2 «ожидания» | `grep waitlist` по `apps/api/src` и `schema.prisma` — **пусто** | убрать плитку |
| `ReferralView` (`:3828`) | код + статистика бонусов, локально | `grep referral` — **пусто** | убрать плитку |

Файлы `apps/ios/Client/Features/*.swift` **не удаляем**: они достижимы только
через `ClientDebugFeature.fromLaunch` (`ClientDebugFeature.swift:17`), а
`UITestBootstrap.featureRoute` (`UITestBootstrap.swift:122-131`) в Release
всегда возвращает `nil` (`#if DEBUG`). То есть в проде они уже недостижимы —
дефект ровно в пяти плитках, которые их открывают.

**Acceptance (пишется первым):**
`apps/ios/UITests/Client/AliStoreClientUITests.swift` — новый
`func testAccountMenuHasNoFixtureBackedTiles()`:
запуск `["--ui-testing-signed-in", "--ui-testing-account"]` (хелпер
`launchSignedInAccount()` уже есть на `:460`), затем пять
`XCTAssertFalse(app.staticTexts["Отследить заказ"].exists)` и т.д. для
«Моя рассрочка», «Живой чат», «Снова в наличии», «Пригласи друга»;
плюс `XCTAssertTrue(app.staticTexts["Мои заказы"].exists)` и
`XCTAssertTrue(app.staticTexts["Поддержка"].exists)` — реальные остаются.

**Файлы:**
- `apps/ios/Client/AliStoreClientApp.swift:3814-3829` — удалить пять
  `AccountMenuTile` (Отследить заказ / Моя рассрочка / Живой чат /
  Снова в наличии / Пригласи друга). Остальные 8 плиток не трогать.
- Проверить, что после удаления `LazyVGrid` (`:3795`) остаётся чётной сеткой
  2×N — 13 плиток стало 8, вёрстка не ломается.

**Переиспользовать:**
- `launchSignedInAccount(arguments:)` (`AliStoreClientUITests.swift:464`).
- `ClientDebugFeature` — уже готовый DEBUG-only маршрут для дизайнерских прогонов.

**НЕ делать в этом срезе:**
- Не удалять `apps/ios/Client/Features/*.swift` и не трогать `ClientDebugFeature`.
- Не реализовывать waitlist/referral на бэкенде — это отдельные фичи, не дефекты.
- Не трогать `testClientPrototypeVisualEvidencePart1/2`
  (`AliStoreClientUITests.swift:344-457`) — проверено: он по этим плиткам не ходит,
  количество PNG-вложений не изменится.

---

### Срез 9 — Мокапы «Добавить товар» в Staff (1.5)
**Зависит от:** ничего.

**Решение: удалить режим `addProduct` целиком.** Обоснование фактами бэкенда:
- «AI заполнил карточку по штрихкоду» неисполнимо: `POST /ai/categorize`
  (`apps/api/src/ai/categorize.controller.ts:15`) принимает **name**, не штрихкод;
  эндпоинта «штрихкод → карточка» в `apps/api/src` нет вообще
  (`barcode` фигурирует только как поле при создании товара,
  `products.service.ts:143,204`).
- «Отправить на модерацию» (`StaffScannerView.swift:127`) — `POST /products`
  существует (`products.controller.ts:81`), но мок не собирает ни одного поля
  `CreateProductDto`; чтобы его подключить, нужна полноценная форма — это фича,
  а не устранение дефекта.
- «Печать этикетки 40×40» (`:215`, пустое замыкание) — `POST /labels/qr` и
  `POST /labels/imei` есть (`labels.controller.ts:22,28`), но печатать этикетку
  товара, которого не создали, бессмысленно.
- Оставшиеся два режима (`buyback`, `evidence`) — реальные и остаются.

Задача «Staff: приёмка нового товара (форма + /ai/categorize + /products + /labels)»
записывается в `BACKLOG.md`, а не делается здесь.

**Acceptance (пишется первым):**
`apps/ios/UITests/Staff/AliStoreStaffUITests.swift:125-145` — существующий тест
**утверждает мок** («🤖 AI заполнил карточку», «Товар отправлен на модерацию»,
«4 870123 456789»). Его надо заменить на:
`func testScannerHasNoAddProductMock()` — запуск с
`["--ui-testing-signed-in", "--ui-testing-role=sales"]`, затем
`XCTAssertFalse(app.staticTexts["🤖 AI заполнил карточку"].exists)`,
`XCTAssertFalse(app.buttons["Отправить на модерацию"].exists)`,
`XCTAssertFalse(app.staticTexts["4 870123 456789"].exists)`,
и позитив: `XCTAssertTrue(app.staticTexts["Скупка Б/У"].exists ||
app.buttons["Скупка"].exists)`, `XCTAssertTrue(app.buttons["Evidence"].exists)`.

**Файлы:**
- `apps/ios/Staff/StaffScannerView.swift`:
  - `:7-21` — убрать кейс `addProduct` из `StaffScannerMode`;
  - `:61-62` — убрать ветку `case .addProduct: addProductSection`;
  - `:118-137` `addProductSection`, `:139-179` `scanProductCard`,
    `:181-194` `aiProductCard`, `:196-236` `submittedProductCard` — удалить;
  - `:363,371` — убрать строки заголовка/подзаголовка для `.addProduct`;
  - `:407-414` `scanProductCode()` — удалить (использовался только моком);
  - `@State private var addProductSubmitted` — удалить;
  - `@State private var code` / `entityId` — проверить, используются ли
    `buybackSection`/`evidenceSection`; если да — оставить, если нет — удалить.
- Проверить вызывающую сторону: биндинг `mode` приходит извне
  (`@Binding private var mode`) — найти владельца в `apps/ios/Staff/` и убедиться,
  что дефолтное значение больше не `.addProduct`.
- Зеркало Android: `apps/android/core/src/main/java/kg/alistore/core/StaffScannerScreen.kt`
  — проверить, есть ли там такой же мок; если есть, удалить и поправить
  `apps/android/core/src/androidTest/java/kg/alistore/core/StaffScannerScreenTest.kt`.

**Переиспользовать:**
- `evidenceSection` (`:281`) уже ходит в `uploadEvidence` — эталон живого экрана
  внутри этого же файла.

**НЕ делать в этом срезе:**
- Не реализовывать форму создания товара, не подключать `/ai/categorize`,
  не подключать печать этикеток.
- Не трогать `buybackSection` и `evidenceSection`.

---

### Срез 10 — POS: вечный спиннер на пустом каталоге (1.11)
**Зависит от:** ничего.

**Acceptance (пишется первым):**
UI-тест в `apps/ios/UITests/POS/AliStorePOSUITests.swift` требует фикстуру
пустого каталога, которой нет. Порядок:
1. Добавить в `apps/ios/Shared/UITestBootstrap.swift` флаг по образцу
   `usesCashShiftFixture` (`:67-73`):
   ```swift
   public static var usesEmptyCatalogFixture: Bool {
       #if DEBUG
       ProcessInfo.processInfo.arguments.contains("--ui-testing-empty-catalog")
       #else
       false
       #endif
   }
   ```
2. `apps/ios/POS/POSSaleView.swift:188-195` (DEBUG-блок `refresh()`) — при этом
   флаге отдавать `products = []`, `errorMessage = nil`.
3. Новый тест `func testEmptyCatalogShowsEmptyStateNotSpinner()`:
   запуск `["--ui-testing-signed-in", "--ui-testing-role=cashier", "--ui-testing-empty-catalog"]`,
   `XCTAssertTrue(app.staticTexts["Каталог пуст"].waitForExistence(timeout: 10))`,
   `XCTAssertFalse(app.activityIndicators.firstMatch.exists)`.
   Падает до правки — сейчас крутится `ProgressView("Загружаем каталог…")`.

**Файлы:**
- `apps/ios/POS/POSSaleView.swift`:
  - добавить `@State private var isLoadingCatalog = true`;
  - `:186-202` `refresh()` — `isLoadingCatalog = true` в начале,
    `defer { isLoadingCatalog = false }` сразу после;
  - `:41` — заменить
    ```swift
    if products.isEmpty && errorMessage == nil { ProgressView("Загружаем каталог…") }
    ```
    на
    ```swift
    if isLoadingCatalog {
        ProgressView("Загружаем каталог…")
    } else if products.isEmpty && errorMessage == nil {
        ContentUnavailableView(
            "Каталог пуст",
            systemImage: "shippingbox",
            description: Text("Товары появятся после загрузки номенклатуры в ERP.")
        )
    }
    ```

**Переиспользовать:**
- `ContentUnavailableView` — уже используется в
  `apps/ios/Courier/CourierOperationsView.swift:269,508` и
  `apps/ios/Courier/AliStoreCourierApp.swift:67`. Не изобретать свой пустой стейт.
- `POSNotice` (`POSSaleView.swift:40`) — для ошибок, остаётся как есть.

**НЕ делать в этом срезе:**
- Не чинить `async let` в `refresh()` (`:197-200`): при падении `shifts/current`
  каталог тоже не присваивается. Это отдельный дефект — записать в `BACKLOG.md`.
- Не трогать `POSOperationsView`, сканер, корзину, чек.

---

### Срез 11 — Privacy-манифесты для четырёх приложений (1.9)
**Зависит от:** Срез 3 и 8 (набор собираемых данных должен быть окончательным:
после Среза 8 Client перестаёт собирать локальный waitlist).

**Acceptance (пишется первым):**
Автоматического гейта на iOS нет — acceptance статический, добавляется в
`apps/ios/scripts/store-preflight.sh` (Срез 12 расширит его на 4 таргета,
но проверки манифеста заводим здесь):
1. Для каждого из `Client/Staff/Courier/POS` файл `PrivacyInfo.xcprivacy`
   существует, `NSPrivacyTracking == false` (проверка уже есть для Client,
   `store-preflight.sh:82-83`).
2. Новая проверка: `NSPrivacyCollectedDataTypes` присутствует и непуст —
   `"$plist_buddy" -c 'Print :NSPrivacyCollectedDataTypes:0:NSPrivacyCollectedDataType'`
   возвращает непустую строку, иначе `fail`.
3. Новая проверка: если в исходниках таргета есть `UserDefaults`, то в манифесте
   объявлен `NSPrivacyAccessedAPICategoryUserDefaults`. Реализовать простым
   `grep -rq "UserDefaults" "$ios_root/$target"` + PlistBuddy.
   Факт на сегодня: `UserDefaults` есть в `Client/AliStoreClientApp.swift`,
   `Client/Features/WaitlistView.swift`, `Staff/AliStoreStaffApp.swift`,
   `Courier/CourierOperationsView.swift:196-200`, `POS/AliStorePOSApp.swift`.
4. Ручной прогон: `npm run ios:store-preflight` → зелёный.

**Файлы:**
- Создать `apps/ios/Staff/PrivacyInfo.xcprivacy`,
  `apps/ios/Courier/PrivacyInfo.xcprivacy`, `apps/ios/POS/PrivacyInfo.xcprivacy`
  по образцу `apps/ios/Client/PrivacyInfo.xcprivacy` (NSPrivacyTracking=false +
  `NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1`).
- Во все четыре добавить `NSPrivacyCollectedDataTypes`. Состав — по фактам кода,
  не по догадке; собрать так:
  - **Client**: `NSPrivacyCollectedDataTypePhoneNumber` (OTP-логин,
    `auth/otp/request`), `NSPrivacyCollectedDataTypeName`,
    `NSPrivacyCollectedDataTypePhysicalAddress` (адрес доставки в
    `CreateOrderRequest.deliveryAddress`), `NSPrivacyCollectedDataTypePurchaseHistory`
    (`orders/mine`), `NSPrivacyCollectedDataTypePhotosorVideos`
    (`uploadEvidence` на `:3162`, `:3493` — возвраты/гарантия/trade-in),
    `NSPrivacyCollectedDataTypeDeviceID` (push-токен + installation-id).
    Для каждого: `LinkedToUser = true`, `Tracking = false`,
    Purposes = `NSPrivacyCollectedDataTypePurposeAppFunctionality`.
  - **Courier**: `PhoneNumber` и `PhysicalAddress` (данные клиента в
    `CourierDelivery.customer` / `deliveryAddress`),
    `PhotosorVideos` (Evidence доставки), `DeviceID`.
  - **Staff**: `PhotosorVideos` (Evidence Vault, включая фото паспорта при скупке),
    `PhoneNumber`, `Name`, `DeviceID`.
  - **POS**: `PurchaseHistory`, `PhoneNumber` (привязка покупателя к чеку),
    `PhotosorVideos` (фото состояния при обмене), `DeviceID`.
- `apps/ios/Shared/PrivacyInfo.xcprivacy` — сверить: в `apps/ios/Shared/*.swift`
  **нет** ни одного обращения к `UserDefaults` (проверено grep'ом). Либо убрать
  ложное объявление, либо оставить как заведомо избыточное — но выбрать явно и
  записать причину в коммите.
- `apps/ios/project.yml` — проверить, что `sources: [Staff, Branding]` и т.п.
  действительно затягивают новый `.xcprivacy` как ресурс. Если XcodeGen
  положит его в Compile Sources вместо Resources — добавить явный
  `sources: - path: Staff/PrivacyInfo.xcprivacy \n buildPhase: resources`.
  После правки обязательно `npm run ios:generate`.

**Переиспользовать:**
- `apps/ios/Client/PrivacyInfo.xcprivacy` как шаблон.
- `plist_buddy` и стиль `fail`-функции из `store-preflight.sh:4-7`.

**НЕ делать в этом срезе:**
- Не заполнять анкету App Privacy в App Store Connect (это ручная операция
  владельца в вебе, не код).
- Не добавлять SDK-манифесты третьих сторон — внешних SDK в проекте нет.
- Не менять `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription`
  в `project.yml` — они заполнены и осмысленны.

---

### Срез 12 — store-preflight покрывает все четыре приложения (1.10)
**Зависит от:** Срез 11 (иначе проверка манифестов сразу упадёт на трёх таргетах).

**Acceptance (пишется первым):**
1. `npm run ios:store-preflight` без аргументов на текущем дереве — зелёный
   и печатает по строке на каждое из 4 приложений.
2. Негативная проверка руками (и записать в `PROGRESS.md` как выполненную):
   временно подменить `ALISTORE_API_BASE_URL` на `http://localhost:4000/api` →
   скрипт падает с уже существующим сообщением
   `ALISTORE_API_BASE_URL must use HTTPS`; вернуть значение.
3. Негативная проверка: временно убрать `apps/ios/POS/PrivacyInfo.xcprivacy` →
   падение с внятным сообщением про POS; вернуть файл.

**Файлы:**
- `apps/ios/scripts/store-preflight.sh`:
  - `:66-121` — обернуть блок проверок Info.plist / PrivacyInfo / entitlements
    в функцию `check_target <SchemeName> <DirName> <BundleId> <DisplayName>`
    и вызвать её четырежды:
    `AliStoreClient / Client / kg.alistore.client / AliStore`,
    `AliStoreStaff / Staff / kg.alistore.staff / "AliStore Staff"`,
    `AliStoreCourier / Courier / kg.alistore.courier / "AliStore Courier"`,
    `AliStorePOS / POS / kg.alistore.pos / "AliStore POS"`.
    Значения сверены с `apps/ios/project.yml` (`:73,86,152,204` и блоки `info:`).
  - `:154-176` — блок `xcodebuild -showBuildSettings` сейчас жёстко
    `-scheme AliStoreClient` (`:154`); перенести внутрь `check_target` и сверять
    для каждой схемы: `API_BASE_URL == $api_base`,
    `PRODUCT_BUNDLE_IDENTIFIER`, `ASSETCATALOG_COMPILER_APPICON_NAME == AppIcon`,
    `APS_ENVIRONMENT == production`, `MARKETING_VERSION == 1.0.0`,
    `CURRENT_PROJECT_VERSION == 2`.
  - `:128-152` (`--strict-signing`) — цикл `case "$application_id"` жёстко
    сравнивает с `kg.alistore.client` (`:143`); расширить на четыре bundle id,
    имена профилей уже заданы в `project.yml`
    (`AliStore Client/Staff/Courier/POS App Store`).
  - `:64` `metadata_file` — сейчас только `client-metadata.json`; проверить, что
    лежит в `apps/ios/store/`, и либо потребовать метаданные на каждое
    приложение, либо явно ограничить валидацию Client'ом с комментарием почему.
  - `NSFaceIDUsageDescription` (`:80`) — сейчас сверяется одна строка Client;
    в `project.yml` у Staff/Courier/POS строки **другие** — вынести ожидаемое
    значение в аргумент `check_target`, а не хардкодить.
- `package.json:28` — скрипт `ios:store-preflight` менять не нужно.

**Переиспользовать:**
- `fail()` (`:3-7`), `plist_buddy`, `awk`-парсер настроек (`:157`) — всё уже есть,
  только параметризовать.
- `scripts/validate-ios-store-metadata.mjs` — вызывать как есть.

**НЕ делать в этом срезе:**
- Не добавлять `--strict-asc` проверки на 4 приложения (ключ ASC один на команду).
- Не заводить новый гейт в `scripts/mvp-verify.mjs` — по `CLAUDE.md` iOS туда
  не входит и не должен: `mvp-verify` не имеет macOS/Xcode в CI.
- Не автоматизировать архивацию и upload.

---

### Срез 13 — Юридические страницы витрины (1.13)
**Зависит от:** ничего технически. **Блокируется данными от владельца** — см. ниже.

⚠ Я не имею права выдумать реквизиты, оператора персональных данных, ИНН,
юридический адрес и контактный e-mail. До того как эти факты предоставит владелец,
слайс исполняется только частично (пункты 1 и 3 ниже), пункт 2 остаётся
заблокированным. Записать блокер в `BACKLOG.md` явным списком «что нужно от владельца»:
наименование юрлица, ОКПО/ИНН, юридический адрес, e-mail для обращений
субъектов ПДн, телефон, номера WhatsApp/Telegram, дата редакции оферты.

**Acceptance (пишется первым):**
Новый `e2e/legal-pages.spec.ts` (Playwright, `npm run e2e`):
1. `test('каналы поддержки — рабочие ссылки, а не переключатели', ...)` —
   `page.goto('/support')`,
   `await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\//)`,
   `Telegram` → `/^https:\/\/t\.me\//`, `Звонок` → `/^tel:/`.
   Падает до правки: `apps/web/app/support/page.tsx:11-13,18` — это
   `useState`-переключатели без `href`.
2. `test('оферта не помечена черновиком и не содержит плейсхолдеров', ...)` —
   `page.goto('/oferta')`,
   `await expect(page.getByText('ЧЕРНОВИК')).toHaveCount(0)`,
   `await expect(page.getByText(/\[[^\]]+\]/)).toHaveCount(0)`.
   Падает: `apps/web/app/oferta/page.tsx:79` (баннер) и `:65-70`
   (`[Наименование компании]`, `[Реквизиты]`, `[Адрес], [E-mail], [Телефон]`),
   `:87` (`Редакция от [Дата]`).
3. `test('политика конфиденциальности называет оператора и канал обращений', ...)` —
   `page.goto('/privacy')`, страница содержит слово «оператор» и валидный
   `mailto:`-линк. Падает: в `apps/web/app/privacy/page.tsx` нет ни того, ни другого.

**Файлы:**
- `apps/web/app/support/page.tsx:11-13` — массив `channels` дополнить полем `href`
  (`https://wa.me/<номер>`, `https://t.me/<канал>`, `tel:<номер>`); `:18` — оставить
  `channel` как выбор канала для формы тикета, но каждый пункт **дополнительно**
  рендерить как `<a href=...>` (сейчас это чистый `useState`, кликнув по нему
  пользователь никуда не попадает).
- `apps/web/app/privacy/page.tsx` — добавить секцию «Оператор персональных данных»
  с наименованием, адресом и `mailto:`.
- `apps/web/app/oferta/page.tsx:65-70` — заменить плейсхолдеры реквизитами;
  `:79-81` — удалить баннер «ЧЕРНОВИК» **только после** того как текст
  подтверждён юристом; `:87` — проставить дату редакции.
- Источник контактов: проверить, нет ли уже единого места
  (`apps/web/components/SiteFooter.tsx`) — если есть, вынести номера туда и
  импортировать, чтобы не разъезжались (DRY).

**Переиспользовать:**
- `e2e/web-route-audit.spec.ts:16-18` — маршруты `/oferta`, `/privacy`, `/support`
  уже в списке аудита; новый спек их дополняет, а не заменяет.
- `e2e/checkout-consent.spec.ts:26-27` — уже проверяет, что чекаут ссылается на
  `/oferta` и `/privacy`; значит эти страницы — часть юридического пути покупки.

**НЕ делать в этом срезе:**
- Не сочинять юридический текст оферты и политики. Правка — подстановка
  предоставленных фактов и снятие плейсхолдеров, не авторство.
- Не менять форму создания тикета (`uploadEvidenceImages` + `openSupportTicket`) —
  она работает.

---

## Чего не смог проверить

1. **Ничего не собирал и не запускал.** Ограничение задачи — только чтение,
   симулятор не занимать. Не выполнялись: `npm run ios:build`, `ios:test`,
   `ios:visual`, `api:test`, `npm run e2e`, `mvp:verify`, `xcodegen generate`.
   Все «падает до правки» — вывод из чтения кода, а не наблюдённый прогон.
2. **`e2e/ecosystem-courier-cod.spec.ts` почти наверняка уже красная.**
   `:137-138` шлёт `/courier/orders/:id/deliver` без `evidenceIdempotencyKey`,
   а `postJson` (`e2e/helpers.ts:207`) ассертит `response.ok()`. Барьер
   `assertCourierOrderEvidence` приехал коммитом `7e56e03` (2026-07-21), а спека
   последний раз правилась в `ad51033`, который является предком `7e56e03`.
   Вывод по истории git, прогоном не подтверждён. Если это так — Срез 3 чинит
   не только iOS, но и уже сломанный гейт.
3. **Работает ли Keychain в хостлесс-таргете `AliStoreCoreTests`.**
   `apps/ios/project.yml:215-223` — `bundle.unit-test` без `testTargetName`.
   На симуляторе обычно работает, на устройстве — `errSecMissingEntitlement (-34018)`.
   Поэтому Срез 4 предписывает DI-хранилище, а не полагается на удачу.
4. **Наличие записей в App Store Connect и профилей** для
   `kg.alistore.staff/courier/pos`. `project.yml` называет профили
   «AliStore Staff/Courier/POS App Store», но существуют ли они — не проверял
   (`security find-identity` не запускал).
5. **Юридические факты** (наименование юрлица, реквизиты, оператор ПДн,
   e-mail, телефоны, номера WhatsApp/Telegram, дата редакции). Их нет в репозитории
   и я не имею права их изобрести.
6. **Полный аудит Required Reason API** для Срезов 11. Проверил только
   `UserDefaults` (есть во всех четырёх app-таргетах, нет в `Shared`) и отсутствие
   `CoreLocation`. Не проверял `FileManager` file-timestamp API, `systemUptime`,
   `activeProcessorCount`, disk-space API — junior должен прогнать grep по полному
   списку Apple перед подачей.
7. **`apps/ios/build/AliStoreClient-preflight.xcarchive`** лежит в рабочем дереве
   (нашёлся при grep'е по dSYM). Отслеживается ли он git'ом — не проверял; если да,
   это отдельная задача гигиены репозитория, не входит ни в один срез.
8. **SwiftLint.** `package.json:25` объявляет `ios:lint`, `apps/ios/.swiftlint.yml`
   в `git status` числится как новый неотслеживаемый файл, а `CLAUDE.md` утверждает
   «нет ESLint и Prettier, единственный статический гейт — tsc». Установлен ли
   swiftlint в окружении — не проверял. Не закладывался на него ни в одном срезе.
9. **Android-зеркала** (Срезы 3, 4, 9) размечены по grep'у сигнатур и вызовов;
   покрытие Compose-тестами (`apps/android/core/src/androidTest/`) детально не читал.
10. **Рабочее дерево грязное** — `git status` на момент старта показывал ~40
    изменённых файлов, включая `apps/api/src/evidence/*`, `apps/ios/Shared/UITestBootstrap.swift`,
    `apps/web/lib/api/evidence.ts`. Часть номеров строк могла сдвинуться;
    перед правкой сверяться `git status` (требование `CLAUDE.md`).

---

## Последствия для сборки

**Требуют нового архива и перезаливки в App Store Connect** (меняется бинарник):

| Срез | Что меняется | Какие приложения пересобирать |
|---|---|---|
| 1 — OTP | Swift в `AliStoreCore` | **все четыре** (общий фреймворк) |
| 3 — Evidence курьера | `AliStoreCore` + Courier + call-sites в Staff/POS/Client | **все четыре** |
| 4 — Сброс PIN | `AliStoreCore/QuickUnlock.swift` | **все четыре** |
| 5 — Замок в фоне | `AliStoreCore` + все четыре App-структуры | **все четыре** |
| 6 — Статус-бар | Client | Client |
| 7 — Face ID | Client | Client |
| 8 — Фикстуры | Client | Client |
| 9 — Мокапы Staff | Staff | Staff |
| 10 — POS пустой каталог | `AliStoreCore/UITestBootstrap.swift` + POS | **все четыре** (изменён Core) |
| 11 — Privacy-манифесты | ресурсы бандлов | Staff, Courier, POS (+Client, если правится Shared-манифест) |

**Не требуют архива:**
- Срез 2 (сид) — только `apps/api`, деплоится с бэкендом.
- Срез 12 (preflight) — bash-скрипт, гейт перед архивом, сам в бандл не входит.
- Срез 13 (юридические страницы) — Next.js витрина. **Но:** App Review открывает
  URL политики конфиденциальности из метаданных, поэтому `/privacy` и `/oferta`
  должны быть выкачены **до** отправки любого билда на ревью.

**Порядок выпуска, который минимизирует число архивов:**
Срезы 1, 3, 4, 5, 10 трогают `AliStoreCore` → делать их подряд и собирать
**один** архив на приложение после Среза 11. Отдельные архивы после каждого среза
не нужны и только жгут номера сборок.

**Обязательное перед архивом:**
- `CURRENT_PROJECT_VERSION` в `apps/ios/project.yml:12` сейчас `2`, а
  `store-preflight.sh:172` жёстко требует `== 2`. При новой заливке номер сборки
  придётся поднять — **и одновременно** поправить ожидание в скрипте, иначе
  preflight упадёт. Это ловушка, её надо заложить в Срез 12: сверять с
  `project.yml`, а не с константой.
- `npm run ios:generate` после любой правки `project.yml` (Срез 11).
- `npm run ios:store-preflight` — зелёный на всех четырёх (Срез 12).

**Риски ревью, которые закрываются планом:**
- Guideline 2.1 (placeholder/incomplete content) — Срезы 8, 9, 13.
- Guideline 5.1.1 / privacy manifest — Срез 11.
- Guideline 4.0 (доступность, VoiceOver читает фальшивое «9:41») — Срез 6.
- Функциональный блокер «приложение невозможно использовать» — Срезы 1 (вход
  в Client) и 3 (курьер не может закрыть доставку).

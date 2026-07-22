import AliStoreCore
import Foundation
import XCTest

/**
 Регрессия STAFF-004: PIN сбрасывался с экрана блокировки без знания старого.

 `QuickUnlockView` рисует кнопку «Изменить PIN» прямо на locked-экране, а
 `LocalPINStore.save(pin:)` перезаписывал хеш без единой проверки и вдобавок
 обнулял счётчик неудачных попыток. Человек, взявший разблокированный телефон
 кассира, ставил свой PIN за пятнадцать секунд и получал доступ к смене, выручке
 и Customer 360. Дефект был во всех четырёх iOS-приложениях.

 Чинится на уровне API, а не пряталкой кнопки: перезапись PIN невозможна как
 операция, пока не доказано знание текущего.

 Хранилище внедряется, потому что `AliStoreCoreTests` — hostless-бандл, а
 `ios:test` идёт с `CODE_SIGNING_ALLOWED=NO`: без подписи Keychain отвечает
 `errSecMissingEntitlement`, и тест проверял бы окружение, а не логику.
 */
final class QuickUnlockTests: XCTestCase {
    /// Хранилище в памяти с той же семантикой, что у `SecureTokenStore`.
    private final class MemoryStorage: QuickUnlockStorage, @unchecked Sendable {
        private var items: [String: String] = [:]
        func save(_ value: String, account: String) throws { items[account] = value }
        func read(account: String) throws -> String? { items[account] }
        func clear(account: String) throws { items[account] = nil }
    }

    private func configuredStore(pin: String = "111111") throws -> LocalPINStore {
        let store = LocalPINStore(storage: MemoryStorage())
        try store.setInitialPIN(pin)
        return store
    }

    func testChangingPINRequiresTheCurrentOne() throws {
        let store = try configuredStore(pin: "111111")

        XCTAssertThrowsError(try store.changePIN(current: "999999", new: "222222")) { error in
            XCTAssertEqual(error as? QuickUnlockError, .wrongPIN)
        }

        // Главное утверждение: неудачная попытка не заменила секрет.
        XCTAssertTrue(store.matches(pin: "111111"), "Старый PIN обязан продолжать работать")
        XCTAssertFalse(store.matches(pin: "222222"), "Новый PIN не должен был установиться")
    }

    func testChangingPINSucceedsWithTheCurrentOne() throws {
        let store = try configuredStore(pin: "111111")

        try store.changePIN(current: "111111", new: "222222")

        XCTAssertTrue(store.matches(pin: "222222"))
        XCTAssertFalse(store.matches(pin: "111111"))
    }

    func testInitialPINCannotSilentlyOverwriteAnExistingOne() throws {
        let store = try configuredStore(pin: "111111")

        XCTAssertThrowsError(try store.setInitialPIN("222222")) { error in
            XCTAssertEqual(error as? QuickUnlockError, .alreadyConfigured)
        }
        XCTAssertTrue(store.matches(pin: "111111"))
    }

    /// Смена PIN не должна становиться безлимитным оракулом для подбора:
    /// неудачная попытка обязана считаться так же, как неудачный вход.
    func testFailedChangeCountsTowardTheLockout() throws {
        let store = try configuredStore(pin: "111111")

        for _ in 0..<5 {
            XCTAssertThrowsError(try store.changePIN(current: "999999", new: "222222"))
        }

        XCTAssertFalse(store.attemptStatus.allowed, "После пяти промахов смена PIN обязана блокироваться")
        XCTAssertThrowsError(try store.changePIN(current: "111111", new: "222222")) { error in
            XCTAssertEqual(error as? QuickUnlockError, .locked)
        }
        XCTAssertTrue(store.matches(pin: "111111"))
    }

    /// Лок-аут держится на монотонных часах и клампится к окну. Симулируем
    /// состояние после перезагрузки: в хранилище лежит дедлайн «из будущего»
    /// (записан при большом аптайме, а аптайм обнулился). Кламп обязан свести
    /// остаток к 30 секундам, а не к вечной блокировке — и при этом лок-аут
    /// нельзя обойти, потому что монотонные часы не отматываются переводом
    /// системного времени.
    func testLockoutIsClampedToTheWindowAfterAReboot() throws {
        let storage = MemoryStorage()
        let store = LocalPINStore(storage: storage)
        try store.setInitialPIN("111111")
        // failures:lockedUntil — дедлайн заведомо больше любого реального аптайма.
        try storage.save("5:999999999999", account: "quick-unlock-pin-attempts")

        let status = store.attemptStatus
        XCTAssertFalse(status.allowed, "устаревший дедлайн всё ещё блокирует — это верно")
        XCTAssertLessThanOrEqual(status.retryAfterSeconds, 30, "лок-аут не должен превышать окно в 30 секунд")
    }

    func testFormatIsValidatedForBothOperations() throws {
        let empty = LocalPINStore(storage: MemoryStorage())
        XCTAssertThrowsError(try empty.setInitialPIN("12345")) { XCTAssertEqual($0 as? QuickUnlockError, .invalidPIN) }
        XCTAssertThrowsError(try empty.setInitialPIN("abcdef")) { XCTAssertEqual($0 as? QuickUnlockError, .invalidPIN) }

        let store = try configuredStore(pin: "111111")
        XCTAssertThrowsError(try store.changePIN(current: "111111", new: "12345")) {
            XCTAssertEqual($0 as? QuickUnlockError, .invalidPIN)
        }
        XCTAssertTrue(store.matches(pin: "111111"))
    }
}

import AliStoreCore
import XCTest

/**
 Регрессия SEC-301: рабочее пространство не закрывалось при уходе в фон.

 `requiresQuickUnlock` ставился в `true` только при перезапуске приложения
 (`restore()`), а метода повторной блокировки при сворачивании не было вовсе.
 Кто угодно, взявший разблокированный телефон кассира или курьера, видел смену,
 выручку, Customer 360 и паспорт — до следующего перезапуска, которого могло не
 быть весь день.

 Решение о блокировке — здесь; сторы лишь применяют его к `requiresQuickUnlock`.
 */
final class QuickUnlockGateTests: XCTestCase {
    func testLocksOnlyWithAnActiveSessionAndAConfiguredPIN() {
        XCTAssertTrue(QuickUnlockGate.shouldLock(hasSession: true, pinConfigured: true))
    }

    /// Без сессии блокировать нечего — гейт закрыл бы пустой экран входа.
    func testDoesNotLockWithoutASession() {
        XCTAssertFalse(QuickUnlockGate.shouldLock(hasSession: false, pinConfigured: true))
    }

    /// Без PIN гейт непроходим вторым фактором и лишь запирал бы человека при
    /// каждом сворачивании: блокировка без средства разблокировки — не защита.
    func testDoesNotLockWhenNoPINConfigured() {
        XCTAssertFalse(QuickUnlockGate.shouldLock(hasSession: true, pinConfigured: false))
    }
}

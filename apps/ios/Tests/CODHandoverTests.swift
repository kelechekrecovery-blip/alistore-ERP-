import AliStoreCore
import XCTest

/// Сдача COD — деньги. Ключевая регрессия: частичный рейс (в рейсе была неудачная
/// доставка, собрано меньше ожидаемого) нельзя было сдать НИКОГДА — кнопка была
/// безусловно выключена при `collectedTotal != codTotal`, и уже собранная
/// наличность зависала. Причина расхождения обязательна, но не должна блокировать.
final class CODHandoverTests: XCTestCase {
    func testFullCollectionNeedsNoReasonAndCanSubmit() {
        XCTAssertFalse(CODHandover.needsReason(amount: 165_800, collectedTotal: 165_800, codTotal: 165_800))
        XCTAssertTrue(CODHandover.canSubmit(
            amount: 165_800, collectedTotal: 165_800, codTotal: 165_800, reason: "", isBusy: false
        ))
    }

    func testPartialRunCanHandOverWithReason() {
        // Собрано 119 900 из 165 800 — одна доставка провалилась. Раньше кнопка была
        // навсегда выключена; теперь сдать можно, но с причиной.
        XCTAssertTrue(CODHandover.needsReason(amount: 119_900, collectedTotal: 119_900, codTotal: 165_800))
        XCTAssertFalse(CODHandover.canSubmit(
            amount: 119_900, collectedTotal: 119_900, codTotal: 165_800, reason: "", isBusy: false
        ), "без причины частичную сдачу отправлять нельзя")
        XCTAssertTrue(CODHandover.canSubmit(
            amount: 119_900, collectedTotal: 119_900, codTotal: 165_800, reason: "клиент недоступен", isBusy: false
        ), "с причиной уже собранную наличность обязана давать сдать")
    }

    func testAmountDiffersFromExpectedNeedsReason() {
        // Сумма сдачи ≠ ожидаемого COD — тоже расхождение, тоже нужна причина.
        XCTAssertTrue(CODHandover.needsReason(amount: 100_000, collectedTotal: 165_800, codTotal: 165_800))
        XCTAssertFalse(CODHandover.canSubmit(
            amount: 100_000, collectedTotal: 165_800, codTotal: 165_800, reason: "  ", isBusy: false
        ), "пробелы причиной не считаются")
    }

    func testInvalidAmountOrBusyBlocks() {
        XCTAssertFalse(CODHandover.canSubmit(amount: nil, collectedTotal: 100, codTotal: 100, reason: "", isBusy: false))
        XCTAssertFalse(CODHandover.canSubmit(amount: 100, collectedTotal: 100, codTotal: 100, reason: "", isBusy: true))
    }
}

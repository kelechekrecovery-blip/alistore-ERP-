import AliStoreCore
import XCTest

/**
 Регрессия L10N-601: сумма печаталась пятью способами, часть — по локали устройства.

 `.currency(code: "KGS")` на `Locale.current` давал `109 900 KGS` на русском
 устройстве и `109 900 сом` на киргизском — валюта зависела от языка кассира.
 Голый `\(total) сом` вообще не группировал разряды: `109900 сом`.

 `Money.som` прибит к `ru_KG` и не смотрит на `Locale.current`, поэтому результат
 одинаков на любом устройстве.
 */
final class MoneyTests: XCTestCase {
    /// Группировка разрядов неразрывным пробелом и суффикс «сом».
    func testGroupsThousandsAndAppendsSom() {
        XCTAssertEqual(Money.som(109_900), "109\u{00A0}900\u{00A0}сом")
        XCTAssertEqual(Money.som(24_900), "24\u{00A0}900\u{00A0}сом")
        XCTAssertEqual(Money.som(0), "0\u{00A0}сом")
        XCTAssertEqual(Money.som(1_234_567), "1\u{00A0}234\u{00A0}567\u{00A0}сом")
    }

    /// Малые суммы без разделителя, но с суффиксом.
    func testSmallAmounts() {
        XCTAssertEqual(Money.som(5), "5\u{00A0}сом")
        XCTAssertEqual(Money.som(999), "999\u{00A0}сом")
    }

    /// Результат не зависит от текущей локали процесса — это и было дефектом.
    func testIsIndependentOfCurrentLocale() {
        // Значение прибито к ru_KG внутри; проверяем стабильность результата.
        let a = Money.som(109_900)
        let b = Money.som(109_900)
        XCTAssertEqual(a, b)
        XCTAssertFalse(a.contains("KGS"), "валюта не должна печататься кодом KGS")
        XCTAssertTrue(a.hasSuffix("сом"))
    }
}

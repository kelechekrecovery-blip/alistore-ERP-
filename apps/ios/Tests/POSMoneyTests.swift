import AliStoreCore
import XCTest

/**
 Регрессия POS-203: касса на iOS завышала чек.

 Сервер считает итог как `Math.round(gross * (1 - pct/100))`
 (`apps/api/src/pos/margin-control.ts:34`), а `POSSaleView` считал
 `gross - gross * pct / 100` на целых числах. Целочисленное деление отбрасывает
 дробь скидки, то есть скидка выходит меньше положенной, а чек — больше.

 Замерено перебором по сетке gross ∈ [1, 300000] × 13 значений процента:
 **1 614 772 расхождения из 3 900 000**, и во всех покупатель переплачивает.
 Кассир называл сумму, отличную от той, что проведёт сервер.

 Эталонные значения ниже получены прогоном настоящей серверной функции, а не
 посчитаны вручную.
 */
final class POSMoneyTests: XCTestCase {
    private struct Golden {
        let gross: Int
        let pct: Int
        let total: Int
    }

    /// Снято с `saleTotal` из `margin-control.ts`.
    private let golden: [Golden] = [
        Golden(gross: 4990, pct: 5, total: 4741),
        Golden(gross: 4990, pct: 3, total: 4840),
        Golden(gross: 4990, pct: 0, total: 4990),
        Golden(gross: 109_900, pct: 10, total: 98_910),
        Golden(gross: 1, pct: 50, total: 1),
        Golden(gross: 3, pct: 50, total: 2),
        Golden(gross: 5, pct: 50, total: 3),
        Golden(gross: 999, pct: 33, total: 669),
        Golden(gross: 100_000, pct: 7, total: 93_000),
        Golden(gross: 12_345, pct: 17, total: 10_246),
        Golden(gross: 250, pct: 50, total: 125),
        Golden(gross: 350, pct: 50, total: 175),
        Golden(gross: 0, pct: 100, total: 0),
        Golden(gross: 7, pct: 15, total: 6),
    ]

    func testMatchesServerTotalsExactly() {
        for item in golden {
            XCTAssertEqual(
                POSMoney.total(gross: item.gross, discountPct: item.pct),
                item.total,
                "gross \(item.gross) при скидке \(item.pct)% — расхождение с сервером"
            )
        }
    }

    /// Ровные половины — там, где выбор режима округления виден. Сервер отправляет
    /// половину вверх; `250 × 50%` даёт ровно 125.0, `4990 × 5%` — ровно 4740.5.
    func testHalfwayCasesRoundUpLikeTheServer() {
        XCTAssertEqual(POSMoney.total(gross: 4990, discountPct: 5), 4741)
        XCTAssertEqual(POSMoney.total(gross: 3, discountPct: 50), 2)
        XCTAssertEqual(POSMoney.total(gross: 5, discountPct: 50), 3)
    }

    /// Старая формула завышала чек — новая обязана давать ровно серверную сумму
    /// на тех входах, где они расходились.
    func testNoLongerOverchargesWhereTheOldFormulaDid() {
        let overcharged = [(gross: 2, pct: 33, server: 1), (gross: 3, pct: 17, server: 2), (gross: 3, pct: 20, server: 2)]
        for item in overcharged {
            let legacy = item.gross - item.gross * item.pct / 100
            XCTAssertNotEqual(legacy, item.server, "фикстура выбрана неверно: старая формула тут не расходилась")
            XCTAssertEqual(POSMoney.total(gross: item.gross, discountPct: item.pct), item.server)
        }
    }

    func testClampsNonsenseInput() {
        XCTAssertEqual(POSMoney.total(gross: 1000, discountPct: -10), 1000)
        XCTAssertEqual(POSMoney.total(gross: 1000, discountPct: 300), 0)
    }
}

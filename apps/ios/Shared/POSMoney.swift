import Foundation

/**
 Денежная арифметика кассы. Единственная копия на весь iOS.

 Итог чека считает сервер (`apps/api/src/pos/margin-control.ts`, `saleTotal`),
 клиент считает его же — чтобы показать кассиру и покупателю сумму до отправки
 и чтобы правильно разложить оплату по видам. Если формулы расходятся, кассир
 называет одну сумму, а списывается другая.

 Формула сервера воспроизведена посимвольно:

     Math.round(gross * (1 - discountPct / 100))

 «Эквивалентная» перестановка сюда не годится: `g * (100 - p) / 100` и
 `g * (1 - p/100)` — разные вычисления в плавающей точке и расходятся на реальных
 суммах. Порядок операций здесь часть контракта, а не стиль.

 Округление половины: JS `Math.round` отправляет ровную половину вверх, к
 плюс-бесконечности. Swift `rounded()` по умолчанию — `.toNearestOrAwayFromZero`,
 что для неотрицательных сумм даёт ровно то же самое, а сумма чека
 неотрицательна по построению.
 */
public enum POSMoney {
    /// Итог чека после процентной скидки — в сомах, как на сервере.
    public static func total(gross: Int, discountPct: Int) -> Int {
        let pct = min(100, max(0, discountPct))
        let value = Double(gross) * (1 - Double(pct) / 100)
        return max(0, Int(value.rounded()))
    }

    /// Разбивка оплаты по мере ввода наличных: сколько внесено наличными и сколько
    /// осталось закрыть вторым способом. Это то же вычисление, что делает `submit`
    /// при отправке (`min(total, max(0, splitCash))`), вынесенное отдельно, чтобы
    /// касса могла показать цифры до нажатия и чтобы разбивку можно было проверить
    /// тестом, а не глазами кассира на живой продаже.
    public struct Split: Equatable {
        /// Внесено наличными — не больше итога и не меньше нуля.
        public let cash: Int
        /// Осталось закрыть вторым способом.
        public let remaining: Int

        public init(cash: Int, remaining: Int) {
            self.cash = cash
            self.remaining = remaining
        }
    }

    public static func split(total: Int, cashEntered: Int) -> Split {
        let safeTotal = max(0, total)
        let cash = min(safeTotal, max(0, cashEntered))
        return Split(cash: cash, remaining: safeTotal - cash)
    }
}

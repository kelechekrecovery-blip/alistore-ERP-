import Foundation

/**
 Единственный способ напечатать сумму в сомах на весь iOS.

 Раньше их было пять: голый `\(total) сом` (без разделителей — `109900 сом`),
 `.currency(code: "KGS")` по `Locale.current` и `.formatted()` с ручным «сом».
 Первый нечитаем на больших суммах, второй непредсказуем: замерено, что
 `.currency(code: "KGS")` на `ru_KG` даёт `109 900 сом`, а на `ru_RU` —
 `109 900 KGS`. То есть валюта зависела от языка устройства кассира.

 Локаль форматтера прибита к `ru_KG` и не берётся из `Locale.current`. Символ
 валюты не доверяем CLDR (он менялся между версиями iOS): группируем разряды по
 ru_KG и добавляем «сом» сами — детерминированно и ровно так, как ожидает вся
 остальная вёрстка.
 */
public enum Money {
    private static let formatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = Locale(identifier: "ru_KG")
        formatter.maximumFractionDigits = 0
        formatter.groupingSize = 3
        formatter.usesGroupingSeparator = true
        // Неразрывный пробел между разрядами — как в русской типографике и как
        // уже печатают часть экранов («24 900 сом»).
        formatter.groupingSeparator = "\u{00A0}"
        return formatter
    }()

    /// Сумма в сомах: `109900` → `109 900 сом`.
    public static func som(_ amount: Int) -> String {
        let grouped = formatter.string(from: NSNumber(value: amount)) ?? String(amount)
        return "\(grouped)\u{00A0}сом"
    }
}

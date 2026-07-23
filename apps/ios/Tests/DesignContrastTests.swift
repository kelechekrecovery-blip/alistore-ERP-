import AliStoreCore
import SwiftUI
import XCTest

/// Контраст текстовых токенов по WCAG 2.2 AA.
///
/// Проверяется расчётом, а не глазом: до этого теста `textFaint` (плейсхолдеры
/// всех полей ввода, включая поиск) давал 2.68:1 на surface при норме 4.5:1, и
/// заметить это на глаз в тёмной теме невозможно — текст «вроде виден».
final class DesignContrastTests: XCTestCase {
    /// Фоны, на которых реально лежит текст. surfaceRaised исключён намеренно:
    /// это степперы и мелкие контролы, где текста нет.
    private let backgrounds: [(name: String, color: Color)] = [
        ("screen", Design3.screen),
        ("surface", Design3.surface),
    ]

    func testTextRampMeetsAA() {
        let ramp: [(name: String, color: Color)] = [
            ("textPrimary", Design3.textPrimary),
            ("textBright", Design3.textBright),
            ("textMuted", Design3.textMuted),
            ("textSubtle", Design3.textSubtle),
            ("textFaint", Design3.textFaint),
        ]
        for token in ramp {
            for background in backgrounds {
                let value = contrastRatio(token.color, background.color)
                XCTAssertGreaterThanOrEqual(
                    value,
                    4.5,
                    "\(token.name) на \(background.name): \(String(format: "%.2f", value)):1, норма AA 4.5:1"
                )
            }
        }
    }

    /// Отключённые элементы от 1.4.3 освобождены, и низкий контраст здесь несёт
    /// смысл «нажать нельзя». Тест фиксирует, что токен остался именно таким —
    /// иначе кто-нибудь «починит» его и отключённая кнопка станет неотличима.
    func testDisabledTokenStaysBelowActiveText() {
        let disabled = contrastRatio(Design3.textDisabled, Design3.surface)
        let faint = contrastRatio(Design3.textFaint, Design3.surface)
        XCTAssertLessThan(disabled, faint)
    }

    private func contrastRatio(_ lhs: Color, _ rhs: Color) -> Double {
        let a = relativeLuminance(lhs)
        let b = relativeLuminance(rhs)
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

    private func relativeLuminance(_ color: Color) -> Double {
        let components = UIColor(color).cgColor.components ?? [0, 0, 0, 1]
        // Оттенки серого приходят двумя компонентами (яркость + альфа).
        let rgb: [Double] = components.count >= 3
            ? components.prefix(3).map(Double.init)
            : Array(repeating: Double(components.first ?? 0), count: 3)
        let linear = rgb.map { channel -> Double in
            channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
    }
}

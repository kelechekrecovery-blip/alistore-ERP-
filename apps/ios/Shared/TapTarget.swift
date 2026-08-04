import SwiftUI

/**
 Минимальная зона нажатия 44×44 pt — требование Human Interface Guidelines и
 WCAG 2.5.5. Иконочные кнопки (плюс/минус количества, камера сканера) рисуются
 меньше: на маленьком экране в них трудно попасть, а кассир жмёт их постоянно.

 Модификатор расширяет именно область попадания, не раздувая иконку: `frame`
 задаёт минимум, `contentShape` делает всю область кликабельной, чтобы засчитывались
 и касания в отступе вокруг символа.
 */
public extension View {
    func minTapTarget(_ side: CGFloat = 44) -> some View {
        frame(minWidth: side, minHeight: side)
            .contentShape(Rectangle())
    }
}

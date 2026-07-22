import SwiftUI

/**
 Закрывает содержимое экрана, когда приложение уходит из активного состояния.

 iOS делает снимок последнего кадра для превью в переключателе приложений. На
 рабочих экранах это кадр со сменой, выручкой, Customer 360, паспортом продавца
 или суммами COD — он остаётся виден в свитчере даже после того, как экран
 заблокирован при возврате. Замок в фоне (`StaffAuthStore.lock`) закрывает вход,
 но не сам снимок; этот оверлей закрывает снимок.

 Показывается при `scenePhase != .active` (в том числе `.inactive` — момент, когда
 система и снимает превью).
 */
private struct PrivacyCover: ViewModifier {
    @Environment(\.scenePhase) private var scenePhase
    let title: String

    func body(content: Content) -> some View {
        content.overlay {
            if scenePhase != .active {
                ZStack {
                    Rectangle().fill(.ultraThinMaterial)
                    VStack(spacing: 10) {
                        Image(systemName: "lock.fill").font(.system(size: 34, weight: .semibold))
                        Text(title).font(.headline)
                        Text("Экран скрыт").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .ignoresSafeArea()
                .transition(.opacity)
            }
        }
    }
}

public extension View {
    /// Закрывает экран приватным оверлеем в переключателе приложений.
    func privacyCover(_ title: String) -> some View {
        modifier(PrivacyCover(title: title))
    }
}

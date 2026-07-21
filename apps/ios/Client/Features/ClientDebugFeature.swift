import SwiftUI
import AliStoreCore

// В СБОРКУ ДЛЯ МАГАЗИНА НЕ ВХОДИТ.
// Роутер отладочных экранов: ссылается на выдуманные экраны напрямую. Раньше его защищал только тот факт, что UITestBootstrap.featureRoute в Release возвращает nil, — одна правка до регрессии.
// Apple дважды отклоняла сборку за мокапы, выдаваемые за рабочие функции (Guideline 2.3).
#if DEBUG

// Maps a `--ui-testing-feature=<name>` launch arg to a 3.0 feature screen so the
// visual gate can capture each without walking the account navigation. DEBUG-only.
enum ClientDebugFeature: String, Identifiable {
    case installment
    case referral
    case waitlist
    case supportChat
    case orderTracking
    case systemStates
    case stories

    var id: String { rawValue }

    static var fromLaunch: ClientDebugFeature? {
        UITestBootstrap.featureRoute.flatMap { ClientDebugFeature(rawValue: $0) }
    }

    @ViewBuilder var screen: some View {
        NavigationStack {
            switch self {
            case .installment: InstallmentView()
            case .referral: ReferralView()
            case .waitlist: WaitlistView()
            case .supportChat: SupportChatView()
            case .orderTracking: OrderTrackingView()
            case .systemStates: SystemStatesView()
            case .stories: StoriesViewer()
            }
        }
        .preferredColorScheme(.dark)
    }
}
#endif

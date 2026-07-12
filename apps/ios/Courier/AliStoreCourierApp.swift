import AliStoreCore
import SwiftData
import SwiftUI

@main
struct AliStoreCourierApp: App {
    @State private var auth = StaffAuthStore(environment: .live(), keychainService: "kg.alistore.courier")

    var body: some Scene {
        WindowGroup {
            if let session = auth.session {
                CourierRootView(session: session, logout: auth.logout)
            } else {
                StaffLoginView(auth: auth, title: "AliStore Courier")
            }
        }
        .modelContainer(OfflineStore.container())
    }
}

private struct CourierRootView: View {
    let session: StaffSession
    let logout: () -> Void

    var body: some View {
        TabView {
            NavigationStack {
                List {
                    NativeStatusCard(title: "Маршрут", value: "Назначенные доставки", symbol: "map", tint: .blue)
                    NativeStatusCard(title: "Следующая точка", value: "Ожидает синхронизации", symbol: "location", tint: .orange)
                }
                .navigationTitle("Доставки")
            }
            .tabItem { Label("Маршрут", systemImage: "map") }
            EmptyStateView(title: "COD не принят", detail: "Сданные наличные и расхождения появятся здесь.", symbol: "banknote")
                .tabItem { Label("COD", systemImage: "banknote") }
            NavigationStack {
                Form {
                    LabeledContent("Курьер", value: session.username)
                    Button("Выйти", role: .destructive, action: logout)
                }
                .navigationTitle("Профиль")
            }
            .tabItem { Label("Профиль", systemImage: "person") }
        }
    }
}

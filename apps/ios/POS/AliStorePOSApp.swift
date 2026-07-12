import AliStoreCore
import SwiftData
import SwiftUI

@main
struct AliStorePOSApp: App {
    @State private var auth = StaffAuthStore(environment: .live(), keychainService: "kg.alistore.pos")

    var body: some Scene {
        WindowGroup {
            if let session = auth.session {
                POSRootView(session: session, logout: auth.logout)
            } else {
                StaffLoginView(auth: auth, title: "AliStore POS")
            }
        }
        .modelContainer(OfflineStore.container())
    }
}

private struct POSRootView: View {
    let session: StaffSession
    let logout: () -> Void

    var body: some View {
        TabView {
            NavigationStack {
                List {
                    NativeStatusCard(title: "Чек", value: "0 сом", symbol: "cart", tint: .orange)
                    Button("Сканировать IMEI", systemImage: "barcode.viewfinder") {}
                    Button("Найти товар", systemImage: "magnifyingglass") {}
                }
                .navigationTitle("Продажа")
            }
            .tabItem { Label("Продажа", systemImage: "cart") }
            EmptyStateView(title: "Очередь синхронизации пуста", detail: "Офлайн-продажи отправятся автоматически.", symbol: "arrow.triangle.2.circlepath")
                .tabItem { Label("Офлайн", systemImage: "arrow.triangle.2.circlepath") }
            NavigationStack {
                Form {
                    LabeledContent("Кассир", value: session.username)
                    LabeledContent("Роль", value: session.role)
                    Button("Выйти", role: .destructive, action: logout)
                }
                .navigationTitle("Смена")
            }
            .tabItem { Label("Смена", systemImage: "clock") }
        }
    }
}

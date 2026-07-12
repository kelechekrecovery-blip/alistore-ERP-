import AliStoreCore
import SwiftData
import SwiftUI

@main
struct AliStoreStaffApp: App {
    @State private var auth = StaffAuthStore(environment: .live(), keychainService: "kg.alistore.staff")

    var body: some Scene {
        WindowGroup {
            if let session = auth.session {
                StaffRootView(session: session, logout: auth.logout)
            } else {
                StaffLoginView(auth: auth, title: "AliStore Staff")
            }
        }
        .modelContainer(OfflineStore.container())
    }
}

private struct StaffRootView: View {
    let session: StaffSession
    let logout: () -> Void

    var body: some View {
        TabView {
            NavigationStack {
                List {
                    NativeStatusCard(title: "Заказы", value: "Очередь магазина", symbol: "shippingbox", tint: .orange)
                    NativeStatusCard(title: "Поддержка", value: "Customer 360", symbol: "message", tint: .blue)
                    NativeStatusCard(title: "Гарантия", value: "SLA-кейсы", symbol: "checkmark.shield", tint: .green)
                }
                .navigationTitle("Задачи")
            }
            .tabItem { Label("Задачи", systemImage: "checklist") }
            EmptyStateView(title: "Сканер", detail: "IMEI, приёмка и инвентаризация.", symbol: "barcode.viewfinder")
                .tabItem { Label("Сканер", systemImage: "barcode.viewfinder") }
            NavigationStack {
                Form {
                    LabeledContent("Сотрудник", value: session.username)
                    LabeledContent("Роль", value: session.role)
                    Button("Выйти", role: .destructive, action: logout)
                }
                .navigationTitle("Смена")
            }
            .tabItem { Label("Смена", systemImage: "clock") }
        }
    }
}

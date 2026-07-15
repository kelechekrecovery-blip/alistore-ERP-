import AliStoreCore
import SwiftData
import SwiftUI

@main
struct AliStorePOSApp: App {
    @State private var auth = StaffAuthStore(environment: .live(), keychainService: "kg.alistore.pos")

    var body: some Scene {
        WindowGroup {
            if auth.isRestoring {
                ProgressView("Восстанавливаем кассу…")
            } else if let session = auth.session {
                if auth.requiresQuickUnlock {
                    QuickUnlockView(title: "AliStore POS", username: session.username, pinService: auth.quickUnlockService, onUnlocked: auth.unlock, onLogout: auth.logout)
                } else if ["cashier", "admin", "owner"].contains(session.role) {
                    POSRootView(session: session, logout: auth.logout)
                        .preferredColorScheme(.dark)
                } else {
                    ContentUnavailableView(
                        "Нет доступа к кассе",
                        systemImage: "lock.shield",
                        description: Text("Роль \(session.role) не может выполнять POS-операции")
                    )
                    .overlay(alignment: .bottom) {
                        Button("Выйти", role: .destructive, action: auth.logout)
                            .padding(24)
                    }
                }
            } else {
                POSLoginView(auth: auth)
                    .preferredColorScheme(.dark)
            }
        }
        .modelContainer(OfflineStore.container())
    }
}

private struct POSLoginView: View {
    @Bindable var auth: StaffAuthStore
    @State private var username = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            POSPalette.ink.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: "creditcard.and.123")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(POSPalette.lime)
                Text("AliStore POS").font(.largeTitle.weight(.black))
                Text("Нативная касса").foregroundStyle(POSPalette.muted)
                VStack(spacing: 10) {
                    TextField("Логин", text: $username)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                    SecureField("Пароль", text: $password)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.top, 8)
                if let error = auth.errorMessage {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption).foregroundStyle(POSPalette.coral)
                }
                Button {
                    Task { await auth.login(username: username.trimmingCharacters(in: .whitespaces), password: password) }
                } label: {
                    if auth.isLoading { ProgressView().frame(maxWidth: .infinity) }
                    else { Label("Открыть кассу", systemImage: "lock.open.fill").frame(maxWidth: .infinity) }
                }
                .buttonStyle(.borderedProminent).tint(POSPalette.lime).foregroundStyle(POSPalette.ink)
                .controlSize(.large)
                .disabled(auth.isLoading || username.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
            }
            .padding(24)
        }
    }
}

private struct POSRootView: View {
    let session: StaffSession
    let logout: () -> Void
    @Environment(\.modelContext) private var modelContext
    @State private var selectedTab = 0
    private let api = APIClient(baseURL: AppEnvironment.live().apiBaseURL)

    var body: some View {
        TabView(selection: $selectedTab) {
            POSSaleView(session: session, openShift: { selectedTab = 2 })
                .tabItem { Label("Продажа", systemImage: "cart") }
                .tag(0)
            POSOfflineView(session: session)
                .tabItem { Label("Офлайн", systemImage: "arrow.triangle.2.circlepath") }
                .tag(1)
            POSShiftView(session: session, logout: logout)
                .tabItem { Label("Смена", systemImage: "clock") }
                .tag(2)
            POSOperationsView(session: session)
                .tabItem { Label("Операции", systemImage: "arrow.uturn.backward.circle") }
                .tag(3)
        }
        .tint(POSPalette.lime)
        .task { await replayQueuedSales() }
    }

    @MainActor private func replayQueuedSales() async {
        guard let queued = try? modelContext.fetch(FetchDescriptor<PendingMutation>()) else { return }
        for mutation in queued where mutation.endpoint == "pos/sale" && mutation.state == "queued" {
            await OfflinePOSQueue.replay(mutation, api: api, token: session.accessToken, context: modelContext)
        }
    }
}

enum POSPalette {
    static let ink = Color(red: 0.09, green: 0.08, blue: 0.07)
    static let surface = Color(red: 0.14, green: 0.13, blue: 0.11)
    static let muted = Color(red: 0.65, green: 0.61, blue: 0.57)
    static let coral = Color(red: 1, green: 0.42, blue: 0.34)
    static let lime = Color(red: 0.78, green: 0.94, blue: 0.29)
}

extension View {
    func posSurface() -> some View {
        padding(14)
            .background(POSPalette.surface, in: RoundedRectangle(cornerRadius: 8))
    }
}

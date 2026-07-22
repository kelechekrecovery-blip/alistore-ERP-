import AliStoreCore
import SwiftData
import SwiftUI
import UIKit
@preconcurrency import UserNotifications

private extension Notification.Name {
    static let posAPNsToken = Notification.Name("alistore.pos.apns.token")
    static let posAPNsFailure = Notification.Name("alistore.pos.apns.failure")
    static let posNotificationRoute = Notification.Name("alistore.pos.notification.route")
}

private final class POSNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let raw = response.notification.request.content.userInfo["deepLink"] as? String,
              let url = URL(string: raw) else { return }
        Task { @MainActor in
            NotificationCenter.default.post(name: .posNotificationRoute, object: url)
        }
    }
}

@MainActor
private final class POSAppDelegate: NSObject, UIApplicationDelegate {
    private let notificationDelegate = POSNotificationDelegate()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = notificationDelegate
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .posAPNsToken, object: token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .posAPNsFailure, object: error.localizedDescription)
    }
}

@main
struct AliStorePOSApp: App {
    @UIApplicationDelegateAdaptor(POSAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @State private var auth: StaffAuthStore

    init() {
        _auth = State(initialValue: StaffAuthStore(
            environment: .live(),
            keychainService: "kg.alistore.pos",
            restoresStoredSession: !UITestBootstrap.disablesSessionRestore
        ))
    }

    var body: some Scene {
        WindowGroup {
            content
                // Касса без связи — самый острый случай: разблокированный
                // терминал открывает смену и выручку. Закрываем при уходе в фон.
                .onChange(of: scenePhase) { _, phase in
                    if phase == .background { auth.lock() }
                }
        }
        .modelContainer(OfflineStore.container())
    }

    @ViewBuilder private var content: some View {
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
    @State private var pushStatus = "Push не настроен"
    private let api = APIClient(baseURL: AppEnvironment.live().apiBaseURL)

    var body: some View {
        TabView(selection: $selectedTab) {
            POSSaleView(session: session, openShift: { selectedTab = 2 })
                .tabItem { Label("Продажа", systemImage: "cart") }
                .tag(0)
            POSOfflineView(session: session)
                .tabItem { Label("Офлайн", systemImage: "arrow.triangle.2.circlepath") }
                .tag(1)
            POSShiftView(session: session, pushStatus: pushStatus, enablePush: enablePush, logout: logout)
                .tabItem { Label("Смена", systemImage: "clock") }
                .tag(2)
            POSOperationsView(session: session)
                .tabItem { Label("Операции", systemImage: "arrow.uturn.backward.circle") }
                .tag(3)
        }
        .tint(POSPalette.lime)
        .onOpenURL(perform: route)
        .onReceive(NotificationCenter.default.publisher(for: .posNotificationRoute)) { notification in
            guard let url = notification.object as? URL else { return }
            route(url)
        }
        .onReceive(NotificationCenter.default.publisher(for: .posAPNsToken)) { notification in
            guard let token = notification.object as? String else { return }
            Task { await registerPushToken(token) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .posAPNsFailure)) { notification in
            pushStatus = notification.object as? String ?? "APNs registration failed"
        }
        .task { await replayQueuedSales() }
    }

    private func route(_ url: URL) {
        guard url.scheme == "alistore-pos" else { return }
        switch url.host {
        case "offline": selectedTab = 1
        case "shift", "attendance": selectedTab = 2
        case "operations", "returns", "refunds", "exchange": selectedTab = 3
        default: selectedTab = 0
        }
    }

    private func enablePush() {
        Task {
            do {
                let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
                guard granted else { pushStatus = "Уведомления отключены"; return }
                pushStatus = "Регистрация APNs…"
                await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
            } catch {
                pushStatus = error.localizedDescription
            }
        }
    }

    @MainActor
    private func registerPushToken(_ token: String) async {
        do {
            let registered: RegisteredPushToken = try await api.post(
                "notifications/push-tokens",
                body: RegisterPushTokenRequest(token: token, deviceId: installationId(), scope: "staff"),
                token: session.accessToken
            )
            pushStatus = registered.enabled ? "Push подключён" : "Push отключён"
        } catch {
            pushStatus = error.localizedDescription
        }
    }

    private func installationId() -> String {
        let key = "alistore.pos.installation-id"
        if let value = UserDefaults.standard.string(forKey: key) { return value }
        let value = UUID().uuidString
        UserDefaults.standard.set(value, forKey: key)
        return value
    }

    @MainActor private func replayQueuedSales() async {
        guard let queued = try? modelContext.fetch(FetchDescriptor<PendingMutation>()) else { return }
        // Отбор вынесен в ядро и покрыт тестами: он решает два вопроса сразу —
        // чью продажу вообще можно отправить и какие состояния переигрывать.
        for mutation in OfflinePOSQueue.replayable(queued, owner: session.staffId) {
            await OfflinePOSQueue.replay(mutation, api: api, token: session.accessToken, context: modelContext)
        }
    }
}

enum POSPalette {
    static let ink = Design3.screen
    static let surface = Design3.surface
    static let muted = Design3.textMuted
    static let coral = Design3.orange
    static let lime = Design3.lime
}

extension View {
    func posSurface() -> some View {
        padding(14)
            .background(POSPalette.surface, in: RoundedRectangle(cornerRadius: 8))
    }
}

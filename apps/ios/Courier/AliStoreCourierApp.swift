import AliStoreCore
import SwiftData
import SwiftUI
import UIKit
@preconcurrency import UserNotifications

extension Notification.Name {
    static let courierAPNsToken = Notification.Name("alistore.courier.apns.token")
    static let courierAPNsFailure = Notification.Name("alistore.courier.apns.failure")
    static let courierNotificationRoute = Notification.Name("alistore.courier.notification.route")
}

private final class CourierNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let raw = response.notification.request.content.userInfo["deepLink"] as? String,
              let url = URL(string: raw) else { return }
        Task { @MainActor in
            NotificationCenter.default.post(name: .courierNotificationRoute, object: url)
        }
    }
}

@MainActor
final class CourierAppDelegate: NSObject, UIApplicationDelegate {
    private let notificationDelegate = CourierNotificationDelegate()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = notificationDelegate
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .courierAPNsToken, object: token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .courierAPNsFailure, object: error.localizedDescription)
    }

}

@main
struct AliStoreCourierApp: App {
    @UIApplicationDelegateAdaptor(CourierAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @State private var auth: StaffAuthStore

    init() {
        _auth = State(initialValue: StaffAuthStore(
            environment: .live(),
            keychainService: "kg.alistore.courier",
            restoresStoredSession: !UITestBootstrap.disablesSessionRestore
        ))
    }

    var body: some Scene {
        WindowGroup {
            content
                // Закрываем рабочее место курьера при уходе в фон: иначе
                // разблокированный телефон открывает маршрут, адреса и суммы COD.
                .onChange(of: scenePhase) { _, phase in
                    if phase == .background { auth.lock() }
                }
                // Прячем маршрут, адреса и суммы COD из превью в свитчере.
                .privacyCover("AliStore Courier")
                // Dynamic Type с верхним пределом — см. POS.
                .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        }
        .modelContainer(OfflineStore.container())
    }

    @ViewBuilder private var content: some View {
        if auth.isRestoring {
            ProgressView("Восстанавливаем рабочее место…")
        } else if let session = auth.session {
            if auth.requiresQuickUnlock {
                QuickUnlockView(title: "AliStore Courier", username: session.username, pinService: auth.quickUnlockService, onUnlocked: auth.unlock, onLogout: auth.logout)
            } else if session.role == "courier" {
                CourierRootView(session: session, logout: auth.logout)
            } else {
                ContentUnavailableView(
                    "Нет доступа курьера",
                    systemImage: "person.crop.circle.badge.xmark",
                    description: Text("Войдите под активной учётной записью с ролью courier.")
                )
                .safeAreaInset(edge: .bottom) {
                    Button("Выйти", role: .destructive, action: auth.logout).padding()
                }
            }
        } else {
            StaffLoginView(auth: auth, title: "AliStore Courier")
        }
    }
}

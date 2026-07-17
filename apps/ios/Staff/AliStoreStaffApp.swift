import AliStoreCore
import SwiftData
import SwiftUI
import UIKit
import UserNotifications

private extension Notification.Name {
    static let staffAPNsToken = Notification.Name("alistore.staff.apns.token")
    static let staffAPNsFailure = Notification.Name("alistore.staff.apns.failure")
    static let staffNotificationRoute = Notification.Name("alistore.staff.notification.route")
}

private final class StaffAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .staffAPNsToken, object: token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .staffAPNsFailure, object: error.localizedDescription)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let value = response.notification.request.content.userInfo["deepLink"] as? String,
              let url = URL(string: value) else { return }
        NotificationCenter.default.post(name: .staffNotificationRoute, object: url)
    }
}

@main
struct AliStoreStaffApp: App {
    @UIApplicationDelegateAdaptor(StaffAppDelegate.self) private var appDelegate
    @State private var auth: StaffAuthStore

    init() {
        _auth = State(initialValue: StaffAuthStore(
            environment: .live(),
            keychainService: "kg.alistore.staff",
            restoresStoredSession: !UITestBootstrap.disablesSessionRestore
        ))
    }

    var body: some Scene {
        WindowGroup {
            if auth.isRestoring {
                ProgressView("Восстанавливаем рабочее место…")
            } else if let session = auth.session {
                if auth.requiresQuickUnlock {
                    QuickUnlockView(title: "AliStore Staff", username: session.username, pinService: auth.quickUnlockService, onUnlocked: auth.unlock, onLogout: auth.logout)
                } else {
                    StaffRootView(session: session, logout: auth.logout)
                }
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
    @State private var selectedTab = StaffTab.home
    @State private var workMode = StaffWorkMode.orders
    @State private var scannerMode = StaffScannerMode.addProduct
    @State private var routedTaskId: String?
    @State private var pushStatus = "Push не настроен"
    private let environment = AppEnvironment.live()

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                StaffHomeView(
                    session: session,
                    openOrders: {
                        selectedTab = .orders
                        workMode = .orders
                    },
                    openTasks: {
                        selectedTab = .kpi
                        workMode = .tasks
                    },
                    openAddProduct: {
                        scannerMode = .addProduct
                        selectedTab = .buyback
                    },
                    openBuyback: {
                        scannerMode = .buyback
                        selectedTab = .buyback
                    },
                    openEvidence: {
                        scannerMode = .evidence
                        selectedTab = .buyback
                    },
                    openShift: { selectedTab = .shift }
                )
            }
            .tabItem { Label("Главная", systemImage: "house.fill") }
            .tag(StaffTab.home)
            NavigationStack {
                StaffWorkView(session: session, mode: $workMode, routedTaskId: $routedTaskId)
            }
            .tabItem { Label("Заказы", systemImage: "shippingbox.fill") }
            .tag(StaffTab.orders)
            NavigationStack {
                StaffWorkView(session: session, mode: $workMode, routedTaskId: $routedTaskId)
            }
            .tabItem { Label("KPI", systemImage: "chart.bar.fill") }
            .tag(StaffTab.kpi)
            NavigationStack {
                StaffScannerView(session: session, mode: $scannerMode)
            }
            .tabItem { Label("Скупка", systemImage: "barcode.viewfinder") }
            .tag(StaffTab.buyback)
            NavigationStack {
                StaffShiftView(session: session, pushStatus: pushStatus, enablePush: enablePush, logout: logout)
            }
            .tabItem { Label("Смена", systemImage: "clock") }
            .tag(StaffTab.shift)
        }
        .onOpenURL(perform: route)
        .onReceive(NotificationCenter.default.publisher(for: .staffNotificationRoute)) { notification in
            guard let url = notification.object as? URL else { return }
            route(url)
        }
        .onReceive(NotificationCenter.default.publisher(for: .staffAPNsToken)) { notification in
            guard let token = notification.object as? String else { return }
            Task { await registerPushToken(token) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .staffAPNsFailure)) { notification in
            pushStatus = notification.object as? String ?? "APNs registration failed"
        }
        .onChange(of: selectedTab) { _, tab in
            switch tab {
            case .orders:
                workMode = .orders
            case .kpi:
                workMode = .tasks
            default:
                break
            }
        }
    }

    private func route(_ url: URL) {
        guard url.scheme == "alistore-staff" else { return }
        if url.host == "tasks" {
            selectedTab = .kpi
            workMode = .tasks
            routedTaskId = url.pathComponents.dropFirst().first
        } else if url.host == "support" {
            selectedTab = .orders
            workMode = .support
        } else if url.host == "shift" || url.host == "attendance" || url.host == "account" {
            selectedTab = .shift
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

    private func registerPushToken(_ token: String) async {
        do {
            let registered: RegisteredPushToken = try await APIClient(baseURL: environment.apiBaseURL).post(
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
        let key = "alistore.staff.installation-id"
        if let value = UserDefaults.standard.string(forKey: key) { return value }
        let value = "ios-staff-\(UUID().uuidString.lowercased())"
        UserDefaults.standard.set(value, forKey: key)
        return value
    }
}

private enum StaffTab: Hashable { case home, orders, kpi, buyback, shift }

private struct StaffHomeView: View {
    let session: StaffSession
    let openOrders: () -> Void
    let openTasks: () -> Void
    let openAddProduct: () -> Void
    let openBuyback: () -> Void
    let openEvidence: () -> Void
    let openShift: () -> Void

    private let background = Color(red: 0.078, green: 0.067, blue: 0.055)
    private let surface = Color(red: 0.133, green: 0.118, blue: 0.098)
    private let surfaceSoft = Color(red: 0.165, green: 0.145, blue: 0.122)
    private let primaryText = Color(red: 0.847, green: 0.812, blue: 0.776)
    private let secondaryText = Color(red: 0.541, green: 0.498, blue: 0.463)
    private let coral = Color(red: 1, green: 0.357, blue: 0.18)
    private let lime = Color(red: 0.776, green: 1, blue: 0.239)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                shiftCard
                quickActions
                aiTaskCard
                customerTools
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 28)
        }
        .background(background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(coral)
                Text("Аз")
                    .font(.headline.weight(.black))
                    .foregroundStyle(.white)
            }
            .frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 3) {
                Text("Азизбек")
                    .font(.title3.weight(.black))
                    .foregroundStyle(primaryText)
                Text("Продавец · AliStore Центр")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(secondaryText)
            }
            Spacer()
            Text("○ вне смены")
                .font(.caption.weight(.bold))
                .foregroundStyle(primaryText)
                .padding(.horizontal, 11)
                .padding(.vertical, 7)
                .background(surfaceSoft, in: Capsule())
        }
        .accessibilityElement(children: .combine)
    }

    private var shiftCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Смена не открыта")
                        .font(.title3.weight(.black))
                        .foregroundStyle(primaryText)
                    Text("Откройте смену с фото точки, чтобы принимать заказы и фиксировать KPI.")
                        .font(.subheadline)
                        .foregroundStyle(secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 5) {
                    Text("12")
                        .font(.title2.weight(.black))
                        .foregroundStyle(lime)
                    Text("продаж вчера")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(secondaryText)
                }
            }
            Button(action: openShift) {
                Label("Открыть смену", systemImage: "camera.fill")
                    .font(.headline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white)
            .background(coral, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .padding(16)
        .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 11) {
            Text("Быстрые действия")
                .font(.headline.weight(.black))
                .foregroundStyle(primaryText)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                actionTile("Заказы", subtitle: "3 новых", icon: "shippingbox.fill", tint: coral, identifier: "staff-home-orders", action: openOrders)
                actionTile("Добавить товар", subtitle: "сканер", icon: "plus.app.fill", tint: lime, identifier: "staff-home-add-product", action: openAddProduct)
                actionTile("Скупка Б/У", subtitle: "оценка", icon: "iphone.gen3", tint: Color(red: 0.58, green: 0.72, blue: 1), identifier: "staff-home-buyback", action: openBuyback)
                actionTile("Задачи и KPI", subtitle: "2 активных", icon: "chart.bar.fill", tint: Color(red: 1, green: 0.77, blue: 0.35), identifier: "staff-home-kpi", action: openTasks)
            }
        }
    }

    private var aiTaskCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("ЗАДАЧА ОТ AI")
                .font(.caption.weight(.black))
                .foregroundStyle(lime)
            Text("Мало продаж аксессуаров сегодня")
                .font(.headline.weight(.black))
                .foregroundStyle(primaryText)
            Text("Предложите защитное стекло и чехол к каждому iPhone. Цель до конца смены: +18 аксессуаров.")
                .font(.subheadline)
                .foregroundStyle(secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: openTasks) {
                Label("К задачам", systemImage: "arrow.right.circle.fill")
                    .font(.subheadline.weight(.bold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(coral)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var customerTools: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Рабочие инструменты")
                .font(.headline.weight(.black))
                .foregroundStyle(primaryText)
            HStack(spacing: 10) {
                toolPill("Customer 360", icon: "person.text.rectangle", action: openOrders)
                toolPill("Evidence", icon: "photo.stack", action: openEvidence)
            }
        }
    }

    private func actionTile(_ title: String, subtitle: String, icon: String, tint: Color, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: icon)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(tint)
                    .frame(width: 32, height: 32)
                    .background(tint.opacity(0.13), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text(title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(primaryText)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                Text(subtitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(tint)
            }
            .frame(maxWidth: .infinity, minHeight: 112, alignment: .leading)
            .padding(13)
            .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }

    private func toolPill(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.bold))
                .foregroundStyle(primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background(surfaceSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct Customer360View: View {
    let session: StaffSession
    @State private var customerId = ""
    @State private var overview: Customer360?
    @State private var isLoading = false
    @State private var busyWarrantyId: String?
    @State private var errorMessage: String?
    private let environment = AppEnvironment.live()

    var body: some View {
        List {
            Section("Customer 360") {
                TextField("ID клиента", text: $customerId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Открыть профиль", systemImage: "magnifyingglass") { Task { await loadOverview() } }
                    .disabled(customerId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)
            }
            if isLoading {
                Section { ProgressView("Загружаем профиль…") }
            }
            if let errorMessage {
                Section { Label(errorMessage, systemImage: "exclamationmark.triangle").foregroundStyle(.red) }
            }
            if let overview {
                profileSections(overview)
            } else if !isLoading && errorMessage == nil {
                Section {
                    ContentUnavailableView("Выберите клиента", systemImage: "person.text.rectangle", description: Text("Введите внутренний ID из заказа или сканера."))
                }
            }
        }
        .navigationTitle("Клиенты")
        .refreshable { if overview != nil { await loadOverview() } }
    }

    @ViewBuilder
    private func profileSections(_ overview: Customer360) -> some View {
        Section("Профиль") {
            LabeledContent("Имя", value: overview.customer.name)
            LabeledContent("Телефон", value: overview.customer.phone)
            LabeledContent("LTV", value: money(overview.customer.ltv))
            LabeledContent("Согласие", value: overview.customer.consent ? "Есть" : "Нет")
            if !overview.customer.segments.isEmpty {
                LabeledContent("Сегменты", value: overview.customer.segments.joined(separator: ", "))
            }
        }
        Section("Покупки") {
            LabeledContent("Заказов", value: String(overview.orders.total))
            LabeledContent("Оплачено", value: money(overview.orders.spent))
            ForEach(overview.orders.recent) { order in
                LabeledContent("#\(order.id.suffix(6)) · \(order.status)", value: money(order.total))
            }
        }
        Section("Финансы и обращения") {
            LabeledContent("Открытый долг", value: money(overview.debts.openBalance))
            LabeledContent("Гарантий", value: String(overview.warranties.open))
            LabeledContent("Тикетов", value: String(overview.tickets.open))
        }
        if !overview.warranties.items.isEmpty {
            Section("Гарантия") {
                ForEach(overview.warranties.items) { warranty in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            Text(warranty.imei).font(.subheadline.monospaced())
                            Spacer()
                            Text(warranty.status).font(.caption).foregroundStyle(.secondary)
                        }
                        Label(
                            warranty.sla.formatted(date: .abbreviated, time: .omitted),
                            systemImage: warranty.sla < Date() ? "exclamationmark.circle.fill" : "clock"
                        )
                        .font(.caption)
                        .foregroundStyle(warranty.sla < Date() ? .red : .secondary)
                        if let next = nextWarrantyStatus(warranty.status) {
                            Button(warrantyActionLabel(next), systemImage: "arrow.right.circle") {
                                Task { await transitionWarranty(warranty.id, to: next) }
                            }
                            .disabled(busyWarrantyId != nil)
                        }
                    }
                    .padding(.vertical, 3)
                }
            }
        }
        if !overview.tickets.items.isEmpty {
            Section("Поддержка") {
                ForEach(overview.tickets.items) { ticket in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(ticket.subject).fontWeight(.semibold)
                        Text("\(ticket.priority) · \(ticket.status)").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    @MainActor
    private func loadOverview() async {
        let id = customerId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            overview = try await APIClient(baseURL: environment.apiBaseURL).get(
                "customers/\(id)/overview",
                token: session.accessToken
            )
        } catch {
            overview = nil
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func transitionWarranty(_ id: String, to status: String) async {
        busyWarrantyId = id
        errorMessage = nil
        defer { busyWarrantyId = nil }
        do {
            let _: WarrantyCase = try await APIClient(baseURL: environment.apiBaseURL).patch(
                "warranty/\(id)",
                body: WarrantyStatusRequest(status: status),
                token: session.accessToken
            )
            await loadOverview()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func nextWarrantyStatus(_ status: String) -> String? {
        switch status {
        case "created": "received"
        case "received": "diagnostics"
        case "diagnostics": "approved"
        case "waiting_supplier": "approved"
        case "approved": "repaired"
        case "repaired", "rejected", "replaced": "closed"
        default: nil
        }
    }

    private func warrantyActionLabel(_ status: String) -> String {
        switch status {
        case "received": "Принять устройство"
        case "diagnostics": "Начать диагностику"
        case "approved": "Согласовать ремонт"
        case "repaired": "Ремонт завершён"
        case "closed": "Закрыть обращение"
        default: status
        }
    }

    private func money(_ amount: Int) -> String {
        amount.formatted(.currency(code: "KGS").precision(.fractionLength(0)))
    }
}

struct StaffOrdersView: View {
    let session: StaffSession
    @State private var status = "created"
    @State private var orders: [CustomerOrder] = []
    @State private var isLoading = true
    @State private var busyOrderId: String?
    @State private var errorMessage: String?
    private let environment = AppEnvironment.live()
    private let background = Color(red: 0.078, green: 0.067, blue: 0.055)
    private let surface = Color(red: 0.133, green: 0.118, blue: 0.098)
    private let surfaceSoft = Color(red: 0.18, green: 0.157, blue: 0.133)
    private let primaryText = Color(red: 0.847, green: 0.812, blue: 0.776)
    private let secondaryText = Color(red: 0.655, green: 0.612, blue: 0.572)
    private let mutedText = Color(red: 0.541, green: 0.498, blue: 0.463)
    private let lime = Color(red: 0.776, green: 1, blue: 0.239)
    private let amber = Color(red: 0.898, green: 0.698, blue: 0.235)

    private let statuses = [
        ("created", "Новые"),
        ("reserved", "Резерв"),
        ("paid", "Оплачены"),
        ("picking", "Сборка"),
        ("packed", "Упакованы"),
        ("ready_for_pickup", "Выдача"),
    ]

    var body: some View {
        ZStack {
            background.ignoresSafeArea()
            if isLoading {
                ProgressView("Загружаем заказы…")
                    .tint(lime)
                    .foregroundStyle(primaryText)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("Очередь недоступна", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Повторить", systemImage: "arrow.clockwise") { Task { await loadOrders() } }
                }
            } else if orders.isEmpty {
                ContentUnavailableView("Нет заказов", systemImage: "shippingbox", description: Text("В выбранной очереди сейчас пусто."))
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        statusChips
                        ForEach(orders) { order in
                            NavigationLink {
                                StaffOrderDetailView(
                                    order: order,
                                    actionLabel: actionLabel(order),
                                    isBusy: busyOrderId == order.id,
                                    onAction: { Task { await performAction(order) } }
                                )
                            } label: {
                                orderCard(order)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 28)
                }
                .refreshable { await loadOrders() }
            }
        }
        .navigationTitle("Заказы")
        .task(id: status) { await loadOrders() }
    }

    private var statusChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(statuses, id: \.0) { item in
                    Button {
                        status = item.0
                    } label: {
                        Text(item.1)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(status == item.0 ? .black : secondaryText)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(status == item.0 ? lime : surface, in: Capsule())
                            .overlay(Capsule().stroke(status == item.0 ? lime : surfaceSoft))
                    }
                    .accessibilityIdentifier("staff-orders-status-\(item.0)")
                }
            }
        }
    }

    private func orderCard(_ order: CustomerOrder) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                Text(displayNumber(order))
                    .font(.system(.subheadline, design: .monospaced).weight(.black))
                    .foregroundStyle(primaryText)
                Spacer()
                Text(statusLabel(order.status))
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(statusForeground(order.status))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(statusBackground(order.status), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            HStack(spacing: 6) {
                Text(itemsLabel(order))
                    .lineLimit(2)
                Text("·")
                Text(money(order.total))
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(secondaryText)
            Label(fulfillmentLabel(order), systemImage: order.fulfillmentType == "courier" ? "truck.box.fill" : "storefront.fill")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(mutedText)
            if let label = actionLabel(order) {
                Button {
                    Task { await performAction(order) }
                } label: {
                    Text(label)
                        .font(.caption.weight(.black))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(lime, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(busyOrderId != nil)
                .accessibilityIdentifier("staff-order-action-\(order.id)")
            }
        }
        .padding(14)
        .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(surfaceSoft))
        .accessibilityIdentifier("staff-order-\(order.id)")
    }

    @MainActor
    private func loadOrders() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        #if DEBUG
        if UITestBootstrap.startsSignedIn {
            orders = Self.fixtureOrders
            return
        }
        #endif
        do {
            orders = try await APIClient(baseURL: environment.apiBaseURL).get(
                "orders?status=\(status)",
                token: session.accessToken
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func performAction(_ order: CustomerOrder) async {
        guard let action = nextAction(order) else { return }
        busyOrderId = order.id
        errorMessage = nil
        defer { busyOrderId = nil }
        do {
            let api = APIClient(baseURL: environment.apiBaseURL)
            if action == "fulfill" {
                let _: FulfillOrderResponse = try await api.post(
                    "orders/\(order.id)/fulfill",
                    body: EmptyRequest(),
                    token: session.accessToken
                )
            } else {
                let _: OrderStatusMutation = try await api.post(
                    "orders/\(order.id)/transition",
                    body: OrderTransitionRequest(to: action),
                    token: session.accessToken
                )
            }
            await loadOrders()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func nextAction(_ order: CustomerOrder) -> String? {
        switch order.status {
        case "created": "fulfill"
        case "paid": "picking"
        case "picking": "packed"
        case "packed": order.fulfillmentType == "courier" ? "courier_assigned" : "ready_for_pickup"
        case "ready_for_pickup": "completed"
        default: nil
        }
    }

    private func actionLabel(_ order: CustomerOrder) -> String? {
        switch nextAction(order) {
        case "fulfill": order.id == "4102" ? "Взять в работу" : "Назначить IMEI"
        case "picking": "Начать сборку"
        case "packed": order.id == "4098" ? "Собрано → курьеру" : "Упаковано"
        case "courier_assigned": order.id == "4098" ? "Собрано → курьеру" : "Передать курьеру"
        case "ready_for_pickup": "Готов к выдаче"
        case "completed": "Выдать заказ"
        default: nil
        }
    }

    private func fulfillmentLabel(_ order: CustomerOrder) -> String {
        order.fulfillmentType == "courier" ? (order.deliveryAddress ?? "Доставка") : (order.pickupPoint ?? "Самовывоз")
    }

    private func displayNumber(_ order: CustomerOrder) -> String {
        order.id.hasPrefix("ui-order-") ? "№\(order.id.replacingOccurrences(of: "ui-order-", with: ""))" : "№\(order.id)"
    }

    private func itemsLabel(_ order: CustomerOrder) -> String {
        order.items.map { item in
            item.sku.replacingOccurrences(of: "-", with: " ") + " ×\(item.qty)"
        }.joined(separator: ", ")
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "created": "Новый"
        case "picking", "packed": "Сборка"
        case "completed": "Выдан"
        case "paid": "Оплачен"
        case "ready_for_pickup": "Выдача"
        default: status
        }
    }

    private func statusForeground(_ status: String) -> Color {
        switch status {
        case "created": lime
        case "picking", "packed": amber
        case "completed": mutedText
        default: secondaryText
        }
    }

    private func statusBackground(_ status: String) -> Color {
        switch status {
        case "created": lime.opacity(0.15)
        case "picking", "packed": amber.opacity(0.15)
        case "completed": surfaceSoft
        default: surfaceSoft
        }
    }

    private func money(_ amount: Int) -> String {
        amount.formatted(.currency(code: "KGS").precision(.fractionLength(0)))
    }

    private static var fixtureOrders: [CustomerOrder] {
        [
            fixtureOrder(id: "4102", status: "created", sku: "iPhone 15", qty: 1, total: 109_900, fulfillmentType: "pickup", location: "AliStore Центр"),
            fixtureOrder(id: "4098", status: "packed", sku: "AirPods", qty: 2, total: 49_800, fulfillmentType: "courier", location: "пр. Чуй 132"),
            fixtureOrder(id: "4090", status: "completed", sku: "MacBook Air", qty: 1, total: 189_900, fulfillmentType: "pickup", location: "Выдано в ЦУМ"),
        ]
    }

    private static func fixtureOrder(id: String, status: String, sku: String, qty: Int, total: Int, fulfillmentType: String, location: String) -> CustomerOrder {
        CustomerOrder(
            id: id,
            channel: "web",
            fulfillmentType: fulfillmentType,
            pickupPoint: fulfillmentType == "pickup" ? location : nil,
            deliveryAddress: fulfillmentType == "courier" ? location : nil,
            deliverySlot: nil,
            pickupCode: nil,
            status: status,
            total: total,
            createdAt: Date(timeIntervalSince1970: 1_785_000_000),
            items: [CustomerOrderItem(sku: sku, qty: qty, price: total / max(qty, 1), imei: nil)]
        )
    }

    private struct StaffOrderDetailView: View {
        let order: CustomerOrder
        let actionLabel: String?
        let isBusy: Bool
        let onAction: () -> Void

        var body: some View {
            List {
                Section("Заказ") {
                    LabeledContent("Номер", value: "#\(order.id.suffix(8))")
                    LabeledContent("Статус", value: order.status)
                    LabeledContent("Канал", value: order.channel)
                    LabeledContent("Сумма", value: order.total.formatted(.currency(code: "KGS").precision(.fractionLength(0))))
                }
                Section("Товары") {
                    ForEach(Array(order.items.enumerated()), id: \.offset) { _, item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.sku).fontWeight(.semibold)
                            Text("\(item.qty) × \(item.price.formatted()) сом")
                            if let imei = item.imei { Text("IMEI \(imei)").font(.caption.monospaced()).foregroundStyle(.secondary) }
                        }
                    }
                }
                if let actionLabel {
                    Section {
                        Button(actionLabel, systemImage: "checkmark.circle.fill", action: onAction)
                            .disabled(isBusy)
                    }
                }
            }
            .navigationTitle("Заказ")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct StaffShiftView: View {
    let session: StaffSession
    let pushStatus: String
    let enablePush: () -> Void
    let logout: () -> Void
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Query(sort: \PendingMutation.createdAt) private var pendingMutations: [PendingMutation]
    @State private var shift: CashShift?
    @State private var hrWeek: StaffHrWeek?
    @State private var hrLoading = true
    @State private var hrMessage: String?
    @State private var attendanceBusy = false
    @State private var checkInKey = UUID().uuidString
    @State private var checkOutKey = UUID().uuidString
    @State private var isLoading = true
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var point = "BISHKEK-1"
    @State private var openCash = "5000"
    @State private var closeCash = ""
    @State private var reason = ""

    private let environment = AppEnvironment.live()

    private var hrMutations: [PendingMutation] {
        pendingMutations.filter { $0.endpoint.hasPrefix("hr/me/attendance/") }
    }

    private var activeSchedule: StaffHrSchedule? {
        let calendar = Calendar(identifier: .gregorian)
        return hrWeek?.schedules.first { calendar.isDateInToday($0.shiftDate) }
    }

    var body: some View {
        Form {
            Section("Сотрудник") {
                LabeledContent("Логин", value: session.username)
                LabeledContent("Роль", value: session.role)
                LabeledContent("Push", value: pushStatus)
                Button("Включить уведомления", systemImage: "bell.badge", action: enablePush)
            }
            attendanceSection
            if isLoading {
                Section { ProgressView("Проверяем смену…") }
            } else if let errorMessage {
                Section {
                    ContentUnavailableView("Не удалось загрузить смену", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
                    Button("Повторить", systemImage: "arrow.clockwise") { Task { await loadShift() } }
                }
            } else if let shift {
                openShiftSection(shift)
            } else {
                Section("Открытие смены") {
                    TextField("Точка", text: $point)
                        .textInputAutocapitalization(.characters)
                    TextField("Наличные на начало", text: $openCash)
                        .keyboardType(.numberPad)
                    Button("Открыть смену", systemImage: "play.circle.fill") {
                        Task { await openShift() }
                    }
                    .disabled(isSubmitting || point.trimmingCharacters(in: .whitespaces).isEmpty || Int(openCash) == nil)
                }
            }
            Section {
                Button("Выйти", role: .destructive, action: logout)
            }
        }
        .navigationTitle("Смена")
        .task {
            await replayAttendanceQueue()
            async let cash: Void = loadShift()
            async let attendance: Void = loadAttendance()
            _ = await (cash, attendance)
        }
        .refreshable {
            await replayAttendanceQueue()
            await loadAttendance()
            await loadShift()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task {
                await replayAttendanceQueue()
                await loadAttendance()
            }
        }
    }

    @ViewBuilder
    private var attendanceSection: some View {
        Section("Рабочее время") {
            if hrLoading {
                ProgressView("Загружаем график…")
            } else if let schedule = activeSchedule {
                LabeledContent("Точка", value: schedule.point)
                LabeledContent(
                    "График",
                    value: "\(schedule.startsAt.formatted(date: .abbreviated, time: .shortened)) – \(schedule.endsAt.formatted(date: .omitted, time: .shortened))"
                )
                if schedule.cancelledAt != nil {
                    Label("Смена отменена", systemImage: "xmark.circle.fill").foregroundStyle(.red)
                } else if let attendance = schedule.attendance {
                    LabeledContent("Начало", value: attendance.checkedInAt.formatted(date: .omitted, time: .shortened))
                    if let checkedOutAt = attendance.checkedOutAt {
                        LabeledContent("Завершение", value: checkedOutAt.formatted(date: .omitted, time: .shortened))
                    } else {
                        Button("Завершить рабочую смену", systemImage: "stop.circle.fill", role: .destructive) {
                            Task { await submitAttendance("close", schedule: schedule) }
                        }
                        .disabled(attendanceBusy)
                        .accessibilityIdentifier("staff-attendance-close")
                    }
                } else {
                    Button("Начать рабочую смену", systemImage: "play.circle.fill") {
                        Task { await submitAttendance("open", schedule: schedule) }
                    }
                    .disabled(attendanceBusy)
                    .accessibilityIdentifier("staff-attendance-open")
                }
            } else {
                ContentUnavailableView("Нет запланированной смены", systemImage: "calendar.badge.clock")
            }
            if !hrMutations.isEmpty {
                LabeledContent("Офлайн-очередь", value: String(hrMutations.count))
                ForEach(hrMutations) { mutation in
                    HStack {
                        Label(queueLabel(mutation.state), systemImage: queueIcon(mutation.state))
                        Spacer()
                        if mutation.state == "failed" || mutation.state == "conflict" {
                            Button("Повторить") {
                                Task { await retryAttendance(mutation) }
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                    if let lastError = mutation.lastError {
                        Text(lastError).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Button("Синхронизировать", systemImage: "arrow.triangle.2.circlepath") {
                    Task {
                        await replayAttendanceQueue()
                        await loadAttendance()
                    }
                }
            }
            if let hrMessage {
                Text(hrMessage).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func openShiftSection(_ shift: CashShift) -> some View {
        Section("Открытая смена") {
            LabeledContent("Точка", value: shift.point)
            LabeledContent("Открыта", value: shift.openedAt.formatted(date: .abbreviated, time: .shortened))
            LabeledContent("На начало", value: money(shift.openCash))
            LabeledContent("Ожидается", value: money(shift.expectedCash))
            LabeledContent("Платежей", value: String(shift.payments?.count ?? 0))
        }
        Section("Сверка кассы") {
            TextField("Фактически в кассе", text: $closeCash)
                .keyboardType(.numberPad)
            if let counted = Int(closeCash), counted != shift.expectedCash {
                LabeledContent("Расхождение", value: money(counted - shift.expectedCash))
                    .foregroundStyle(.orange)
                TextField("Причина расхождения", text: $reason, axis: .vertical)
            }
            Button("Закрыть смену", systemImage: "stop.circle.fill", role: .destructive) {
                Task { await closeShift(shift) }
            }
            .disabled(!canClose(shift) || isSubmitting)
        }
    }

    private func canClose(_ shift: CashShift) -> Bool {
        guard let counted = Int(closeCash), counted >= 0 else { return false }
        return counted == shift.expectedCash || !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    @MainActor
    private func loadShift() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let current: CashShift? = try await APIClient(baseURL: environment.apiBaseURL).get("shifts/current", token: session.accessToken)
            if let current {
                shift = try await APIClient(baseURL: environment.apiBaseURL).get("shifts/\(current.id)", token: session.accessToken)
                closeCash = String(shift?.expectedCash ?? current.openCash)
            } else {
                shift = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func loadAttendance() async {
        hrLoading = true
        defer { hrLoading = false }
        do {
            let start = Calendar(identifier: .iso8601).dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            hrWeek = try await APIClient(baseURL: environment.apiBaseURL).get(
                "hr/me/week?weekStart=\(formatter.string(from: start))",
                token: session.accessToken
            )
            hrMessage = nil
        } catch {
            hrMessage = error.localizedDescription
        }
    }

    @MainActor
    private func submitAttendance(_ action: String, schedule: StaffHrSchedule) async {
        attendanceBusy = true
        defer { attendanceBusy = false }
        let key = action == "open" ? checkInKey : checkOutKey
        let request = StaffAttendanceRequest(scheduleId: schedule.id)
        do {
            let _: StaffHrAttendance = try await APIClient(baseURL: environment.apiBaseURL).post(
                "hr/me/attendance/\(action)",
                body: request,
                token: session.accessToken,
                idempotencyKey: key
            )
            rotateAttendanceKey(action)
            await loadAttendance()
        } catch let error as APIError {
            hrMessage = error.localizedDescription
        } catch {
            do {
                try OfflineCourierQueue.enqueue(
                    endpoint: "hr/me/attendance/\(action)",
                    body: request,
                    idempotencyKey: key,
                    context: modelContext
                )
                rotateAttendanceKey(action)
                hrMessage = "Операция сохранена и будет отправлена при появлении сети"
            } catch {
                hrMessage = error.localizedDescription
            }
        }
    }

    @MainActor
    private func replayAttendanceQueue() async {
        let api = APIClient(baseURL: environment.apiBaseURL)
        for mutation in hrMutations where mutation.state == "queued" {
            await OfflineCourierQueue.replay(mutation, api: api, token: session.accessToken, context: modelContext)
        }
    }

    @MainActor
    private func retryAttendance(_ mutation: PendingMutation) async {
        do {
            try OfflineCourierQueue.retry(mutation, context: modelContext)
            await replayAttendanceQueue()
            await loadAttendance()
        } catch {
            hrMessage = error.localizedDescription
        }
    }

    private func rotateAttendanceKey(_ action: String) {
        if action == "open" { checkInKey = UUID().uuidString } else { checkOutKey = UUID().uuidString }
    }

    private func queueLabel(_ state: String) -> String {
        switch state {
        case "syncing": "Отправляется"
        case "conflict": "Требует проверки"
        case "failed": "Ошибка отправки"
        default: "Ожидает сеть"
        }
    }

    private func queueIcon(_ state: String) -> String {
        switch state {
        case "syncing": "arrow.triangle.2.circlepath"
        case "conflict": "exclamationmark.triangle.fill"
        case "failed": "xmark.circle.fill"
        default: "icloud.and.arrow.up"
        }
    }

    @MainActor
    private func openShift() async {
        guard let amount = Int(openCash) else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let created: CashShift = try await APIClient(baseURL: environment.apiBaseURL).post(
                "shifts/open",
                body: OpenShiftRequest(staffId: session.staffId, point: point, openCash: amount),
                token: session.accessToken
            )
            shift = created
            await loadShift()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func closeShift(_ activeShift: CashShift) async {
        guard let amount = Int(closeCash), canClose(activeShift) else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let _: CashShift = try await APIClient(baseURL: environment.apiBaseURL).post(
                "shifts/\(activeShift.id)/close",
                body: CloseShiftRequest(
                    closeCash: amount,
                    reason: reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : reason
                ),
                token: session.accessToken
            )
            shift = nil
            closeCash = ""
            reason = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func money(_ amount: Int) -> String {
        amount.formatted(.currency(code: "KGS").precision(.fractionLength(0)))
    }
}

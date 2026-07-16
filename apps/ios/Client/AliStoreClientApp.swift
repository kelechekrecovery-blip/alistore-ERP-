import AliStoreCore
import SwiftData
import SwiftUI
import UIKit
import UserNotifications

private extension Notification.Name {
    static let alistoreAPNsToken = Notification.Name("alistore.apns.token")
    static let alistoreAPNsFailure = Notification.Name("alistore.apns.failure")
}

private final class ClientAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .alistoreAPNsToken, object: token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .alistoreAPNsFailure, object: error.localizedDescription)
    }
}

private enum ClientTab: Hashable {
    case home, catalog, favorites, cart, account
}

private enum ClientTheme {
    static let background = Color(red: 0.055, green: 0.047, blue: 0.039)
    static let surface = Color(red: 0.133, green: 0.118, blue: 0.098)
    static let line = Color(red: 0.18, green: 0.157, blue: 0.133)
    static let coral = Color(red: 1, green: 0.357, blue: 0.18)
    static let lime = Color(red: 0.776, green: 1, blue: 0.239)
    static let muted = Color(red: 0.655, green: 0.612, blue: 0.573)
}

@main
struct AliStoreClientApp: App {
    @UIApplicationDelegateAdaptor(ClientAppDelegate.self) private var appDelegate
    private let container = OfflineStore.container()

    var body: some Scene {
        WindowGroup { ClientRootView(environment: .live()) }
            .modelContainer(container)
    }
}

private struct ClientRootView: View {
    let environment: AppEnvironment
    @State private var auth: CustomerAuthStore
    @State private var products: [Product] = []
    @State private var catalogLoading = true
    @State private var catalogError: String?
    @State private var cart: [String: Int] = [:]
    @State private var favorites: Set<String> = []
    @State private var selectedTab: ClientTab = .home
    @State private var orderRefreshRevision = 0
    @State private var pushStatus = "Push не настроен"
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase

    init(environment: AppEnvironment) {
        self.environment = environment
        _auth = State(initialValue: CustomerAuthStore(
            environment: environment,
            restoresStoredSession: !UITestBootstrap.disablesSessionRestore
        ))
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            ClientHomeView(products: products, isLoading: catalogLoading, errorMessage: catalogError, cart: $cart, favorites: $favorites, openCatalog: { selectedTab = .catalog })
                .tabItem { Label("Главная", systemImage: "house") }
                .tag(ClientTab.home)
            CatalogView(products: products, isLoading: catalogLoading, errorMessage: catalogError, cart: $cart, favorites: $favorites)
                .tabItem { Label("Каталог", systemImage: "square.grid.2x2") }
                .tag(ClientTab.catalog)
            FavoritesView(products: products, cart: $cart, favorites: $favorites)
                .tabItem { Label("Избранное", systemImage: "heart") }
                .tag(ClientTab.favorites)
            CartView(environment: environment, auth: auth, products: products, cart: $cart)
                .tabItem { Label("Корзина", systemImage: "bag") }
                .badge(cart.values.reduce(0, +))
                .tag(ClientTab.cart)
            AccountView(environment: environment, auth: auth, pushStatus: pushStatus, orderRefreshRevision: orderRefreshRevision, onEnablePush: enablePush)
                .tabItem { Label("Кабинет", systemImage: "person.crop.circle") }
                .tag(ClientTab.account)
        }
        .tint(ClientTheme.lime)
        .preferredColorScheme(.dark)
        .overlay {
            if auth.requiresQuickUnlock, let session = auth.session {
                QuickUnlockView(title: "AliStore", username: session.phone, pinService: auth.quickUnlockService, onUnlocked: auth.unlock, onLogout: { Task { await auth.logout() } })
            }
        }
        .task {
            async let restore: Void = auth.restore()
            async let catalog: Void = loadCatalog()
            _ = await (restore, catalog)
        }
        .onOpenURL { url in
            guard url.scheme == "alistore", url.host == "payment-return" else { return }
            selectedTab = .account
            orderRefreshRevision += 1
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, auth.session != nil {
                orderRefreshRevision += 1
                Task { await replayPendingOrders() }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .alistoreAPNsToken)) { notification in
            guard let token = notification.object as? String else { return }
            Task { await registerPushToken(token) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .alistoreAPNsFailure)) { notification in
            pushStatus = notification.object as? String ?? "APNs registration failed"
        }
    }

    private func loadCatalog() async {
        catalogLoading = true
        defer { catalogLoading = false }
        do {
            let response: CatalogResponse = try await APIClient(baseURL: environment.apiBaseURL).get("catalog/products?limit=100")
            products = response.items
            catalogError = nil
        } catch {
            catalogError = error.localizedDescription
        }
    }

    @MainActor
    private func replayPendingOrders() async {
        guard let token = auth.session?.accessToken else { return }
        let descriptor = FetchDescriptor<PendingMutation>(
            sortBy: [SortDescriptor(\.createdAt)]
        )
        guard let mutations = try? modelContext.fetch(descriptor) else { return }
        for mutation in mutations where mutation.state == "queued" || mutation.state == "failed" {
            await OfflineOrderQueue.replay(
                mutation,
                api: APIClient(baseURL: environment.apiBaseURL),
                token: token,
                context: modelContext
            )
        }
    }

    private func enablePush() {
        Task {
            do {
                let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
                guard granted else {
                    pushStatus = "Уведомления отключены"
                    return
                }
                pushStatus = "Регистрация APNs…"
                await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
            } catch {
                pushStatus = error.localizedDescription
            }
        }
    }

    private func registerPushToken(_ token: String) async {
        guard let session = auth.session else {
            pushStatus = "Войдите, чтобы привязать push"
            return
        }
        do {
            let deviceId = installationId()
            let registered: RegisteredPushToken = try await APIClient(baseURL: environment.apiBaseURL).post(
                "notifications/push-tokens",
                body: RegisterPushTokenRequest(token: token, deviceId: deviceId),
                token: session.accessToken
            )
            pushStatus = registered.enabled ? "Push подключён" : "Push отключён"
        } catch {
            pushStatus = error.localizedDescription
        }
    }

    private func installationId() -> String {
        let key = "alistore.client.installation-id"
        if let value = UserDefaults.standard.string(forKey: key) { return value }
        let value = "ios-\(UUID().uuidString.lowercased())"
        UserDefaults.standard.set(value, forKey: key)
        return value
    }
}

private struct CartView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let products: [Product]
    @Binding var cart: [String: Int]
    @Environment(\.modelContext) private var modelContext
    @State private var fulfillment = "pickup"
    @State private var paymentMethod = "cash"
    @State private var address = ""
    @State private var pickupPoints: [StorePoint] = []
    @State private var selectedStorePointId = ""
    @State private var pointError: String?
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var completedOrder: CustomerOrder?
    @State private var paymentIntent: PaymentIntent?
    @State private var queuedOffline = false

    private var lines: [(Product, Int)] {
        cart.compactMap { id, quantity in products.first(where: { $0.id == id }).map { ($0, quantity) } }
    }
    private var total: Int { lines.reduce(0) { $0 + $1.0.price * $1.1 } }

    var body: some View {
        NavigationStack {
            Group {
                if queuedOffline {
                    ContentUnavailableView(
                        "Заказ сохранён офлайн",
                        systemImage: "arrow.triangle.2.circlepath",
                        description: Text("Повторите отправку в Кабинет → Синхронизация.")
                    )
                } else if let order = completedOrder {
                    VStack(spacing: 18) {
                        ContentUnavailableView(
                            paymentIntent == nil ? "Заказ оформлен" : "Ожидает оплаты",
                            systemImage: paymentIntent == nil ? "checkmark.circle.fill" : "creditcard",
                            description: Text("#\(order.id.suffix(6)) · \(order.total.formatted(.currency(code: "KGS")))")
                        )
                        if let paymentIntent {
                            if let url = paymentURL(paymentIntent) {
                                Link("Перейти к оплате", destination: url)
                                    .buttonStyle(.borderedProminent)
                            }
                            if let qr = paymentIntent.qrPayload {
                                Text(qr).font(.caption.monospaced()).textSelection(.enabled).padding(.horizontal)
                            }
                            Text("Статус подтвердит только платёжный webhook.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } else if lines.isEmpty {
                    EmptyStateView(title: "Корзина пуста", detail: "Добавьте товары из каталога.", symbol: "bag")
                } else {
                    List {
                        Section("Товары") {
                            ForEach(lines, id: \.0.id) { product, quantity in
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(product.name).font(.headline)
                                        Text(product.price, format: .currency(code: "KGS")).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Stepper("\(quantity)", value: quantityBinding(product.id), in: 0...max(1, product.availableUnits))
                                        .fixedSize()
                                }
                            }
                        }
                        Section("Получение") {
                            Picker("Способ", selection: $fulfillment) {
                                Text("Самовывоз").tag("pickup")
                                Text("Курьер").tag("courier")
                            }
                            .pickerStyle(.segmented)
                            if fulfillment == "courier" {
                                TextField("Адрес доставки", text: $address)
                            } else {
                                if pickupPoints.isEmpty {
                                    Text(pointError ?? "Загружаем точки…").foregroundStyle(.secondary)
                                } else {
                                    Picker("Точка", selection: $selectedStorePointId) {
                                        ForEach(pickupPoints) { point in
                                            Text("\(point.name) · \(point.address)").tag(point.id)
                                        }
                                    }
                                }
                            }
                        }
                        Section("Оплата") {
                            Picker("Способ", selection: $paymentMethod) {
                                Text("При получении").tag("cash")
                                Text("Карта").tag(OnlinePaymentMethod.card.rawValue)
                                Text("MBank QR").tag(OnlinePaymentMethod.qrMBank.rawValue)
                                Text("O!Деньги QR").tag(OnlinePaymentMethod.qrODengi.rawValue)
                                Text("Рассрочка").tag(OnlinePaymentMethod.installment.rawValue)
                            }
                        }
                        Section {
                            LabeledContent("Итого", value: total, format: .currency(code: "KGS"))
                            if auth.session == nil {
                                Text("Войдите по SMS-коду во вкладке «Кабинет».").font(.caption).foregroundStyle(.secondary)
                            }
                            if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
                            Button {
                                Task { await checkout() }
                            } label: {
                                HStack {
                                    Spacer()
                                    if isSubmitting { ProgressView() } else { Text("Оформить заказ").fontWeight(.semibold) }
                                    Spacer()
                                }
                            }
                            .disabled(isSubmitting || auth.session == nil || (fulfillment == "pickup" && selectedStorePointId.isEmpty) || (fulfillment == "courier" && address.trimmingCharacters(in: .whitespaces).isEmpty))
                        }
                    }
                }
            }
            .navigationTitle("Корзина")
            .task { await loadStorePoints() }
        }
    }

    private func quantityBinding(_ id: String) -> Binding<Int> {
        Binding(
            get: { cart[id] ?? 0 },
            set: { value in
                if value == 0 { cart.removeValue(forKey: id) } else { cart[id] = value }
            }
        )
    }

    private func checkout() async {
        guard let session = auth.session else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        let request = CreateOrderRequest(
            customerId: session.customerId,
            fulfillmentType: fulfillment,
            storePointId: fulfillment == "pickup" ? selectedStorePointId : nil,
            deliveryAddress: fulfillment == "courier" ? address.trimmingCharacters(in: .whitespaces) : nil,
            total: total,
            items: lines.map { CreateOrderItem(sku: $0.0.sku, qty: $0.1, price: $0.0.price) }
        )
        let idempotencyKey = UUID().uuidString
        do {
            let order: CustomerOrder = try await APIClient(baseURL: environment.apiBaseURL).post(
                "orders/mine",
                body: request,
                token: session.accessToken,
                idempotencyKey: idempotencyKey
            )
            if let onlineMethod = OnlinePaymentMethod(rawValue: paymentMethod) {
                paymentIntent = try await APIClient(baseURL: environment.apiBaseURL).post(
                    "payments/intents/mine",
                    body: CreatePaymentIntentRequest(
                        orderId: order.id,
                        method: onlineMethod,
                        amount: order.total,
                        returnUrl: "alistore://payment-return?orderId=\(order.id)"
                    ),
                    token: session.accessToken,
                    idempotencyKey: UUID().uuidString
                )
            }
            completedOrder = order
            cart.removeAll()
        } catch {
            if error is URLError {
                do {
                    try OfflineOrderQueue.enqueue(request, idempotencyKey: idempotencyKey, context: modelContext)
                    queuedOffline = true
                    cart.removeAll()
                } catch {
                    errorMessage = error.localizedDescription
                }
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    @MainActor
    private func loadStorePoints() async {
        do {
            let options: CheckoutOptions = try await APIClient(baseURL: environment.apiBaseURL).get("logistics/checkout-options")
            pickupPoints = options.pickupPoints
            if !pickupPoints.contains(where: { $0.id == selectedStorePointId }) {
                selectedStorePointId = pickupPoints.first?.id ?? ""
            }
            pointError = pickupPoints.isEmpty ? "Самовывоз временно недоступен" : nil
        } catch {
            pickupPoints = []
            selectedStorePointId = ""
            pointError = error.localizedDescription
        }
    }

    private func paymentURL(_ intent: PaymentIntent) -> URL? {
        URL(string: intent.paymentUrl, relativeTo: environment.apiBaseURL)?.absoluteURL
    }
}

private struct OrdersView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let refreshRevision: Int
    @State private var orders: [CustomerOrder] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if auth.isRestoring || isLoading {
                    ProgressView("Загружаем заказы")
                } else if auth.session == nil {
                    EmptyStateView(title: "Войдите в аккаунт", detail: "История заказов доступна после входа по SMS-коду.", symbol: "person.badge.key")
                } else if let errorMessage {
                    ContentUnavailableView("Заказы недоступны", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
                } else if orders.isEmpty {
                    EmptyStateView(title: "Заказов пока нет", detail: "Здесь появятся покупки из магазина и приложения.", symbol: "shippingbox")
                } else {
                    List(orders) { order in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("Заказ #\(order.id.suffix(6))").font(.headline)
                                Spacer()
                                Text(order.status).font(.caption.weight(.semibold)).foregroundStyle(.orange)
                            }
                            Text("\(order.items.reduce(0) { $0 + $1.qty }) тов. · \(order.total.formatted(.currency(code: "KGS")))")
                                .font(.subheadline)
                            Text(order.createdAt, format: .dateTime.day().month().year())
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Мои заказы")
            .task(id: "\(auth.session?.accessToken ?? "guest")-\(refreshRevision)") { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        guard let token = auth.session?.accessToken else {
            orders = []
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            orders = try await APIClient(baseURL: environment.apiBaseURL).get("orders/mine", token: token)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct AccountView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let pushStatus: String
    let orderRefreshRevision: Int
    let onEnablePush: () -> Void
    @State private var phone = "+996"
    @State private var code = ""
    @State private var codeRequested = false

    var body: some View {
        NavigationStack {
            Form {
                if auth.isRestoring {
                    Section { ProgressView("Восстанавливаем сессию") }
                } else if let session = auth.session {
                    Section("Аккаунт") {
                        LabeledContent("Телефон", value: session.phone)
                        LabeledContent("ID", value: String(session.customerId.suffix(8)))
                        NavigationLink("Мои заказы") {
                            OrdersView(environment: environment, auth: auth, refreshRevision: orderRefreshRevision)
                        }
                        NavigationLink("Мои устройства и гарантия") {
                            DevicesView(environment: environment, auth: auth)
                        }
                        NavigationLink("Поддержка") {
                            CustomerSupportView(environment: environment, auth: auth)
                        }
                    }
                    Section("Уведомления") {
                        LabeledContent("Статус", value: pushStatus)
                        Button("Включить push", systemImage: "bell.badge") { onEnablePush() }
                    }
                    Section("Синхронизация") {
                        NavigationLink("Офлайн-операции") {
                            OfflineQueueView(environment: environment, auth: auth)
                        }
                    }
                    Section {
                        Button("Выйти", role: .destructive) { Task { await auth.logout() } }
                    }
                } else {
                    Section("Вход по SMS") {
                        TextField("+996 555 000 000", text: $phone)
                            .keyboardType(.phonePad)
                        if codeRequested {
                            TextField("6-значный код", text: $code)
                                .keyboardType(.numberPad)
                            if let devCode = auth.devCode {
                                Text("Dev-код: \(devCode)").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    if let error = auth.errorMessage {
                        Section { Text(error).foregroundStyle(.red) }
                    }
                    Section {
                        if codeRequested {
                            Button("Войти") {
                                Task { await auth.verify(phone: normalizedPhone, code: code.filter(\.isNumber)) }
                            }
                            .disabled(auth.isLoading || code.filter(\.isNumber).count != 6)
                        } else {
                            Button("Получить код") {
                                Task { codeRequested = await auth.requestOTP(phone: normalizedPhone) }
                            }
                            .disabled(auth.isLoading || normalizedPhone.filter(\.isNumber).count < 9)
                        }
                    }
                }
            }
            .navigationTitle("Кабинет")
        }
    }

    private var normalizedPhone: String {
        let digits = phone.filter(\.isNumber)
        return "+\(digits)"
    }
}

private struct CustomerSupportView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    @State private var tickets: [CustomerSupportTicket] = []
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var subject = ""
    @State private var details = ""
    @State private var priority = "normal"
    @State private var submissionKey = UUID().uuidString
    @State private var isSubmitting = false
    @State private var submissionError: String?

    private var normalizedSubject: String {
        subject.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var normalizedDetails: String? {
        let value = details.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    var body: some View {
        List {
            Section("Связаться с нами") {
                Label("Ответим в приложении", systemImage: "message.fill")
                Text("Опишите вопрос — обращение получит SLA и появится в очереди поддержки.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Новое обращение") {
                TextField("Тема", text: $subject)
                    .accessibilityIdentifier("support-subject")
                TextField("Подробности", text: $details, axis: .vertical)
                    .lineLimit(3...7)
                    .accessibilityIdentifier("support-details")
                Picker("Срочность", selection: $priority) {
                    Text("Обычная").tag("normal")
                    Text("Высокая").tag("high")
                    Text("Срочная").tag("urgent")
                }
                if let submissionError {
                    Text(submissionError).font(.caption).foregroundStyle(.red)
                }
                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Label("Создать обращение", systemImage: "paperplane.fill")
                    }
                }
                .disabled(isSubmitting || normalizedSubject.isEmpty)
                .accessibilityIdentifier("support-submit")
            }

            Section("Мои обращения") {
                if isLoading {
                    HStack {
                        Spacer()
                        ProgressView("Загружаем")
                        Spacer()
                    }
                } else if let loadError {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(loadError).font(.caption).foregroundStyle(.red)
                        Button("Повторить", systemImage: "arrow.clockwise") {
                            Task { await load() }
                        }
                    }
                } else if tickets.isEmpty {
                    ContentUnavailableView("Обращений пока нет", systemImage: "bubble.left.and.bubble.right")
                } else {
                    ForEach(tickets) { ticket in
                        VStack(alignment: .leading, spacing: 7) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(ticket.subject).font(.headline)
                                Spacer()
                                Text(statusLabel(ticket.status))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(ticket.status == "resolved" || ticket.status == "closed" ? .secondary : ClientTheme.lime)
                            }
                            if let body = ticket.body, !body.isEmpty {
                                Text(body).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                            }
                            HStack {
                                Text(priorityLabel(ticket.priority))
                                Spacer()
                                Text(ticket.createdAt, format: .dateTime.day().month().year())
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                        .accessibilityIdentifier("support-ticket-\(ticket.id)")
                    }
                }
            }
        }
        .navigationTitle("Поддержка")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: subject) { _, _ in renewSubmissionKey() }
        .onChange(of: details) { _, _ in renewSubmissionKey() }
        .onChange(of: priority) { _, _ in renewSubmissionKey() }
    }

    @MainActor
    private func load() async {
        guard let token = auth.session?.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let loaded: [CustomerSupportTicket] = try await APIClient(baseURL: environment.apiBaseURL).get(
                "support/tickets/mine",
                token: token
            )
            guard !Task.isCancelled else { return }
            tickets = loaded
            loadError = nil
        } catch is CancellationError {
            return
        } catch {
            loadError = error.localizedDescription
        }
    }

    @MainActor
    private func submit() async {
        guard let token = auth.session?.accessToken, !normalizedSubject.isEmpty else { return }
        let request = OpenCustomerSupportTicketRequest(
            subject: normalizedSubject,
            body: normalizedDetails,
            priority: priority
        )
        let key = submissionKey
        isSubmitting = true
        submissionError = nil
        defer { isSubmitting = false }
        do {
            let ticket: CustomerSupportTicket = try await APIClient(baseURL: environment.apiBaseURL).post(
                "support/tickets/mine",
                body: request,
                token: token,
                idempotencyKey: key
            )
            tickets.removeAll { $0.id == ticket.id }
            tickets.insert(ticket, at: 0)
            subject = ""
            details = ""
            priority = "normal"
            submissionKey = UUID().uuidString
        } catch is CancellationError {
            return
        } catch {
            submissionError = error.localizedDescription
        }
    }

    private func renewSubmissionKey() {
        guard !isSubmitting else { return }
        submissionKey = UUID().uuidString
    }

    private func statusLabel(_ status: String) -> String {
        ["new": "Новое", "in_progress": "В работе", "waiting": "Ожидает", "resolved": "Решено", "closed": "Закрыто"][status] ?? status
    }

    private func priorityLabel(_ priority: String) -> String {
        ["normal": "Обычная", "high": "Высокая", "urgent": "Срочная"][priority] ?? priority
    }
}

private struct OfflineQueueView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PendingMutation.createdAt) private var mutations: [PendingMutation]

    var body: some View {
        Group {
            if mutations.isEmpty {
                EmptyStateView(title: "Очередь пуста", detail: "Все операции синхронизированы.", symbol: "checkmark.icloud")
            } else {
                List(mutations) { mutation in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Заказ").font(.headline)
                            Spacer()
                            Text(stateLabel(mutation.state))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(stateColor(mutation.state))
                        }
                        Text(String(mutation.idempotencyKey.prefix(12))).font(.caption.monospaced()).foregroundStyle(.secondary)
                        if let error = mutation.lastError { Text(error).font(.caption).foregroundStyle(.red) }
                        Button("Повторить", systemImage: "arrow.clockwise") {
                            Task { await retry(mutation) }
                        }
                        .disabled(mutation.state == "syncing" || auth.session == nil)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Синхронизация")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func retry(_ mutation: PendingMutation) async {
        guard let token = auth.session?.accessToken else { return }
        await OfflineOrderQueue.replay(
            mutation,
            api: APIClient(baseURL: environment.apiBaseURL),
            token: token,
            context: modelContext
        )
    }

    private func stateLabel(_ state: String) -> String {
        ["queued": "В очереди", "syncing": "Отправка", "conflict": "Конфликт", "failed": "Ошибка"][state] ?? state
    }

    private func stateColor(_ state: String) -> Color {
        switch state {
        case "conflict", "failed": return .red
        case "syncing": return .orange
        default: return .secondary
        }
    }
}

private struct DevicesView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    @State private var devices: [CustomerDevice] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Загружаем устройства")
            } else if let errorMessage {
                ContentUnavailableView("Устройства недоступны", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
            } else if devices.isEmpty {
                EmptyStateView(title: "Устройств пока нет", detail: "Купленные устройства появятся после оплаты заказа.", symbol: "iphone")
            } else {
                List(devices) { device in
                    NavigationLink {
                        WarrantyRequestView(environment: environment, auth: auth, device: device)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(device.product).font(.headline)
                                Spacer()
                                Text(device.warranty?.status ?? "Гарантия")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(device.daysLeft.map { $0 > 0 } == true ? .green : .secondary)
                            }
                            Text("IMEI \(device.imei)").font(.caption.monospaced()).foregroundStyle(.secondary)
                            if let days = device.daysLeft {
                                Text(days > 0 ? "Осталось \(days) дн." : "Гарантия завершена").font(.caption)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Мои устройства")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let token = auth.session?.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            devices = try await APIClient(baseURL: environment.apiBaseURL).get("customers/me/devices", token: token)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct WarrantyRequestView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let device: CustomerDevice
    @State private var problem = ""
    @State private var isSubmitting = false
    @State private var created: WarrantyCase?
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Устройство") {
                LabeledContent("Модель", value: device.product)
                LabeledContent("IMEI", value: device.imei)
                if let days = device.daysLeft { LabeledContent("Гарантия", value: "\(days) дн.") }
            }
            if let warranty = device.warranty {
                Section("Обращение") {
                    LabeledContent("Статус", value: warranty.status)
                    LabeledContent("SLA", value: warranty.sla, format: .dateTime.day().month().year())
                }
            } else if let created {
                Section("Обращение") {
                    LabeledContent("Статус", value: created.status)
                    LabeledContent("SLA", value: created.sla, format: .dateTime.day().month().year())
                }
            } else {
                Section("Проблема") {
                    TextField("Опишите неисправность", text: $problem, axis: .vertical)
                        .lineLimit(3...7)
                    if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSubmitting { ProgressView() } else { Text("Открыть гарантийное обращение") }
                    }
                    .disabled(isSubmitting || problem.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .navigationTitle("Гарантия")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func submit() async {
        guard let session = auth.session else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            created = try await APIClient(baseURL: environment.apiBaseURL).post(
                "warranty",
                body: OpenWarrantyRequest(imei: device.imei, customerId: session.customerId, problem: problem.trimmingCharacters(in: .whitespacesAndNewlines)),
                token: session.accessToken,
                idempotencyKey: UUID().uuidString
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct CatalogView: View {
    let products: [Product]
    let isLoading: Bool
    let errorMessage: String?
    @Binding var cart: [String: Int]
    @Binding var favorites: Set<String>
    @State private var search = ""

    private var visibleProducts: [Product] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return products }
        return products.filter { $0.name.localizedCaseInsensitiveContains(query) || $0.category.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ClientTheme.background.ignoresSafeArea()
                if isLoading {
                    ProgressView("Загружаем каталог").tint(ClientTheme.lime)
                } else if let errorMessage {
                    ContentUnavailableView("Каталог недоступен", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
                } else if products.isEmpty {
                    EmptyStateView(title: "Каталог пока пуст", detail: "Товары появятся после синхронизации.", symbol: "square.grid.2x2")
                } else {
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            ForEach(visibleProducts) { product in
                                NavigationLink {
                                    ProductDetail(product: product, cart: $cart)
                                } label: {
                                    NativeProductCard(product: product, cart: $cart, favorites: $favorites)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(16)
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Каталог")
            .searchable(text: $search, prompt: "Техника и бренды")
        }
    }
}

private struct ClientHomeView: View {
    let products: [Product]
    let isLoading: Bool
    let errorMessage: String?
    @Binding var cart: [String: Int]
    @Binding var favorites: Set<String>
    let openCatalog: () -> Void

    private let categories = [("Смартфоны", "iphone"), ("Ноутбуки", "laptopcomputer"), ("Аудио", "airpodsmax"), ("Часы", "applewatch"), ("Планшеты", "ipad")]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack(spacing: 10) {
                        ServiceCard(title: "Доставка 1–2 ч", detail: "по Бишкеку", symbol: "bolt.fill", highlighted: true)
                        ServiceCard(title: "Самовывоз", detail: "бесплатно", symbol: "building.2")
                        ServiceCard(title: "Trade-in", detail: "оценка за 30с", symbol: "arrow.triangle.2.circlepath")
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(categories, id: \.0) { category in
                                Button(action: openCatalog) {
                                    VStack(spacing: 8) {
                                        Image(systemName: category.1).font(.title3)
                                        Text(category.0).font(.caption2)
                                    }
                                    .foregroundStyle(.white)
                                    .frame(width: 82, height: 70)
                                    .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(ClientTheme.line))
                                }
                            }
                        }
                    }
                    Button(action: openCatalog) {
                        ZStack(alignment: .bottomTrailing) {
                            LinearGradient(colors: [Color(red: 0.16, green: 0.16, blue: 0.18), ClientTheme.background], startPoint: .topLeading, endPoint: .bottomTrailing)
                            Image(systemName: "iphone.gen3").font(.system(size: 96, weight: .thin)).foregroundStyle(.white.opacity(0.12)).padding(16)
                            VStack(alignment: .leading, spacing: 8) {
                                Text("НОВИНКА · В НАЛИЧИИ").font(.caption2.monospaced().weight(.bold)).foregroundStyle(ClientTheme.lime)
                                Text("iPhone 17 Pro Max").font(.title2.weight(.heavy)).foregroundStyle(.white)
                                Text("от 115 000 сом · рассрочка 0%").font(.caption).foregroundStyle(ClientTheme.muted)
                                Text("Смотреть").font(.subheadline.weight(.bold)).foregroundStyle(.black).padding(.horizontal, 18).frame(height: 40).background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 10)).padding(.top, 6)
                                Spacer(minLength: 0)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(22)
                        }
                        .frame(height: 174)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(ClientTheme.line))
                    }
                    .buttonStyle(.plain)
                    HStack {
                        Text("Хиты продаж").font(.title3.weight(.bold))
                        Spacer()
                        Button("Все", action: openCatalog).foregroundStyle(ClientTheme.lime)
                    }
                    if isLoading {
                        ProgressView().tint(ClientTheme.lime).frame(maxWidth: .infinity)
                    } else if let errorMessage {
                        Text(errorMessage).font(.caption).foregroundStyle(.red)
                    } else if products.isEmpty {
                        Text("Каталог скоро наполнится").foregroundStyle(ClientTheme.muted).frame(maxWidth: .infinity).padding(30).background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                    } else {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            ForEach(products.prefix(6)) { product in
                                NativeProductCard(product: product, cart: $cart, favorites: $favorites)
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(ClientTheme.background)
            .navigationTitle("AliStore")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Image(systemName: "bell").foregroundStyle(.white) } }
        }
    }
}

private struct FavoritesView: View {
    let products: [Product]
    @Binding var cart: [String: Int]
    @Binding var favorites: Set<String>
    private var items: [Product] { products.filter { favorites.contains($0.id) } }

    var body: some View {
        NavigationStack {
            ZStack {
                ClientTheme.background.ignoresSafeArea()
                if items.isEmpty {
                    ContentUnavailableView("Нет избранного", systemImage: "heart", description: Text("Сохраняйте товары, чтобы быстро вернуться к ним."))
                } else {
                    ScrollView { LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) { ForEach(items) { NativeProductCard(product: $0, cart: $cart, favorites: $favorites) } }.padding(16) }
                }
            }
            .navigationTitle("Избранное")
        }
    }
}

private struct NativeProductCard: View {
    let product: Product
    @Binding var cart: [String: Int]
    @Binding var favorites: Set<String>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.05)).frame(height: 112)
                Image(systemName: product.category.localizedCaseInsensitiveContains("ноут") ? "laptopcomputer" : "iphone.gen3").font(.system(size: 52, weight: .ultraLight)).foregroundStyle(.white.opacity(0.8)).frame(maxWidth: .infinity, maxHeight: 112)
                Button { if favorites.contains(product.id) { favorites.remove(product.id) } else { favorites.insert(product.id) } } label: { Image(systemName: favorites.contains(product.id) ? "heart.fill" : "heart").foregroundStyle(favorites.contains(product.id) ? ClientTheme.coral : .white).frame(width: 44, height: 44) }
            }
            Text(product.name).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(2).frame(minHeight: 38, alignment: .top)
            Text(product.price.formatted(.currency(code: "KGS"))).font(.subheadline.monospacedDigit().weight(.bold)).foregroundStyle(.white)
            Button { cart[product.id] = min(product.availableUnits, (cart[product.id] ?? 0) + 1) } label: { Label("В корзину", systemImage: "bag.badge.plus").font(.caption.weight(.bold)).frame(maxWidth: .infinity).frame(height: 38).background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(.black) }.disabled(product.availableUnits == 0)
        }
        .padding(10)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(ClientTheme.line))
    }
}

private struct ServiceCard: View {
    let title: String
    let detail: String
    let symbol: String
    var highlighted = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: symbol).font(.title3)
            Spacer(minLength: 2)
            Text(title).font(.caption.weight(.bold)).lineLimit(2)
            Text(detail).font(.caption2).foregroundStyle(highlighted ? .white.opacity(0.8) : ClientTheme.muted)
        }
        .foregroundStyle(.white)
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
        .background(highlighted ? ClientTheme.coral : ClientTheme.surface, in: RoundedRectangle(cornerRadius: 15))
        .overlay(RoundedRectangle(cornerRadius: 15).stroke(highlighted ? Color.clear : ClientTheme.line))
    }
}

private struct ProductDetail: View {
    let product: Product
    @Binding var cart: [String: Int]

    var body: some View {
        List {
            Section {
                LabeledContent("SKU", value: product.sku)
                LabeledContent("Категория", value: product.category)
                LabeledContent("Цена", value: product.price, format: .currency(code: "KGS"))
                LabeledContent("Доступно", value: "\(product.availableUnits)")
            }
            Section {
                Button("Добавить в корзину", systemImage: "bag.badge.plus") {
                    cart[product.id] = min(product.availableUnits, (cart[product.id] ?? 0) + 1)
                }
                    .disabled(product.availableUnits == 0)
            }
        }
        .navigationTitle(product.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

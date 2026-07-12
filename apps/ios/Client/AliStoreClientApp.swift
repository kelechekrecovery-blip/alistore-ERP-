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
    case catalog, cart, orders, account
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
    @State private var selectedTab: ClientTab = .catalog
    @State private var orderRefreshRevision = 0
    @State private var pushStatus = "Push не настроен"
    @Environment(\.scenePhase) private var scenePhase

    init(environment: AppEnvironment) {
        self.environment = environment
        _auth = State(initialValue: CustomerAuthStore(environment: environment))
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            CatalogView(products: products, isLoading: catalogLoading, errorMessage: catalogError, cart: $cart)
                .tabItem { Label("Каталог", systemImage: "square.grid.2x2") }
                .tag(ClientTab.catalog)
            CartView(environment: environment, auth: auth, products: products, cart: $cart)
                .tabItem { Label("Корзина", systemImage: "bag") }
                .badge(cart.values.reduce(0, +))
                .tag(ClientTab.cart)
            OrdersView(environment: environment, auth: auth, refreshRevision: orderRefreshRevision)
                .tabItem { Label("Заказы", systemImage: "shippingbox") }
                .tag(ClientTab.orders)
            AccountView(environment: environment, auth: auth, pushStatus: pushStatus, onEnablePush: enablePush)
                .tabItem { Label("Кабинет", systemImage: "person.crop.circle") }
                .tag(ClientTab.account)
        }
        .tint(.orange)
        .task {
            async let restore: Void = auth.restore()
            async let catalog: Void = loadCatalog()
            _ = await (restore, catalog)
        }
        .onOpenURL { url in
            guard url.scheme == "alistore", url.host == "payment-return" else { return }
            selectedTab = .orders
            orderRefreshRevision += 1
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, auth.session != nil { orderRefreshRevision += 1 }
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
    @State private var fulfillment = "pickup"
    @State private var paymentMethod = "cash"
    @State private var address = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var completedOrder: CustomerOrder?
    @State private var paymentIntent: PaymentIntent?

    private var lines: [(Product, Int)] {
        cart.compactMap { id, quantity in products.first(where: { $0.id == id }).map { ($0, quantity) } }
    }
    private var total: Int { lines.reduce(0) { $0 + $1.0.price * $1.1 } }

    var body: some View {
        NavigationStack {
            Group {
                if let order = completedOrder {
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
                                LabeledContent("Точка", value: "AliStore Центр")
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
                            .disabled(isSubmitting || auth.session == nil || (fulfillment == "courier" && address.trimmingCharacters(in: .whitespaces).isEmpty))
                        }
                    }
                }
            }
            .navigationTitle("Корзина")
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
            pickupPoint: fulfillment == "pickup" ? "BISHKEK-1" : nil,
            deliveryAddress: fulfillment == "courier" ? address.trimmingCharacters(in: .whitespaces) : nil,
            total: total,
            items: lines.map { CreateOrderItem(sku: $0.0.sku, qty: $0.1, price: $0.0.price) }
        )
        do {
            let order: CustomerOrder = try await APIClient(baseURL: environment.apiBaseURL).post(
                "orders/mine",
                body: request,
                token: session.accessToken,
                idempotencyKey: UUID().uuidString
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
            errorMessage = error.localizedDescription
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
                        NavigationLink("Мои устройства и гарантия") {
                            DevicesView(environment: environment, auth: auth)
                        }
                    }
                    Section("Уведомления") {
                        LabeledContent("Статус", value: pushStatus)
                        Button("Включить push", systemImage: "bell.badge") { onEnablePush() }
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

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Загружаем каталог")
                } else if let errorMessage {
                    ContentUnavailableView("Каталог недоступен", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
                } else if products.isEmpty {
                    EmptyStateView(title: "Каталог пока пуст", detail: "Товары появятся после синхронизации.", symbol: "square.grid.2x2")
                } else {
                    List(products) { product in
                        NavigationLink {
                            ProductDetail(product: product, cart: $cart)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(product.name).font(.headline)
                                Text(product.category).font(.caption).foregroundStyle(.secondary)
                                HStack {
                                    Text(product.price, format: .currency(code: "KGS")).fontWeight(.semibold)
                                    Spacer()
                                    Text(product.availableUnits > 0 ? "В наличии" : "Под заказ")
                                        .font(.caption)
                                        .foregroundStyle(product.availableUnits > 0 ? .green : .secondary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("AliStore")
        }
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

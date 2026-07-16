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

    static func display(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .custom("Avenir Next", size: size).weight(weight)
    }

    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom("Avenir Next", size: size).weight(weight)
    }
}

private struct ClientProductImage: View {
    let product: Product
    let cornerRadius: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(Color.white.opacity(0.045))
            if let asset = assetName {
                Image(asset)
                    .resizable()
                    .scaledToFit()
                    .padding(14)
            } else {
                Image(systemName: fallbackSymbol)
                    .font(.system(size: 52, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }

    private var assetName: String? {
        let value = "\(product.name) \(product.category)".lowercased()
        if value.contains("airpods") || value.contains("аудио") { return "client-product-airpods" }
        if value.contains("macbook") || value.contains("ноут") { return "client-product-macbook" }
        if value.contains("ipad") || value.contains("планшет") { return "client-product-ipad" }
        if value.contains("watch") || value.contains("часы") { return "client-product-watch" }
        if value.contains("samsung") { return "client-product-samsung" }
        if value.contains("iphone") || value.contains("смартфон") { return "client-product-iphone" }
        return nil
    }

    private var fallbackSymbol: String {
        product.category.localizedCaseInsensitiveContains("ноут") ? "laptopcomputer" : "iphone.gen3"
    }
}

private struct ClientStatusBar: View {
    var body: some View {
        HStack {
            Text("9:41")
            Spacer()
            Text("AliStore").font(.system(size: 12, design: .monospaced))
            Spacer()
            Text("▪▪▪ 100%")
        }
        .font(ClientTheme.body(13, weight: .semibold))
        .foregroundStyle(.white)
        .padding(.horizontal, 28)
        .frame(height: 44)
        .background(ClientTheme.background)
    }
}

private struct ClientHeader: View {
    let onCompare: () -> Void
    let onNotifications: () -> Void
    let onSearch: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                Label("Бишкек", systemImage: "mappin.fill")
                    .font(ClientTheme.body(12, weight: .medium))
                    .foregroundStyle(ClientTheme.muted)
                Spacer()
                Button(action: onCompare) { Image(systemName: "arrow.left.arrow.right") }
                    .accessibilityLabel("Сравнение")
                Button(action: onNotifications) { Image(systemName: "bell") }
                    .accessibilityLabel("Уведомления")
            }
            .foregroundStyle(.white)
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color(red: 0.431, green: 0.392, blue: 0.361))
                Text("Поиск техники, брендов…")
                    .font(ClientTheme.body(14))
                    .foregroundStyle(Color(red: 0.431, green: 0.392, blue: 0.361))
                Spacer()
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
            .contentShape(Rectangle())
            .onTapGesture(perform: onSearch)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Поиск техники и брендов")
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
        .background(ClientTheme.background)
    }
}

private struct ClientBottomNav: View {
    let selected: ClientTab
    let cartCount: Int
    let onSelect: (ClientTab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            navButton(.home, title: "Главная", symbol: "house")
            navButton(.catalog, title: "Каталог", symbol: "square.grid.2x2")
            navButton(.favorites, title: "Избранное", symbol: "heart")
            navButton(.cart, title: "Корзина", symbol: "bag")
            navButton(.account, title: "Кабинет", symbol: "person.crop.circle")
        }
        .padding(.top, 8)
        .padding(.bottom, 20)
        .background(Color(red: 0.102, green: 0.086, blue: 0.067))
        .overlay(alignment: .top) { Rectangle().fill(ClientTheme.line).frame(height: 1) }
    }

    private func navButton(_ tab: ClientTab, title: String, symbol: String) -> some View {
        Button { onSelect(tab) } label: {
            ZStack(alignment: .topTrailing) {
                VStack(spacing: 3) {
                    Image(systemName: selected == tab ? "\(symbol).fill" : symbol)
                        .font(.system(size: 19, weight: .medium))
                    Text(title).font(ClientTheme.body(10, weight: selected == tab ? .bold : .medium))
                }
                .foregroundStyle(selected == tab ? ClientTheme.lime : ClientTheme.muted)
                .frame(maxWidth: .infinity)
                if tab == .cart, cartCount > 0 {
                    Text("\(cartCount)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(ClientTheme.coral, in: Capsule())
                        .offset(x: -18, y: -2)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

private struct ClientLoginView: View {
    @Bindable var auth: CustomerAuthStore
    let onGuest: () -> Void
    @State private var phone = "+996 "
    @State private var code = ""
    @State private var requested = false

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("A")
                        .font(ClientTheme.display(34, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: 60, height: 60)
                        .background(ClientTheme.coral, in: RoundedRectangle(cornerRadius: 17))
                        .padding(.bottom, 24)
                    Text("Вход в AliStore")
                        .font(ClientTheme.display(30, weight: .black))
                        .foregroundStyle(.white)
                    Text("Техника с гарантией и trade-in. Войдите по номеру — быстро и безопасно.")
                        .font(ClientTheme.body(14))
                        .foregroundStyle(ClientTheme.muted)
                        .lineSpacing(4)
                        .padding(.top, 10)
                    TextField("+996 700 12 34 56", text: $phone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .foregroundStyle(.white)
                        .font(.system(size: 15, design: .monospaced))
                        .padding(14)
                        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                        .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
                        .padding(.top, 26)
                        .accessibilityIdentifier("client-phone")
                    if requested {
                        TextField("6-значный код", text: $code)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .foregroundStyle(.white)
                            .padding(14)
                            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                            .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.lime))
                            .padding(.top, 10)
                            .accessibilityIdentifier("client-otp")
                        if let devCode = auth.devCode {
                            Text("Код для тестового контура: \(devCode)")
                                .font(ClientTheme.body(12))
                                .foregroundStyle(ClientTheme.muted)
                                .padding(.top, 8)
                        }
                    }
                    Button {
                        Task {
                            if requested {
                                await auth.verify(phone: normalizedPhone, code: code.filter(\.isNumber))
                            } else {
                                requested = await auth.requestOTP(phone: normalizedPhone)
                            }
                        }
                    } label: {
                        HStack { Spacer(); if auth.isLoading { ProgressView().tint(.black) } else { Text(requested ? "Войти" : "Получить код по SMS") }; Spacer() }
                            .font(ClientTheme.body(15, weight: .bold))
                            .foregroundStyle(.black)
                            .frame(height: 50)
                            .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                    }
                    .disabled(auth.isLoading || normalizedPhone.filter(\.isNumber).count < 9 || (requested && code.filter(\.isNumber).count != 6))
                    .padding(.top, 12)
                    .accessibilityIdentifier(requested ? "client-verify" : "client-request-otp")
                    HStack(spacing: 10) {
                        loginProvider("Apple", symbol: "applelogo")
                        loginProvider("Telegram", symbol: "paperplane.fill")
                    }
                    .padding(.top, 12)
                    Button("Продолжить как гость →", action: onGuest)
                        .font(ClientTheme.body(13))
                        .foregroundStyle(ClientTheme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 22)
                    if let error = auth.errorMessage {
                        Text(error).font(ClientTheme.body(12)).foregroundStyle(.red).padding(.top, 12)
                    }
                }
                .padding(.horizontal, 26)
                .frame(maxWidth: 402)
                .frame(minHeight: 700)
            }
        }
    }

    private func loginProvider(_ title: String, symbol: String) -> some View {
        Button {
        } label: {
            HStack(spacing: 8) {
                Image(systemName: symbol)
                Text(title)
            }
        }
            .font(ClientTheme.body(14, weight: .medium))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
            .accessibilityLabel("Войти через \(title)")
    }

    private var normalizedPhone: String {
        let digits = phone.filter(\.isNumber)
        return "+\(digits)"
    }
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
    @State private var guestMode: Bool
    @State private var orderRefreshRevision = 0
    @State private var pushStatus = "Push не настроен"
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase

    init(environment: AppEnvironment) {
        self.environment = environment
        _guestMode = State(initialValue: UITestBootstrap.startsAsGuest)
        _auth = State(initialValue: CustomerAuthStore(
            environment: environment,
            restoresStoredSession: !UITestBootstrap.disablesSessionRestore
        ))
    }

    var body: some View {
        Group {
            if auth.isRestoring {
                ZStack { ClientTheme.background.ignoresSafeArea(); ProgressView("Открываем AliStore").tint(ClientTheme.lime) }
            } else if auth.session == nil && !guestMode {
                ClientLoginView(auth: auth, onGuest: { guestMode = true })
            } else {
                VStack(spacing: 0) {
                    ClientStatusBar()
                    ClientHeader(onCompare: { selectedTab = .catalog }, onNotifications: { selectedTab = .account }, onSearch: { selectedTab = .catalog })
                    ZStack {
                        switch selectedTab {
                        case .home:
                            ClientHomeView(products: products, isLoading: catalogLoading, errorMessage: catalogError, cart: $cart, favorites: $favorites, openCatalog: { selectedTab = .catalog })
                        case .catalog:
                            CatalogView(products: products, isLoading: catalogLoading, errorMessage: catalogError, cart: $cart, favorites: $favorites)
                        case .favorites:
                            FavoritesView(products: products, cart: $cart, favorites: $favorites)
                        case .cart:
                            CartView(environment: environment, auth: auth, products: products, cart: $cart)
                        case .account:
                            AccountView(environment: environment, auth: auth, pushStatus: pushStatus, orderRefreshRevision: orderRefreshRevision, onEnablePush: enablePush, onLogout: { guestMode = false })
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .toolbar(.hidden, for: .navigationBar)
                    ClientBottomNav(selected: selectedTab, cartCount: cart.values.reduce(0, +), onSelect: { selectedTab = $0 })
                }
                .background(ClientTheme.background)
                .ignoresSafeArea(edges: [.top, .bottom])
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
        .overlay {
            if auth.requiresQuickUnlock, let session = auth.session {
                QuickUnlockView(title: "AliStore", username: session.phone, pinService: auth.quickUnlockService, onUnlocked: auth.unlock, onLogout: { Task { await auth.logout(); guestMode = false } })
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
    let onLogout: () -> Void
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
                        Button("Выйти", role: .destructive) {
                            Task {
                                await auth.logout()
                                onLogout()
                            }
                        }
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
                                    ProductDetail(product: product, cart: $cart, favorites: $favorites)
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
                            Image("client-product-iphone")
                                .resizable()
                                .scaledToFit()
                                .frame(width: 150, height: 150)
                                .rotationEffect(.degrees(-8))
                                .opacity(0.82)
                                .padding(.trailing, 8)
                                .padding(.bottom, 8)
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
                    Text("🔥 Хиты продаж").font(ClientTheme.display(18, weight: .bold))
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
                ClientProductImage(product: product, cornerRadius: 12).frame(height: 120)
                Button { if favorites.contains(product.id) { favorites.remove(product.id) } else { favorites.insert(product.id) } } label: { Image(systemName: favorites.contains(product.id) ? "heart.fill" : "heart").foregroundStyle(favorites.contains(product.id) ? ClientTheme.coral : .white).frame(width: 44, height: 44) }
            }
            Text(product.name).font(ClientTheme.body(13, weight: .semibold)).foregroundStyle(.white).lineLimit(2).frame(minHeight: 38, alignment: .top)
            Text(product.price.formatted(.currency(code: "KGS"))).font(ClientTheme.display(16, weight: .black)).foregroundStyle(.white)
            Text(product.availableUnits > 0 ? (product.availableUnits < 5 ? "Осталось \(product.availableUnits) шт" : "В наличии") : "Нет в наличии")
                .font(ClientTheme.body(10)).foregroundStyle(product.availableUnits > 0 ? ClientTheme.muted : Color(red: 1, green: 0.541, blue: 0.478))
            Button { cart[product.id] = min(product.availableUnits, (cart[product.id] ?? 0) + 1) } label: { Text(product.availableUnits > 0 ? "В корзину" : "Уведомить").font(ClientTheme.body(12, weight: .bold)).frame(maxWidth: .infinity).frame(height: 38).background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(.black) }.disabled(product.availableUnits == 0)
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
    @Binding var favorites: Set<String>

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .topTrailing) {
                    ClientProductImage(product: product, cornerRadius: 0)
                        .frame(height: 260)
                    Button {
                        if favorites.contains(product.id) { favorites.remove(product.id) } else { favorites.insert(product.id) }
                    } label: {
                        Image(systemName: favorites.contains(product.id) ? "heart.fill" : "heart")
                            .foregroundStyle(favorites.contains(product.id) ? ClientTheme.coral : .white)
                            .frame(width: 44, height: 44)
                            .background(.black.opacity(0.5), in: Circle())
                    }
                    .padding(14)
                }
                VStack(alignment: .leading, spacing: 12) {
                    Text(product.availableUnits > 0 ? "В НАЛИЧИИ" : "НЕТ В НАЛИЧИИ")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(product.availableUnits > 0 ? ClientTheme.lime : ClientTheme.coral)
                    Text(product.name).font(ClientTheme.display(22, weight: .black)).foregroundStyle(.white)
                    Text(product.price.formatted(.currency(code: "KGS")))
                        .font(ClientTheme.display(26, weight: .black)).foregroundStyle(.white)
                    Text("или \(Int(product.price / 12).formatted(.number.grouping(.never))) сом × 12 мес")
                        .font(ClientTheme.body(13)).foregroundStyle(ClientTheme.lime)
                    HStack(spacing: 8) {
                        ForEach(["128 ГБ", "256 ГБ", "512 ГБ"], id: \.self) { value in
                            Text(value)
                                .font(ClientTheme.body(13, weight: .medium))
                                .foregroundStyle(value == "128 ГБ" ? ClientTheme.lime : ClientTheme.muted)
                                .padding(.horizontal, 14).padding(.vertical, 9)
                                .background(value == "128 ГБ" ? ClientTheme.lime.opacity(0.1) : ClientTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(value == "128 ГБ" ? ClientTheme.lime : ClientTheme.line))
                        }
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ProductTrustCell(symbol: "shield.checkered", text: "Гарантия 12 мес")
                        ProductTrustCell(symbol: "bolt.fill", text: "Доставка 1–2 ч")
                        ProductTrustCell(symbol: "building.2.fill", text: "Самовывоз сегодня")
                        ProductTrustCell(symbol: "arrow.uturn.left", text: "Возврат 14 дней")
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Наличие в магазинах").font(ClientTheme.body(13, weight: .semibold)).foregroundStyle(.white)
                        availabilityRow("AliStore Центр", value: product.availableUnits > 0 ? "● есть" : "● нет", color: product.availableUnits > 0 ? ClientTheme.lime : ClientTheme.coral)
                        availabilityRow("AliStore Ош", value: product.availableUnits > 1 ? "● есть" : "● 1 шт", color: product.availableUnits > 1 ? ClientTheme.lime : Color(red: 0.898, green: 0.698, blue: 0.235))
                    }
                    .padding(14).background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(ClientTheme.line))
                    Text("Характеристики").font(ClientTheme.display(15, weight: .bold)).foregroundStyle(.white).padding(.top, 8)
                    detailRow("SKU", value: product.sku)
                    detailRow("Категория", value: product.category)
                    detailRow("Доступно", value: "\(product.availableUnits) шт")
                    Text("Описание").font(ClientTheme.display(15, weight: .bold)).foregroundStyle(.white).padding(.top, 8)
                    Text("Оригинальная техника с гарантией AliStore. Проверьте наличие и оформите доставку или самовывоз в удобной точке.")
                        .font(ClientTheme.body(13)).foregroundStyle(ClientTheme.muted).lineSpacing(4)
                    Button {
                        cart[product.id] = min(product.availableUnits, (cart[product.id] ?? 0) + 1)
                    } label: {
                        Text(product.availableUnits > 0 ? "Добавить в корзину" : "Нет в наличии")
                            .font(ClientTheme.body(15, weight: .bold)).foregroundStyle(.black)
                            .frame(maxWidth: .infinity).frame(height: 50)
                            .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                    }
                    .disabled(product.availableUnits == 0)
                    .padding(.top, 6)
                }
                .padding(16)
            }
        }
        .background(ClientTheme.background)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func availabilityRow(_ title: String, value: String, color: Color) -> some View {
        HStack { Text(title).font(ClientTheme.body(12)).foregroundStyle(ClientTheme.muted); Spacer(); Text(value).font(ClientTheme.body(12, weight: .medium)).foregroundStyle(color) }
    }

    @ViewBuilder
    private func detailRow(_ title: String, value: String) -> some View {
        HStack { Text(title).font(ClientTheme.body(13)).foregroundStyle(ClientTheme.muted); Spacer(); Text(value).font(ClientTheme.body(13)).foregroundStyle(Color(red: 0.847, green: 0.812, blue: 0.776)) }
            .padding(.vertical, 8).overlay(alignment: .bottom) { Rectangle().fill(ClientTheme.surface).frame(height: 1) }
    }
}

private struct ProductTrustCell: View {
    let symbol: String
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol).foregroundStyle(ClientTheme.lime)
            Text(text).font(ClientTheme.body(12)).foregroundStyle(Color(red: 0.847, green: 0.812, blue: 0.776)).lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(minHeight: 54)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(ClientTheme.line))
    }
}

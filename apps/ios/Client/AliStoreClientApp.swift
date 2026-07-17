import AliStoreCore
import PhotosUI
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

private enum ClientOverlay: String, Identifiable {
    case search, compare, notifications

    var id: String { rawValue }
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
            Button(action: onSearch) {
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
            }
            .buttonStyle(.plain)
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

private struct ClientOverlayView: View {
    let screen: ClientOverlay
    let products: [Product]
    @Binding var cart: [String: Int]
    @Binding var favorites: Set<String>
    @Binding var compared: Set<String>
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var matchingProducts: [Product] {
        let value = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return products }
        return products.filter {
            $0.name.localizedCaseInsensitiveContains(value) ||
            $0.category.localizedCaseInsensitiveContains(value) ||
            $0.sku.localizedCaseInsensitiveContains(value)
        }
    }

    private var comparedProducts: [Product] {
        products.filter { compared.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ClientTheme.background.ignoresSafeArea()
                switch screen {
                case .search:
                    searchContent
                case .compare:
                    compareContent
                case .notifications:
                    notificationContent
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Закрыть", systemImage: "xmark") { dismiss() }
                        .accessibilityLabel("Закрыть")
                }
            }
        }
        .tint(ClientTheme.lime)
        .preferredColorScheme(.dark)
    }

    private var title: String {
        switch screen {
        case .search: "Поиск"
        case .compare: "Сравнение"
        case .notifications: "Уведомления"
        }
    }

    @ViewBuilder
    private var searchContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(ClientTheme.muted)
                    TextField("Техника, бренды, SKU", text: $query)
                        .textInputAutocapitalization(.never)
                        .foregroundStyle(.white)
                }
                .padding(14)
                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
                if products.isEmpty {
                    EmptyStateView(title: "Каталог недоступен", detail: "Проверьте соединение и повторите поиск.", symbol: "wifi.exclamationmark")
                } else if matchingProducts.isEmpty {
                    EmptyStateView(title: "Ничего не найдено", detail: "Измените запрос или попробуйте название бренда.", symbol: "magnifyingglass")
                } else {
                    LazyVStack(spacing: 10) {
                        ForEach(matchingProducts) { product in
                            NavigationLink {
                                ProductDetail(product: product, cart: $cart, favorites: $favorites)
                            } label: {
                                searchRow(product)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    @ViewBuilder
    private var compareContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("До 4 товаров")
                    .font(ClientTheme.body(12, weight: .semibold))
                    .foregroundStyle(ClientTheme.muted)
                if comparedProducts.isEmpty {
                    EmptyStateView(title: "Нет товаров для сравнения", detail: "Откройте поиск и добавьте технику к сравнению.", symbol: "arrow.left.arrow.right")
                } else {
                    ForEach(comparedProducts) { product in
                        compareRow(product, selected: true)
                    }
                }
                if !products.isEmpty {
                    Text("Добавить товар")
                        .font(ClientTheme.display(16, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.top, 8)
                    ForEach(products.filter { !compared.contains($0.id) }.prefix(8)) { product in
                        compareRow(product, selected: false)
                    }
                }
            }
            .padding(16)
        }
    }

    private var notificationContent: some View {
        ScrollView {
            VStack(spacing: 10) {
                ClientNotificationRow(symbol: "shield.fill", title: "Гарантия скоро истекает", detail: "Проверьте гарантию AirPods Pro", time: "вчера")
                ClientNotificationRow(symbol: "gift.fill", title: "Бонусы начислены", detail: "+300 бонусов за отзыв с фото", time: "2 дня назад")
                ClientNotificationRow(symbol: "shippingbox.fill", title: "Статус заказа обновлён", detail: "Заказ готовится к выдаче", time: "3 дня назад")
            }
            .padding(16)
        }
    }

    private func searchRow(_ product: Product) -> some View {
        HStack(spacing: 12) {
            ClientProductImage(product: product, cornerRadius: 11)
                .frame(width: 76, height: 76)
            VStack(alignment: .leading, spacing: 5) {
                Text(product.name).font(ClientTheme.body(14, weight: .semibold)).foregroundStyle(.white).lineLimit(2)
                Text(product.category).font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted)
                Text(product.price.formatted(.currency(code: "KGS"))).font(ClientTheme.display(14, weight: .bold)).foregroundStyle(.white)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(ClientTheme.muted)
        }
        .padding(10)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
    }

    private func compareRow(_ product: Product, selected: Bool) -> some View {
        HStack(spacing: 10) {
            ClientProductImage(product: product, cornerRadius: 9).frame(width: 58, height: 58)
            VStack(alignment: .leading, spacing: 4) {
                Text(product.name).font(ClientTheme.body(13, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                Text(product.price.formatted(.currency(code: "KGS"))).font(ClientTheme.body(12)).foregroundStyle(ClientTheme.muted)
            }
            Spacer()
            Button {
                if selected {
                    compared.remove(product.id)
                } else if compared.count < 4 {
                    compared.insert(product.id)
                }
            } label: {
                Image(systemName: selected ? "minus.circle.fill" : "plus.circle")
                    .font(.title3)
                    .foregroundStyle(selected ? ClientTheme.coral : ClientTheme.lime)
            }
            .accessibilityLabel(selected ? "Убрать из сравнения" : "Добавить к сравнению")
        }
        .padding(10)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
    }
}

private struct ClientNotificationRow: View {
    let symbol: String
    let title: String
    let detail: String
    let time: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .foregroundStyle(ClientTheme.lime)
                .frame(width: 36, height: 36)
                .background(ClientTheme.lime.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(ClientTheme.body(13, weight: .semibold)).foregroundStyle(.white)
                Text(detail).font(ClientTheme.body(12)).foregroundStyle(ClientTheme.muted)
            }
            Spacer()
            Text(time).font(ClientTheme.body(10)).foregroundStyle(ClientTheme.muted)
        }
        .padding(12)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
    }
}

private enum ClientLocalState {
    private static let cartKey = "alistore.client.cart.v1"
    private static let favoritesKey = "alistore.client.favorites.v1"
    private static let comparedKey = "alistore.client.compared.v1"

    static func cart() -> [String: Int] {
        guard let data = UserDefaults.standard.data(forKey: cartKey),
              let value = try? JSONDecoder().decode([String: Int].self, from: data) else {
            return [:]
        }
        return value
    }

    static func favorites() -> Set<String> {
        guard let data = UserDefaults.standard.data(forKey: favoritesKey),
              let value = try? JSONDecoder().decode([String].self, from: data) else {
            return []
        }
        return Set(value)
    }

    static func compared() -> Set<String> {
        guard let data = UserDefaults.standard.data(forKey: comparedKey),
              let value = try? JSONDecoder().decode([String].self, from: data) else {
            return []
        }
        return Set(value)
    }

    static func save(cart: [String: Int], favorites: Set<String>, compared: Set<String>) {
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(cart) {
            UserDefaults.standard.set(data, forKey: cartKey)
        }
        if let data = try? encoder.encode(Array(favorites).sorted()) {
            UserDefaults.standard.set(data, forKey: favoritesKey)
        }
        if let data = try? encoder.encode(Array(compared).sorted()) {
            UserDefaults.standard.set(data, forKey: comparedKey)
        }
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
    @State private var overlay: ClientOverlay?
    @State private var compared: Set<String> = []
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
                    ClientHeader(onCompare: { overlay = .compare }, onNotifications: { overlay = .notifications }, onSearch: { overlay = .search })
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
        .fullScreenCover(item: $overlay) { screen in
            ClientOverlayView(screen: screen, products: products, cart: $cart, favorites: $favorites, compared: $compared)
        }
        .task {
            restoreLocalState()
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
        .onChange(of: cart) { _, _ in saveLocalState() }
        .onChange(of: favorites) { _, _ in saveLocalState() }
        .onChange(of: compared) { _, _ in saveLocalState() }
        .onReceive(NotificationCenter.default.publisher(for: .alistoreAPNsToken)) { notification in
            guard let token = notification.object as? String else { return }
            Task { await registerPushToken(token) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .alistoreAPNsFailure)) { notification in
            pushStatus = notification.object as? String ?? "APNs registration failed"
        }
    }

    private func restoreLocalState() {
        guard !UITestBootstrap.startsAtCheckout else { return }
        cart = ClientLocalState.cart()
        favorites = ClientLocalState.favorites()
        compared = ClientLocalState.compared()
    }

    private func saveLocalState() {
        guard !UITestBootstrap.startsAtCheckout else { return }
        ClientLocalState.save(cart: cart, favorites: favorites, compared: compared)
    }

    private func loadCatalog() async {
        catalogLoading = true
        defer { catalogLoading = false }
        do {
            let response: CatalogResponse = try await APIClient(baseURL: environment.apiBaseURL).get("catalog/products?limit=100")
            products = response.items
            if UITestBootstrap.startsAtCheckout, let product = response.items.first {
                cart[product.id] = 1
            }
            catalogError = nil
        } catch {
            if UITestBootstrap.startsAtCheckout {
                let fixture = Product(id: "ui-product", sku: "UI-IPHONE", name: "iPhone 17 Pro Max", price: 115_000, category: "Смартфоны", availableUnits: 3)
                products = [fixture]
                cart[fixture.id] = 1
            }
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

private enum ClientCheckoutStep: Int, CaseIterable, Identifiable {
    case delivery
    case address
    case payment
    case review

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .delivery: "Получение"
        case .address: "Адрес"
        case .payment: "Оплата"
        case .review: "Проверка"
        }
    }
}

private struct ClientChoiceRow: View {
    let symbol: String
    let title: String
    let detail: String
    let trailing: String?
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(selected ? .black : ClientTheme.lime)
                    .frame(width: 40, height: 40)
                    .background(selected ? ClientTheme.lime : ClientTheme.background, in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(ClientTheme.body(14, weight: .semibold))
                        .foregroundStyle(.white)
                    Text(detail)
                        .font(ClientTheme.body(12))
                        .foregroundStyle(ClientTheme.muted)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                if let trailing {
                    Text(trailing)
                        .font(ClientTheme.body(12, weight: .medium))
                        .foregroundStyle(selected ? ClientTheme.lime : ClientTheme.muted)
                }
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? ClientTheme.lime : ClientTheme.muted)
            }
            .padding(14)
            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(selected ? ClientTheme.lime : ClientTheme.line))
        }
        .buttonStyle(.plain)
    }
}

private struct ClientCheckoutSteps: View {
    let current: ClientCheckoutStep

    var body: some View {
        HStack(spacing: 6) {
            ForEach(ClientCheckoutStep.allCases) { step in
                Capsule()
                    .fill(step.rawValue <= current.rawValue ? ClientTheme.lime : ClientTheme.line)
                    .frame(height: 4)
                    .accessibilityLabel(step.title)
            }
        }
    }
}

private struct ClientSummaryRow: View {
    let title: String
    let value: String
    let emphasized: Bool

    var body: some View {
        HStack {
            Text(title)
                .font(ClientTheme.body(emphasized ? 15 : 13, weight: emphasized ? .bold : .regular))
                .foregroundStyle(emphasized ? .white : ClientTheme.muted)
            Spacer()
            Text(value)
                .font(ClientTheme.display(emphasized ? 19 : 13, weight: emphasized ? .black : .medium))
                .foregroundStyle(emphasized ? ClientTheme.lime : Color(red: 0.847, green: 0.812, blue: 0.776))
        }
    }
}

private struct ClientReadOnlyField: View {
    let title: String
    let value: String
    let monospaced: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(ClientTheme.body(11, weight: .medium))
                .foregroundStyle(ClientTheme.muted)
            Text(value)
                .font(monospaced ? .system(size: 14, design: .monospaced) : ClientTheme.body(14))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(13)
                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(ClientTheme.line))
        }
    }
}

private struct ClientInputField: View {
    let title: String
    @Binding var text: String
    let placeholder: String
    let monospaced: Bool

    init(title: String, text: Binding<String>, placeholder: String = "", monospaced: Bool = false) {
        self.title = title
        _text = text
        self.placeholder = placeholder
        self.monospaced = monospaced
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(ClientTheme.body(11, weight: .medium))
                .foregroundStyle(ClientTheme.muted)
            TextField(placeholder, text: $text)
                .font(monospaced ? .system(size: 14, design: .monospaced) : ClientTheme.body(14))
                .foregroundStyle(.white)
                .textInputAutocapitalization(.never)
                .padding(13)
                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(ClientTheme.line))
        }
    }
}

private struct ClientCallout: View {
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol).foregroundStyle(ClientTheme.lime)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(ClientTheme.body(13, weight: .semibold)).foregroundStyle(.white)
                Text(detail).font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted).lineSpacing(2)
            }
            Spacer(minLength: 0)
        }
        .padding(13)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(ClientTheme.line))
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
    @State private var checkoutStep: ClientCheckoutStep = .delivery
    @State private var showingOrderStatus = false

    private var lines: [(Product, Int)] {
        cart.compactMap { id, quantity in products.first(where: { $0.id == id }).map { ($0, quantity) } }
    }
    private var total: Int { lines.reduce(0) { $0 + $1.0.price * $1.1 } }

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    if queuedOffline {
                        offlineState
                    } else if let order = completedOrder {
                        ClientPaymentResultView(order: order, paymentIntent: paymentIntent, paymentURL: paymentIntent.flatMap(paymentURL), onTrack: { showingOrderStatus = true }, onReset: resetCheckout)
                    } else if lines.isEmpty {
                        EmptyStateView(title: "Корзина пуста", detail: "Добавьте товары из каталога.", symbol: "bag")
                    } else {
                        if checkoutStep == .review {
                            reviewStep
                        } else {
                            stepContent
                        }
                        footer
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 22)
            }
            .scrollIndicators(.hidden)
        }
        .task { await loadStorePoints() }
        .sheet(isPresented: $showingOrderStatus) {
            if let order = completedOrder {
                ClientOrderStatusView(order: order, environment: environment, auth: auth)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(completedOrder == nil ? "Оформление" : "Готово")
                    .font(ClientTheme.display(20, weight: .bold))
                    .foregroundStyle(.white)
                Spacer()
                if completedOrder == nil && !lines.isEmpty {
                    Text("\(lines.count) поз.")
                        .font(ClientTheme.body(12, weight: .medium))
                        .foregroundStyle(ClientTheme.muted)
                }
            }
            if completedOrder == nil && !lines.isEmpty {
                ClientCheckoutSteps(current: checkoutStep)
                HStack {
                    ForEach(ClientCheckoutStep.allCases) { step in
                        Text(step.title)
                            .font(ClientTheme.body(10, weight: step == checkoutStep ? .bold : .regular))
                            .foregroundStyle(step == checkoutStep ? ClientTheme.lime : ClientTheme.muted)
                            .frame(maxWidth: .infinity, alignment: step == .delivery ? .leading : step == .review ? .trailing : .center)
                    }
                }
            }
        }
    }

    private var stepContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch checkoutStep {
            case .delivery:
                Text("Способ получения").font(ClientTheme.display(16, weight: .bold)).foregroundStyle(.white)
                ClientChoiceRow(symbol: "building.2.fill", title: "Самовывоз", detail: "Заберите сегодня из магазина", trailing: "бесплатно", selected: fulfillment == "pickup") { fulfillment = "pickup" }
                ClientChoiceRow(symbol: "bolt.fill", title: "Курьер", detail: "Доставка по Бишкеку за 1–2 часа", trailing: "от 200 сом", selected: fulfillment == "courier") { fulfillment = "courier" }
            case .address:
                Text("Контакты и адрес").font(ClientTheme.display(16, weight: .bold)).foregroundStyle(.white)
                ClientReadOnlyField(title: "Телефон", value: auth.session?.phone ?? "Войдите в аккаунт", monospaced: true)
                if fulfillment == "courier" {
                    ClientInputField(title: "Адрес доставки", text: $address, placeholder: "г. Бишкек, улица, дом")
                } else if pickupPoints.isEmpty {
                    ClientCallout(symbol: "building.2", title: pointError ?? "Точки самовывоза загружаются", detail: "Выберите способ получения после загрузки данных.")
                } else {
                    ForEach(pickupPoints) { point in
                        ClientChoiceRow(symbol: "mappin", title: point.name, detail: point.address, trailing: point.hours, selected: selectedStorePointId == point.id) { selectedStorePointId = point.id }
                    }
                }
            case .payment:
                Text("Оплата").font(ClientTheme.display(16, weight: .bold)).foregroundStyle(.white)
                ClientChoiceRow(symbol: "banknote", title: "При получении", detail: "Наличными или картой в точке", trailing: nil, selected: paymentMethod == "cash") { paymentMethod = "cash" }
                ClientChoiceRow(symbol: "creditcard.fill", title: "Банковская карта", detail: "Защищённый платёж через провайдера", trailing: nil, selected: paymentMethod == OnlinePaymentMethod.card.rawValue) { paymentMethod = OnlinePaymentMethod.card.rawValue }
                ClientChoiceRow(symbol: "qrcode", title: "MBank QR", detail: "Оплата в приложении MBank", trailing: nil, selected: paymentMethod == OnlinePaymentMethod.qrMBank.rawValue) { paymentMethod = OnlinePaymentMethod.qrMBank.rawValue }
                ClientChoiceRow(symbol: "qrcode", title: "O!Деньги QR", detail: "Оплата в приложении O!Деньги", trailing: nil, selected: paymentMethod == OnlinePaymentMethod.qrODengi.rawValue) { paymentMethod = OnlinePaymentMethod.qrODengi.rawValue }
                ClientChoiceRow(symbol: "calendar", title: "Рассрочка", detail: "Условия зависят от банка-партнёра", trailing: nil, selected: paymentMethod == OnlinePaymentMethod.installment.rawValue) { paymentMethod = OnlinePaymentMethod.installment.rawValue }
            case .review:
                reviewStep
            }
        }
    }

    private var reviewStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Подтверждение").font(ClientTheme.display(16, weight: .bold)).foregroundStyle(.white)
            VStack(alignment: .leading, spacing: 10) {
                ForEach(lines, id: \.0.id) { product, quantity in
                    HStack(spacing: 10) {
                        ClientProductImage(product: product, cornerRadius: 10).frame(width: 54, height: 54)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(product.name).font(ClientTheme.body(13, weight: .semibold)).foregroundStyle(.white).lineLimit(2)
                            Text("\(quantity) × \(product.price.formatted(.currency(code: "KGS")))").font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted)
                        }
                        Spacer()
                    }
                }
                Divider().overlay(ClientTheme.line)
                ClientSummaryRow(title: "Получение", value: fulfillment == "pickup" ? (pickupPoints.first(where: { $0.id == selectedStorePointId })?.name ?? "Самовывоз") : "Курьер", emphasized: false)
                ClientSummaryRow(title: "Оплата", value: paymentLabel, emphasized: false)
                ClientSummaryRow(title: "Товаров", value: "\(cart.values.reduce(0, +))", emphasized: false)
                Divider().overlay(ClientTheme.line)
                ClientSummaryRow(title: "К оплате", value: total.formatted(.currency(code: "KGS")), emphasized: true)
            }
            .padding(16)
            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
            Text("Нажимая «Подтвердить заказ», вы соглашаетесь с условиями продажи и политикой возврата AliStore.")
                .font(ClientTheme.body(11))
                .foregroundStyle(ClientTheme.muted)
                .lineSpacing(3)
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 10) {
            if auth.session == nil {
                ClientCallout(symbol: "person.badge.key", title: "Войдите, чтобы оформить заказ", detail: "Откройте Кабинет и войдите по SMS-коду.")
            }
            if let errorMessage {
                Text(errorMessage).font(ClientTheme.body(12)).foregroundStyle(Color(red: 1, green: 0.54, blue: 0.48))
            }
            Button {
                if checkoutStep == .review {
                    Task { await checkout() }
                } else if let next = ClientCheckoutStep(rawValue: checkoutStep.rawValue + 1) {
                    checkoutStep = next
                }
            } label: {
                HStack {
                    Spacer()
                    if isSubmitting { ProgressView().tint(.black) } else { Text(checkoutStep == .review ? "Подтвердить заказ" : checkoutStep == .payment ? "К подтверждению" : "Далее") }
                    Spacer()
                }
                .font(ClientTheme.body(15, weight: .bold))
                .foregroundStyle(canAdvance ? .black : Color(red: 0.431, green: 0.392, blue: 0.361))
                .frame(height: 50)
                .background(canAdvance ? ClientTheme.lime : ClientTheme.line, in: RoundedRectangle(cornerRadius: 13))
            }
            .disabled(!canAdvance || isSubmitting)
            if checkoutStep != .delivery {
                Button("Назад") { checkoutStep = ClientCheckoutStep(rawValue: checkoutStep.rawValue - 1) ?? .delivery }
                    .font(ClientTheme.body(13, weight: .medium))
                    .foregroundStyle(ClientTheme.muted)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var offlineState: some View {
        VStack(spacing: 14) {
            Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 38)).foregroundStyle(ClientTheme.lime)
            Text("Заказ сохранён офлайн").font(ClientTheme.display(20, weight: .bold)).foregroundStyle(.white)
            Text("Он отправится автоматически после восстановления связи. Повторить отправку можно в Кабинет → Синхронизация.")
                .font(ClientTheme.body(13)).foregroundStyle(ClientTheme.muted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 300)
    }

    private var canAdvance: Bool {
        guard auth.session != nil else { return false }
        switch checkoutStep {
        case .delivery: return fulfillment == "pickup" || fulfillment == "courier"
        case .address: return fulfillment == "pickup" ? !selectedStorePointId.isEmpty : !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .payment: return !paymentMethod.isEmpty
        case .review: return !lines.isEmpty
        }
    }

    private var paymentLabel: String {
        switch paymentMethod {
        case "cash": "При получении"
        case OnlinePaymentMethod.card.rawValue: "Банковская карта"
        case OnlinePaymentMethod.qrMBank.rawValue: "MBank QR"
        case OnlinePaymentMethod.qrODengi.rawValue: "O!Деньги QR"
        case OnlinePaymentMethod.installment.rawValue: "Рассрочка"
        default: paymentMethod
        }
    }

    private func resetCheckout() {
        completedOrder = nil
        paymentIntent = nil
        queuedOffline = false
        checkoutStep = .delivery
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

private struct ClientPaymentResultView: View {
    let order: CustomerOrder
    let paymentIntent: PaymentIntent?
    let paymentURL: URL?
    let onTrack: () -> Void
    let onReset: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: paymentIntent == nil ? "checkmark" : "creditcard")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(.black)
                .frame(width: 80, height: 80)
                .background(paymentIntent == nil ? ClientTheme.lime : Color(red: 0.898, green: 0.698, blue: 0.235), in: Circle())
            Text(paymentIntent == nil ? "Заказ оформлен" : "Ожидает оплаты")
                .font(ClientTheme.display(24, weight: .black))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
            Text("Заказ #\(order.id.suffix(6)) · \(order.total.formatted(.currency(code: "KGS")))")
                .font(ClientTheme.body(14))
                .foregroundStyle(ClientTheme.muted)
            Text(paymentIntent == nil ? "Мы передали заказ в обработку. Актуальный статус будет обновляться в Кабинете." : "Завершите оплату на защищённой странице провайдера. Статус подтвердит только серверный webhook.")
                .font(ClientTheme.body(13))
                .foregroundStyle(ClientTheme.muted)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
                .padding(.horizontal, 10)
            if let paymentURL {
                Link("Перейти к оплате", destination: paymentURL)
                    .font(ClientTheme.body(15, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
            }
            Button("Отследить заказ", action: onTrack)
                .font(ClientTheme.body(15, weight: .bold))
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
            Button("Вернуться в каталог", action: onReset)
                .font(ClientTheme.body(13, weight: .medium))
                .foregroundStyle(ClientTheme.muted)
                .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 440)
    }
}

private struct ClientOrderStatusView: View {
    let order: CustomerOrder
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    @Environment(\.dismiss) private var dismiss

    private let steps = [
        ("Заказ создан", "checkmark.circle"),
        ("Оплата подтверждена", "creditcard"),
        ("Собираем заказ", "shippingbox"),
        ("Готов к выдаче или в пути", "truck.box"),
        ("Получен", "house")
    ]

    private var currentIndex: Int {
        let value = order.status.lowercased()
        if value.contains("deliver") || value.contains("complete") || value.contains("получ") { return 4 }
        if value.contains("out_for") || value.contains("ready") || value.contains("pickup") || value.contains("courier") { return 3 }
        if value.contains("process") || value.contains("pack") || value.contains("reserv") { return 2 }
        if value.contains("paid") || value.contains("confirm") { return 1 }
        return 0
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Заказ #\(order.id.suffix(6))")
                            .font(ClientTheme.display(20, weight: .bold))
                            .foregroundStyle(.white)
                        Text("\(order.createdAt.formatted(date: .abbreviated, time: .shortened)) · \(order.total.formatted(.currency(code: "KGS")))")
                            .font(ClientTheme.body(12))
                            .foregroundStyle(ClientTheme.muted)
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                            HStack(alignment: .top, spacing: 12) {
                                VStack(spacing: 0) {
                                    Image(systemName: index <= currentIndex ? "checkmark" : step.1)
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(index <= currentIndex ? .black : ClientTheme.muted)
                                        .frame(width: 26, height: 26)
                                        .background(index <= currentIndex ? ClientTheme.lime : ClientTheme.background, in: Circle())
                                    if index < steps.count - 1 {
                                        Rectangle().fill(ClientTheme.line).frame(width: 2, height: 28)
                                    }
                                }
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(step.0)
                                        .font(ClientTheme.body(14, weight: index == currentIndex ? .bold : .medium))
                                        .foregroundStyle(index <= currentIndex ? .white : ClientTheme.muted)
                                    if index == currentIndex {
                                        Text("Текущий статус: \(order.status)")
                                            .font(ClientTheme.body(11))
                                            .foregroundStyle(ClientTheme.muted)
                                    }
                                }
                                .padding(.top, 3)
                                Spacer()
                            }
                        }
                    }
                    .padding(18)
                    .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(ClientTheme.line))
                    HStack(spacing: 8) {
                        NavigationLink {
                            ClientReceiptView(environment: environment, auth: auth, order: order)
                        } label: {
                            ClientStatusAction(symbol: "doc.text", title: "Чек")
                        }
                        .buttonStyle(.plain)
                        NavigationLink {
                            DevicesView(environment: environment, auth: auth)
                        } label: {
                            ClientStatusAction(symbol: "shield.checkered", title: "Гарантия")
                        }
                        .buttonStyle(.plain)
                    }
                    Text("Статус заказа и оплаты обновляется сервером. Повторное нажатие не создаёт новый заказ.")
                        .font(ClientTheme.body(11))
                        .foregroundStyle(ClientTheme.muted)
                        .lineSpacing(3)
                }
                .padding(16)
            }
            .background(ClientTheme.background)
            .navigationTitle("Статус заказа")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Закрыть") { dismiss() }
                }
            }
        }
        .tint(ClientTheme.lime)
        .preferredColorScheme(.dark)
    }
}

private struct ClientReceiptView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let order: CustomerOrder
    @State private var receipt: CustomerOrderReceipt?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Электронный чек")
                        .font(ClientTheme.display(24, weight: .black))
                        .foregroundStyle(.white)
                    Text("Заказ #\(order.id.suffix(6))")
                        .font(ClientTheme.body(13, weight: .medium))
                        .foregroundStyle(ClientTheme.muted)
                    if isLoading {
                        ProgressView("Запрашиваем чек")
                            .tint(ClientTheme.lime)
                            .frame(maxWidth: .infinity, minHeight: 260)
                    } else if let errorMessage {
                        ClientCallout(symbol: "doc.text.magnifyingglass", title: "Чек пока недоступен", detail: errorMessage)
                    } else if let receipt {
                        Text(receipt.markup)
                            .font(.system(size: 13, weight: .regular, design: .monospaced))
                            .foregroundStyle(Color(red: 0.847, green: 0.812, blue: 0.776))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(18)
                            .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
                    }
                }
                .padding(16)
            }
        }
        .navigationTitle("Чек")
        .navigationBarTitleDisplayMode(.inline)
        .tint(ClientTheme.lime)
        .preferredColorScheme(.dark)
        .task { await load() }
    }

    private func load() async {
        guard let token = auth.session?.accessToken else {
            errorMessage = "Войдите в аккаунт, чтобы открыть чек."
            isLoading = false
            return
        }
        do {
            receipt = try await APIClient(baseURL: environment.apiBaseURL).get(
                "orders/\(order.id)/receipt",
                token: token
            )
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

private struct ClientStatusAction: View {
    let symbol: String
    let title: String

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: symbol)
            Text(title).font(ClientTheme.body(13, weight: .medium))
        }
        .foregroundStyle(Color(red: 0.847, green: 0.812, blue: 0.776))
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 11))
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(ClientTheme.line))
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
            ZStack {
                ClientTheme.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Мои заказы")
                                .font(ClientTheme.display(24, weight: .black))
                                .foregroundStyle(.white)
                            Text("Статусы, выдача и доставка")
                                .font(ClientTheme.body(13))
                                .foregroundStyle(ClientTheme.muted)
                        }
                        if auth.isRestoring || isLoading {
                            ProgressView("Загружаем заказы")
                                .tint(ClientTheme.lime)
                                .frame(maxWidth: .infinity, minHeight: 260)
                        } else if auth.session == nil {
                            EmptyStateView(title: "Войдите в аккаунт", detail: "История заказов доступна после входа по SMS-коду.", symbol: "person.badge.key")
                        } else if let errorMessage {
                            ClientCallout(symbol: "wifi.exclamationmark", title: "Заказы недоступны", detail: errorMessage)
                        } else if orders.isEmpty {
                            EmptyStateView(title: "Заказов пока нет", detail: "Здесь появятся покупки из магазина и приложения.", symbol: "shippingbox")
                        } else {
                            ForEach(orders) { order in
                                NavigationLink {
                                    ClientOrderStatusView(order: order, environment: environment, auth: auth)
                                } label: {
                                    ClientOrderCard(order: order)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Мои заказы")
            .navigationBarTitleDisplayMode(.inline)
            .task(id: "\(auth.session?.accessToken ?? "guest")-\(refreshRevision)") { await load() }
            .refreshable { await load() }
        }
        .tint(ClientTheme.lime)
        .preferredColorScheme(.dark)
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

private struct ClientOrderCard: View {
    let order: CustomerOrder

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Заказ #\(order.id.suffix(6))")
                        .font(ClientTheme.body(15, weight: .bold))
                        .foregroundStyle(.white)
                    Text(order.createdAt, format: .dateTime.day().month().year())
                        .font(ClientTheme.body(11))
                        .foregroundStyle(ClientTheme.muted)
                }
                Spacer()
                Text(order.status)
                    .font(ClientTheme.body(11, weight: .semibold))
                    .foregroundStyle(statusColor)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(statusColor.opacity(0.14), in: Capsule())
            }
            HStack {
                Label("\(order.items.reduce(0) { $0 + $1.qty }) тов.", systemImage: "shippingbox")
                Spacer()
                Text(order.total.formatted(.currency(code: "KGS")))
                    .font(ClientTheme.display(15, weight: .bold))
                    .foregroundStyle(ClientTheme.lime)
            }
            .font(ClientTheme.body(12, weight: .medium))
            .foregroundStyle(ClientTheme.muted)
            HStack {
                Text(order.fulfillmentType == "courier" ? "Курьерская доставка" : "Самовывоз")
                Spacer()
                Image(systemName: "chevron.right")
            }
            .font(ClientTheme.body(12, weight: .medium))
            .foregroundStyle(ClientTheme.muted)
        }
        .padding(15)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(ClientTheme.line))
    }

    private var statusColor: Color {
        let value = order.status.lowercased()
        if value.contains("cancel") || value.contains("reject") || value.contains("fail") { return ClientTheme.coral }
        if value.contains("complete") || value.contains("deliver") || value.contains("ready") { return ClientTheme.lime }
        return Color(red: 0.898, green: 0.698, blue: 0.235)
    }
}

private struct CustomerReturnsView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    @State private var returns: [CustomerReturn] = []
    @State private var orders: [CustomerOrder] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showingRequest = false

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            if isLoading {
                ProgressView("Загружаем возвраты").tint(ClientTheme.lime)
            } else if let errorMessage {
                ClientDataErrorView(message: errorMessage, retry: { Task { await load() } })
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if returns.isEmpty {
                            EmptyStateView(title: "Возвратов пока нет", detail: "Заявку можно оформить по завершённому заказу.", symbol: "arrow.uturn.backward.circle")
                        } else {
                            ForEach(returns) { item in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        Text("Возврат #\(item.id.suffix(6))")
                                            .font(ClientTheme.body(14, weight: .semibold)).foregroundStyle(.white)
                                        Spacer()
                                        Text(statusLabel(item.status))
                                            .font(ClientTheme.body(11, weight: .semibold))
                                            .foregroundStyle(statusColor(item.status))
                                    }
                                    Text(item.reason)
                                        .font(ClientTheme.body(12)).foregroundStyle(ClientTheme.muted).lineLimit(2)
                                    HStack {
                                        Text(item.isFullOrder ? "Весь заказ" : "Частичный возврат")
                                        Spacer()
                                        Text(item.refundAmount.formatted(.currency(code: "KGS")))
                                            .font(ClientTheme.body(13, weight: .bold)).foregroundStyle(.white)
                                    }
                                    .font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted)
                                    Text(item.createdAt, format: .dateTime.day().month().year())
                                        .font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted)
                                }
                                .padding(13)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
                            }
                        }

                        Button { showingRequest = true } label: {
                            Label("Оформить возврат", systemImage: "arrow.uturn.backward")
                                .font(ClientTheme.body(14, weight: .bold))
                                .foregroundStyle(.black)
                                .frame(maxWidth: .infinity, minHeight: 46)
                                .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                        }
                        .buttonStyle(.plain)
                        .disabled(orders.isEmpty)
                        if orders.isEmpty {
                            Text("Нет заказов для оформления возврата")
                                .font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted)
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle("Возвраты")
        .navigationBarTitleDisplayMode(.inline)
        .tint(ClientTheme.lime)
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showingRequest) {
            NavigationStack {
                CustomerReturnRequestView(environment: environment, auth: auth, orders: orders) {
                    showingRequest = false
                    Task { await load() }
                }
            }
            .preferredColorScheme(.dark)
        }
    }

    @MainActor
    private func load() async {
        guard let token = auth.session?.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            async let loadedReturns: [CustomerReturn] = APIClient(baseURL: environment.apiBaseURL).get("returns/mine", token: token)
            async let loadedOrders: [CustomerOrder] = APIClient(baseURL: environment.apiBaseURL).get("orders/mine", token: token)
            returns = try await loadedReturns
            orders = try await loadedOrders
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func statusLabel(_ status: String) -> String {
        ["requested": "Заявка создана", "under_review": "На проверке", "approved": "Одобрено", "rejected": "Отклонено", "processing": "Обрабатывается", "paid": "Возврат выполнен", "reconciled": "Сверено"][status] ?? status
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "rejected": return ClientTheme.coral
        case "paid", "reconciled", "approved": return ClientTheme.lime
        default: return .orange
        }
    }
}

private struct CustomerReturnRequestView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let orders: [CustomerOrder]
    let onCreated: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var orderId: String
    @State private var reason = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    init(environment: AppEnvironment, auth: CustomerAuthStore, orders: [CustomerOrder], onCreated: @escaping () -> Void) {
        self.environment = environment
        self.auth = auth
        self.orders = orders
        self.onCreated = onCreated
        _orderId = State(initialValue: orders.first?.id ?? "")
    }

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Новая заявка")
                        .font(ClientTheme.display(24, weight: .black)).foregroundStyle(.white)
                    Text("Сервер проверит доступность возврата и рассчитает сумму. Оплата не считается выполненной до отдельного refund-процесса.")
                        .font(ClientTheme.body(12)).foregroundStyle(ClientTheme.muted).lineSpacing(3)
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Заказ").font(ClientTheme.body(12, weight: .semibold)).foregroundStyle(ClientTheme.muted)
                        Picker("Заказ", selection: $orderId) {
                            ForEach(orders) { order in
                                Text("#\(order.id.suffix(6)) · \(order.total.formatted(.currency(code: "KGS")))")
                                    .tag(order.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(ClientTheme.lime)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                    }
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Причина").font(ClientTheme.body(12, weight: .semibold)).foregroundStyle(ClientTheme.muted)
                        TextField("Опишите причину возврата", text: $reason, axis: .vertical)
                            .lineLimit(3...7)
                            .foregroundStyle(.white).padding(13)
                            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                            .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
                    }
                    if let errorMessage { Text(errorMessage).font(ClientTheme.body(12)).foregroundStyle(.red) }
                    Button { Task { await submit() } } label: {
                        HStack { Spacer(); if isSubmitting { ProgressView().tint(.black) } else { Text("Отправить заявку") }; Spacer() }
                            .font(ClientTheme.body(15, weight: .bold)).foregroundStyle(.black).frame(height: 50)
                            .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                    }
                    .buttonStyle(.plain)
                    .disabled(isSubmitting || orderId.isEmpty || reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(18)
            }
        }
        .navigationTitle("Оформить возврат")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Отмена") { dismiss() } } }
        .tint(ClientTheme.lime)
    }

    @MainActor
    private func submit() async {
        guard let token = auth.session?.accessToken else { return }
        let cleanReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let _: CustomerReturn = try await APIClient(baseURL: environment.apiBaseURL).post(
                "returns/mine",
                body: CreateCustomerReturnRequest(orderId: orderId, reason: cleanReason),
                token: token,
                idempotencyKey: UUID().uuidString
            )
            onCreated()
            dismiss()
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct CustomerTradeInsView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    @State private var tradeIns: [CustomerTradeIn] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showingForm = false

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            if isLoading {
                ProgressView("Загружаем trade-in").tint(ClientTheme.lime)
            } else if let errorMessage {
                ClientDataErrorView(message: errorMessage, retry: { Task { await load() } })
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Trade-in")
                            .font(ClientTheme.display(26, weight: .black))
                            .foregroundStyle(.white)
                        Text("Оценка старого устройства и защищённый договор в одном кабинете. Сумма остаётся предварительной до диагностики сотрудником.")
                            .font(ClientTheme.body(12))
                            .foregroundStyle(ClientTheme.muted)
                            .lineSpacing(3)

                        if tradeIns.isEmpty {
                            EmptyStateView(
                                title: "Заявок пока нет",
                                detail: "Оформите trade-in, чтобы сохранить оценку и номер договора.",
                                symbol: "arrow.triangle.2.circlepath"
                            )
                        } else {
                            ForEach(tradeIns) { tradeIn in
                                CustomerTradeInCard(tradeIn: tradeIn, environment: environment, auth: auth)
                            }
                        }

                        Button { showingForm = true } label: {
                            Label("Оценить устройство", systemImage: "plus")
                                .font(ClientTheme.body(14, weight: .bold))
                                .foregroundStyle(.black)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle("Trade-in")
        .navigationBarTitleDisplayMode(.inline)
        .tint(ClientTheme.lime)
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showingForm) {
            NavigationStack {
                CustomerTradeInFormView(environment: environment, auth: auth) {
                    showingForm = false
                    Task { await load() }
                }
            }
            .preferredColorScheme(.dark)
        }
    }

    @MainActor
    private func load() async {
        guard let token = auth.session?.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            tradeIns = try await APIClient(baseURL: environment.apiBaseURL).get("tradeins/mine", token: token)
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct CustomerTradeInCard: View {
    let tradeIn: CustomerTradeIn
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var isUploadingEvidence = false
    @State private var evidenceMessage: String?
    @State private var evidenceIdempotencyKey = UUID().uuidString

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .foregroundStyle(ClientTheme.lime)
                    .frame(width: 38, height: 38)
                    .background(ClientTheme.lime.opacity(0.12), in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 3) {
                    Text(tradeIn.model)
                        .font(ClientTheme.body(14, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    Text(tradeIn.contractId ?? "Договор формируется")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(ClientTheme.muted)
                }
                Spacer()
                Text(tradeIn.price.formatted(.currency(code: "KGS")))
                    .font(ClientTheme.body(14, weight: .bold))
                    .foregroundStyle(ClientTheme.lime)
            }
            HStack {
                Text("Состояние: \(tradeIn.grade)")
                Spacer()
                Text("Паспорт \(tradeIn.sellerPassportMasked)")
            }
            .font(ClientTheme.body(11))
            .foregroundStyle(ClientTheme.muted)
            if let imei = tradeIn.imei, !imei.isEmpty {
                Text("IMEI \(imei)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(ClientTheme.muted)
            }
            PhotosPicker(selection: $selectedPhoto, matching: .images, photoLibrary: .shared()) {
                Label("Добавить фото устройства", systemImage: "camera.fill")
                    .font(ClientTheme.body(12, weight: .semibold))
                    .foregroundStyle(ClientTheme.lime)
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .background(ClientTheme.line, in: RoundedRectangle(cornerRadius: 11))
            }
            .disabled(isUploadingEvidence)
            .buttonStyle(.plain)
            .accessibilityIdentifier("tradein-evidence-\(tradeIn.id)")
            if isUploadingEvidence {
                ProgressView("Загружаем фото…")
                    .tint(ClientTheme.lime)
                    .font(ClientTheme.body(11))
            }
            if let evidenceMessage {
                Text(evidenceMessage)
                    .font(ClientTheme.body(11))
                    .foregroundStyle(evidenceMessage == "Фото добавлено в Evidence Vault" ? ClientTheme.lime : ClientTheme.coral)
            }
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            Task { await uploadEvidence(item) }
        }
    }

    @MainActor
    private func uploadEvidence(_ item: PhotosPickerItem) async {
        isUploadingEvidence = true
        evidenceMessage = nil
        defer {
            isUploadingEvidence = false
            selectedPhoto = nil
        }
        do {
            guard let imageData = try await item.loadTransferable(type: Data.self) else {
                throw APIError.invalidResponse
            }
            guard let token = auth.session?.accessToken else {
                throw APIError.rejected(status: 401, message: "Войдите в аккаунт, чтобы прикрепить фото")
            }
            _ = try await APIClient(baseURL: environment.apiBaseURL).uploadEvidence(
                imageData: imageData,
                entityType: "tradein",
                entityId: tradeIn.id,
                label: "tradein_device",
                token: token,
                idempotencyKey: evidenceIdempotencyKey
            )
            evidenceMessage = "Фото добавлено в Evidence Vault"
            evidenceIdempotencyKey = UUID().uuidString
        } catch is CancellationError {
        } catch {
            evidenceMessage = "Не удалось загрузить фото: \(error.localizedDescription)"
        }
    }
}

private struct CustomerTradeInFormView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let onCreated: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var model = ""
    @State private var imei = ""
    @State private var grade = "B"
    @State private var price = ""
    @State private var sellerPassport = ""
    @State private var idempotencyKey = UUID().uuidString
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private let grades = [("A", "Отличное"), ("B", "Хорошее"), ("C", "Нужна диагностика")]

    private var parsedPrice: Int? {
        let digits = price.filter(\.isNumber)
        guard let value = Int(digits), value > 0 else { return nil }
        return value
    }

    private var canSubmit: Bool {
        !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !sellerPassport.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        parsedPrice != nil && !isSubmitting
    }

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Новая оценка")
                        .font(ClientTheme.display(25, weight: .black))
                        .foregroundStyle(.white)
                    Text("Владелец заявки определяется вашим customer JWT. Если сеть прервётся, повторная отправка использует тот же ключ и не создаст второй договор.")
                        .font(ClientTheme.body(12))
                        .foregroundStyle(ClientTheme.muted)
                        .lineSpacing(3)

                    tradeInField("Модель", placeholder: "iPhone 13 Pro 256GB", text: $model)
                    tradeInField("IMEI / серийный номер", placeholder: "Можно оставить пустым", text: $imei)
                    tradeInField("Паспорт / ID продавца", placeholder: "Для защищённого договора", text: $sellerPassport)
                    tradeInField("Предварительная цена", placeholder: "42000", text: $price, keyboard: .numberPad)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Состояние")
                            .font(ClientTheme.body(12, weight: .semibold))
                            .foregroundStyle(ClientTheme.muted)
                        ForEach(grades, id: \.0) { option in
                            Button {
                                grade = option.0
                                rotateKey()
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: grade == option.0 ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(grade == option.0 ? ClientTheme.lime : ClientTheme.muted)
                                    Text(option.0).font(ClientTheme.body(13, weight: .bold)).foregroundStyle(.white)
                                    Text(option.1).font(ClientTheme.body(12)).foregroundStyle(ClientTheme.muted)
                                    Spacer()
                                }
                                .padding(12)
                                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(grade == option.0 ? ClientTheme.lime : ClientTheme.line))
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(ClientTheme.body(12))
                            .foregroundStyle(ClientTheme.coral)
                    }

                    Button { Task { await submit() } } label: {
                        HStack {
                            Spacer()
                            if isSubmitting { ProgressView().tint(.black) }
                            else { Text("Создать оценку") }
                            Spacer()
                        }
                        .font(ClientTheme.body(15, weight: .bold))
                        .foregroundStyle(.black)
                        .frame(height: 50)
                        .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSubmit)
                    .opacity(canSubmit ? 1 : 0.45)
                }
                .padding(18)
            }
        }
        .navigationTitle("Trade-in")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Отмена") { dismiss() } } }
        .tint(ClientTheme.lime)
        .onChange(of: model) { _, _ in rotateKey() }
        .onChange(of: imei) { _, _ in rotateKey() }
        .onChange(of: price) { _, _ in rotateKey() }
        .onChange(of: sellerPassport) { _, _ in rotateKey() }
    }

    @ViewBuilder
    private func tradeInField(
        _ title: String,
        placeholder: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(ClientTheme.body(12, weight: .semibold))
                .foregroundStyle(ClientTheme.muted)
            TextField(placeholder, text: text)
                .keyboardType(keyboard)
                .textInputAutocapitalization(.sentences)
                .foregroundStyle(.white)
                .padding(13)
                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
        }
    }

    private func rotateKey() {
        idempotencyKey = UUID().uuidString
    }

    @MainActor
    private func submit() async {
        guard let token = auth.session?.accessToken, let parsedPrice else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let _: CustomerTradeIn = try await APIClient(baseURL: environment.apiBaseURL).post(
                "tradeins",
                body: CreateCustomerTradeInRequest(
                    model: model.trimmingCharacters(in: .whitespacesAndNewlines),
                    imei: imei.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : imei.trimmingCharacters(in: .whitespacesAndNewlines),
                    grade: grade,
                    price: parsedPrice,
                    sellerPassport: sellerPassport.trimmingCharacters(in: .whitespacesAndNewlines)
                ),
                token: token,
                idempotencyKey: idempotencyKey
            )
            onCreated()
            dismiss()
        } catch is CancellationError {
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
            ZStack {
                ClientTheme.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        if auth.isRestoring {
                            ProgressView("Восстанавливаем сессию")
                                .tint(ClientTheme.lime)
                                .frame(maxWidth: .infinity, minHeight: 260)
                        } else if let session = auth.session {
                            signedInContent(session)
                        } else {
                            signInContent
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Кабинет")
            .navigationBarTitleDisplayMode(.inline)
        }
        .tint(ClientTheme.lime)
        .preferredColorScheme(.dark)
    }

    @ViewBuilder
    private func signedInContent(_ session: CustomerSession) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("МОЙ ALISTORE")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(ClientTheme.lime)
            Text("Привет, покупатель")
                .font(ClientTheme.display(25, weight: .black))
                .foregroundStyle(.white)
            Text(session.phone)
                .font(ClientTheme.body(13))
                .foregroundStyle(ClientTheme.muted)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(ClientTheme.line))

        VStack(alignment: .leading, spacing: 10) {
            Text("Покупки и защита")
                .font(ClientTheme.body(12, weight: .semibold))
                .foregroundStyle(ClientTheme.muted)
            AccountMenuRow(title: "Мои заказы", detail: "Статусы, выдача и доставка", symbol: "shippingbox.fill") {
                OrdersView(environment: environment, auth: auth, refreshRevision: orderRefreshRevision)
            }
            AccountMenuRow(title: "Возвраты", detail: "Заявки, статусы и сумма возврата", symbol: "arrow.uturn.backward.circle.fill") {
                CustomerReturnsView(environment: environment, auth: auth)
            }
            AccountMenuRow(title: "Устройства и гарантия", detail: "IMEI, срок и обращение", symbol: "shield.checkered") {
                DevicesView(environment: environment, auth: auth)
            }
            AccountMenuRow(title: "Поддержка", detail: "Обращения и ответы команды", symbol: "bubble.left.and.bubble.right.fill") {
                CustomerSupportView(environment: environment, auth: auth)
            }
        }

        VStack(alignment: .leading, spacing: 10) {
            Text("Сервисы")
                .font(ClientTheme.body(12, weight: .semibold))
                .foregroundStyle(ClientTheme.muted)
            AccountMenuRow(title: "Бонусы", detail: "Баланс, купоны и история начислений", symbol: "gift.fill") {
                CustomerLoyaltyView(environment: environment, auth: auth)
            }
            AccountMenuRow(title: "Адреса доставки", detail: "Сохранённые адреса и адрес по умолчанию", symbol: "mappin.and.ellipse") {
                CustomerAddressesView(environment: environment, auth: auth)
            }
            AccountMenuRow(title: "Trade-in", detail: "Оценка устройства и договор", symbol: "arrow.triangle.2.circlepath") {
                CustomerTradeInsView(environment: environment, auth: auth)
            }
            AccountMenuRow(title: "Настройки", detail: "Профиль, уведомления и согласия", symbol: "slider.horizontal.3") {
                CustomerSettingsView(environment: environment, auth: auth)
            }
        }

        VStack(alignment: .leading, spacing: 10) {
            AccountMenuRow(title: "Офлайн-операции", detail: pushStatus, symbol: "arrow.triangle.2.circlepath") {
                OfflineQueueView(environment: environment, auth: auth)
            }
            Button {
                onEnablePush()
            } label: {
                Label("Включить push", systemImage: "bell.badge")
                    .font(ClientTheme.body(14, weight: .semibold))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
            }
            .buttonStyle(.plain)
        }

        Button {
            Task {
                await auth.logout()
                onLogout()
            }
        } label: {
            Text("Выйти из аккаунта")
                .font(ClientTheme.body(14, weight: .semibold))
                .foregroundStyle(ClientTheme.coral)
                .frame(maxWidth: .infinity, minHeight: 46)
                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
        }
        .buttonStyle(.plain)
    }

    private var signInContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Войдите в кабинет")
                .font(ClientTheme.display(25, weight: .black))
                .foregroundStyle(.white)
            Text("Заказы, гарантия и поддержка будут доступны после входа по SMS-коду.")
                .font(ClientTheme.body(13))
                .foregroundStyle(ClientTheme.muted)
                .lineSpacing(3)
            TextField("+996 555 000 000", text: $phone)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .foregroundStyle(.white)
                .padding(14)
                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
            if codeRequested {
                TextField("6-значный код", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .foregroundStyle(.white)
                    .padding(14)
                    .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                    .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.lime))
                if let devCode = auth.devCode {
                    Text("Код для тестового контура: \(devCode)")
                        .font(ClientTheme.body(12))
                        .foregroundStyle(ClientTheme.muted)
                }
            }
            if let error = auth.errorMessage {
                Text(error).font(ClientTheme.body(12)).foregroundStyle(.red)
            }
            Button {
                Task {
                    if codeRequested {
                        await auth.verify(phone: normalizedPhone, code: code.filter(\.isNumber))
                    } else {
                        codeRequested = await auth.requestOTP(phone: normalizedPhone)
                    }
                }
            } label: {
                HStack {
                    Spacer()
                    if auth.isLoading {
                        ProgressView().tint(.black)
                    } else {
                        Text(codeRequested ? "Войти" : "Получить код")
                    }
                    Spacer()
                }
                .font(ClientTheme.body(15, weight: .bold))
                .foregroundStyle(.black)
                .frame(height: 50)
                .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
            }
            .buttonStyle(.plain)
            .disabled(auth.isLoading || normalizedPhone.filter(\.isNumber).count < 9 || (codeRequested && code.filter(\.isNumber).count != 6))
        }
        .padding(18)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(ClientTheme.line))
    }

    private var normalizedPhone: String {
        let digits = phone.filter(\.isNumber)
        return "+\(digits)"
    }
}

private struct AccountMenuRow<Destination: View>: View {
    let title: String
    let detail: String
    let symbol: String
    @ViewBuilder let destination: () -> Destination

    var body: some View {
        NavigationLink(destination: destination) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .foregroundStyle(ClientTheme.lime)
                    .frame(width: 38, height: 38)
                    .background(ClientTheme.lime.opacity(0.12), in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(ClientTheme.body(14, weight: .semibold)).foregroundStyle(.white)
                    Text(detail).font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(ClientTheme.muted)
            }
            .padding(12)
            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
        }
        .buttonStyle(.plain)
    }
}

private struct CustomerLoyaltyView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    @State private var loyalty: CustomerLoyalty?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            if isLoading {
                ProgressView("Загружаем бонусы").tint(ClientTheme.lime)
            } else if let errorMessage {
                ClientDataErrorView(message: errorMessage, retry: { Task { await load() } })
            } else if let loyalty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        VStack(alignment: .leading, spacing: 7) {
                            Text("БАЛАНС БОНУСОВ")
                                .font(ClientTheme.body(11, weight: .bold))
                                .foregroundStyle(ClientTheme.lime)
                            Text("\(loyalty.balance)")
                                .font(ClientTheme.display(36, weight: .black))
                                .foregroundStyle(.white)
                            Text("уровень \(loyalty.level) · 1 бонус = \(loyalty.conversion) сом")
                                .font(ClientTheme.body(12))
                                .foregroundStyle(ClientTheme.muted)
                            if loyalty.nextLevelSpend > 0 {
                                Text("До следующего уровня: \(loyalty.nextLevelSpend.formatted(.number)) сом покупок")
                                    .font(ClientTheme.body(12, weight: .semibold))
                                    .foregroundStyle(.white)
                            } else {
                                Text("Максимальный уровень достигнут")
                                    .font(ClientTheme.body(12, weight: .semibold))
                                    .foregroundStyle(ClientTheme.lime)
                            }
                        }
                        .padding(18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 18))
                        .overlay(RoundedRectangle(cornerRadius: 18).stroke(ClientTheme.line))

                        if !loyalty.coupons.isEmpty {
                            Text("Купоны")
                                .font(ClientTheme.body(12, weight: .semibold))
                                .foregroundStyle(ClientTheme.muted)
                            ForEach(loyalty.coupons) { coupon in
                                VStack(alignment: .leading, spacing: 5) {
                                    HStack {
                                        Text(coupon.title).font(ClientTheme.body(14, weight: .semibold)).foregroundStyle(.white)
                                        Spacer()
                                        Text(coupon.valueLabel).font(ClientTheme.body(13, weight: .bold)).foregroundStyle(ClientTheme.coral)
                                    }
                                    Text(coupon.code).font(.system(size: 12, design: .monospaced)).foregroundStyle(ClientTheme.lime)
                                    if let expiresAt = coupon.expiresAt {
                                        Text("Действует до \(expiresAt, format: .dateTime.day().month().year())")
                                            .font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted)
                                    }
                                }
                                .padding(13)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
                            }
                        }

                        Text("История")
                            .font(ClientTheme.body(12, weight: .semibold))
                            .foregroundStyle(ClientTheme.muted)
                        if loyalty.history.isEmpty {
                            EmptyStateView(title: "История пока пуста", detail: "Начисления и списания появятся после покупки.", symbol: "clock.arrow.circlepath")
                        } else {
                            ForEach(loyalty.history) { entry in
                                HStack(spacing: 12) {
                                    Image(systemName: entry.amount >= 0 ? "plus.circle.fill" : "minus.circle.fill")
                                        .foregroundStyle(entry.amount >= 0 ? ClientTheme.lime : ClientTheme.coral)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(entry.label).font(ClientTheme.body(13, weight: .semibold)).foregroundStyle(.white)
                                        Text(entry.createdAt, format: .dateTime.day().month().year())
                                            .font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted)
                                    }
                                    Spacer()
                                    Text("\(entry.amount >= 0 ? "+" : "")\(entry.amount)")
                                        .font(ClientTheme.body(14, weight: .bold))
                                        .foregroundStyle(entry.amount >= 0 ? ClientTheme.lime : ClientTheme.coral)
                                }
                                .padding(12)
                                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                                .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle("Бонусы")
        .navigationBarTitleDisplayMode(.inline)
        .tint(ClientTheme.lime)
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        guard let token = auth.session?.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            loyalty = try await APIClient(baseURL: environment.apiBaseURL).get("customers/me/loyalty", token: token)
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct CustomerAddressesView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    @State private var addresses: [CustomerAddress] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var editor: AddressEditorRoute?

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            if isLoading {
                ProgressView("Загружаем адреса").tint(ClientTheme.lime)
            } else if let errorMessage {
                ClientDataErrorView(message: errorMessage, retry: { Task { await load() } })
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if addresses.isEmpty {
                            EmptyStateView(title: "Адресов пока нет", detail: "Добавьте адрес, чтобы быстрее оформить доставку.", symbol: "mappin.and.ellipse")
                        } else {
                            ForEach(addresses) { address in
                                Button { editor = AddressEditorRoute(address: address) } label: {
                                    addressRow(address)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        Button { editor = AddressEditorRoute(address: nil) } label: {
                            Label("Добавить адрес", systemImage: "plus")
                                .font(ClientTheme.body(14, weight: .bold))
                                .foregroundStyle(.black)
                                .frame(maxWidth: .infinity, minHeight: 46)
                                .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle("Адреса доставки")
        .navigationBarTitleDisplayMode(.inline)
        .tint(ClientTheme.lime)
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $editor) { route in
            NavigationStack {
                CustomerAddressEditorView(environment: environment, auth: auth, address: route.address) {
                    editor = nil
                    Task { await load() }
                }
            }
            .preferredColorScheme(.dark)
        }
    }

    private func addressRow(_ address: CustomerAddress) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: address.isPrimary ? "mappin.and.ellipse" : "mappin")
                .foregroundStyle(address.isPrimary ? ClientTheme.lime : ClientTheme.muted)
                .frame(width: 38, height: 38)
                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 11))
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text(address.title).font(ClientTheme.body(14, weight: .semibold)).foregroundStyle(.white)
                    if address.isPrimary {
                        Text("По умолчанию").font(ClientTheme.body(10, weight: .semibold)).foregroundStyle(ClientTheme.lime)
                    }
                }
                Text(address.text).font(ClientTheme.body(12)).foregroundStyle(ClientTheme.muted).multilineTextAlignment(.leading)
                if let comment = address.comment, !comment.isEmpty {
                    Text(comment).font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted.opacity(0.8))
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").foregroundStyle(ClientTheme.muted)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
    }

    @MainActor
    private func load() async {
        guard let token = auth.session?.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            addresses = try await APIClient(baseURL: environment.apiBaseURL).get("customers/me/addresses", token: token)
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct AddressEditorRoute: Identifiable {
    let id = UUID()
    let address: CustomerAddress?
}

private struct CustomerAddressEditorView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let address: CustomerAddress?
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var text: String
    @State private var comment: String
    @State private var isPrimary: Bool
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(environment: AppEnvironment, auth: CustomerAuthStore, address: CustomerAddress?, onSaved: @escaping () -> Void) {
        self.environment = environment
        self.auth = auth
        self.address = address
        self.onSaved = onSaved
        _title = State(initialValue: address?.title ?? "Дом")
        _text = State(initialValue: address?.text ?? "")
        _comment = State(initialValue: address?.comment ?? "")
        _isPrimary = State(initialValue: address?.isPrimary ?? false)
    }

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(address == nil ? "Новый адрес" : "Изменить адрес")
                        .font(ClientTheme.display(24, weight: .black)).foregroundStyle(.white)
                    clientField("Название", text: $title, placeholder: "Дом, работа")
                    clientField("Адрес", text: $text, placeholder: "Улица, дом, квартира", axis: .vertical)
                    clientField("Комментарий", text: $comment, placeholder: "Подъезд, этаж", axis: .vertical)
                    Toggle("Использовать по умолчанию", isOn: $isPrimary)
                        .font(ClientTheme.body(14, weight: .semibold)).foregroundStyle(.white)
                        .tint(ClientTheme.lime)
                    if let errorMessage { Text(errorMessage).font(ClientTheme.body(12)).foregroundStyle(.red) }
                    Button { Task { await save() } } label: {
                        HStack { Spacer(); if isSaving { ProgressView().tint(.black) } else { Text("Сохранить") }; Spacer() }
                            .font(ClientTheme.body(15, weight: .bold)).foregroundStyle(.black).frame(height: 50)
                            .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    if address != nil {
                        Button(role: .destructive) { Task { await delete() } } label: {
                            Text("Удалить адрес").font(ClientTheme.body(14, weight: .semibold)).frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .disabled(isSaving)
                    }
                }
                .padding(18)
            }
        }
        .navigationTitle(address == nil ? "Добавить адрес" : "Адрес")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Отмена") { dismiss() } } }
        .tint(ClientTheme.lime)
    }

    private func clientField(_ label: String, text: Binding<String>, placeholder: String, axis: Axis = .horizontal) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label).font(ClientTheme.body(12, weight: .semibold)).foregroundStyle(ClientTheme.muted)
            TextField(placeholder, text: text, axis: axis)
                .lineLimit(3...6)
                .foregroundStyle(.white).padding(13)
                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
        }
    }

    @MainActor
    private func save() async {
        guard let token = auth.session?.accessToken else { return }
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanComment = comment.trimmingCharacters(in: .whitespacesAndNewlines)
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            if let address {
                let _: CustomerAddress = try await APIClient(baseURL: environment.apiBaseURL).patch(
                    "customers/me/addresses/\(address.id)",
                    body: UpdateCustomerAddressRequest(title: cleanTitle, text: cleanText, comment: cleanComment.isEmpty ? nil : cleanComment, isPrimary: isPrimary),
                    token: token
                )
            } else {
                let _: CustomerAddress = try await APIClient(baseURL: environment.apiBaseURL).post(
                    "customers/me/addresses",
                    body: CreateCustomerAddressRequest(title: cleanTitle, text: cleanText, comment: cleanComment.isEmpty ? nil : cleanComment, isPrimary: isPrimary),
                    token: token,
                    idempotencyKey: UUID().uuidString
                )
            }
            onSaved()
            dismiss()
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func delete() async {
        guard let token = auth.session?.accessToken, let address else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let _: DeleteCustomerAddressResponse = try await APIClient(baseURL: environment.apiBaseURL).delete("customers/me/addresses/\(address.id)", token: token)
            onSaved()
            dismiss()
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct DeleteCustomerAddressResponse: Decodable, Sendable {
    let id: String
}

private struct CustomerSettingsView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    @State private var settings: CustomerSettings?
    @State private var name = ""
    @State private var consent = false
    @State private var push = true
    @State private var whatsapp = true
    @State private var service = true
    @State private var promos = false
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var savedMessage: String?

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            if isLoading {
                ProgressView("Загружаем настройки").tint(ClientTheme.lime)
            } else if let errorMessage, settings == nil {
                ClientDataErrorView(message: errorMessage, retry: { Task { await load() } })
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Профиль")
                            .font(ClientTheme.body(12, weight: .semibold)).foregroundStyle(ClientTheme.muted)
                        TextField("Имя", text: $name)
                            .foregroundStyle(.white).padding(13)
                            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                            .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
                        if let settings {
                            Text(settings.phone).font(ClientTheme.body(12)).foregroundStyle(ClientTheme.muted)
                        }

                        Text("Уведомления")
                            .font(ClientTheme.body(12, weight: .semibold)).foregroundStyle(ClientTheme.muted).padding(.top, 8)
                        settingsToggle("Push-уведомления", detail: "Статусы заказов и важные события", isOn: $push)
                        settingsToggle("Сервисные сообщения", detail: "Гарантия, поддержка и доставка", isOn: $service)
                        settingsToggle("WhatsApp", detail: "Сообщения по выбранным заказам", isOn: $whatsapp)
                        settingsToggle("Промо и предложения", detail: "Скидки, акции и бонусные кампании", isOn: $promos)
                        settingsToggle("Маркетинговое согласие", detail: "Разрешение на персональные предложения", isOn: $consent)

                        if let errorMessage { Text(errorMessage).font(ClientTheme.body(12)).foregroundStyle(.red) }
                        if let savedMessage { Text(savedMessage).font(ClientTheme.body(12, weight: .semibold)).foregroundStyle(ClientTheme.lime) }
                        Button { Task { await save() } } label: {
                            HStack { Spacer(); if isSaving { ProgressView().tint(.black) } else { Text("Сохранить настройки") }; Spacer() }
                                .font(ClientTheme.body(15, weight: .bold)).foregroundStyle(.black).frame(height: 50)
                                .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                        }
                        .buttonStyle(.plain)
                        .disabled(isSaving)
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle("Настройки")
        .navigationBarTitleDisplayMode(.inline)
        .tint(ClientTheme.lime)
        .task { await load() }
        .refreshable { await load() }
    }

    private func settingsToggle(_ title: String, detail: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(ClientTheme.body(14, weight: .semibold)).foregroundStyle(.white)
                Text(detail).font(ClientTheme.body(11)).foregroundStyle(ClientTheme.muted)
            }
            Spacer()
            Toggle("", isOn: isOn).labelsHidden().tint(ClientTheme.lime)
        }
        .padding(13)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
    }

    @MainActor
    private func load() async {
        guard let token = auth.session?.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let loaded: CustomerSettings = try await APIClient(baseURL: environment.apiBaseURL).get("customers/me/settings", token: token)
            settings = loaded
            name = loaded.name
            consent = loaded.consent
            push = loaded.push
            whatsapp = loaded.whatsapp
            service = loaded.service
            promos = loaded.promos
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func save() async {
        guard let token = auth.session?.accessToken else { return }
        isSaving = true
        errorMessage = nil
        savedMessage = nil
        defer { isSaving = false }
        do {
            let updated: CustomerSettings = try await APIClient(baseURL: environment.apiBaseURL).patch(
                "customers/me/settings",
                body: UpdateCustomerSettingsRequest(name: name.trimmingCharacters(in: .whitespacesAndNewlines), consent: consent, push: push, whatsapp: whatsapp, service: service, promos: promos),
                token: token
            )
            settings = updated
            name = updated.name
            consent = updated.consent
            push = updated.push
            whatsapp = updated.whatsapp
            service = updated.service
            promos = updated.promos
            savedMessage = "Настройки сохранены"
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ClientDataErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark").font(.title).foregroundStyle(ClientTheme.coral)
            Text("Данные временно недоступны").font(ClientTheme.body(16, weight: .bold)).foregroundStyle(.white)
            Text(message).font(ClientTheme.body(12)).foregroundStyle(ClientTheme.muted).multilineTextAlignment(.center)
            Button("Повторить", systemImage: "arrow.clockwise", action: retry)
                .font(ClientTheme.body(13, weight: .semibold)).tint(ClientTheme.lime)
        }
        .padding(24)
        .frame(maxWidth: 330)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(ClientTheme.line))
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

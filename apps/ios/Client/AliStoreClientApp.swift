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

private enum ClientOverlay: String, Identifiable, Hashable {
    case search, compare, notifications, support

    var id: String { rawValue }
}

private enum ClientTheme {
    static let background = Color(red: 0.055, green: 0.047, blue: 0.039)
    static let surface = Color(red: 0.133, green: 0.118, blue: 0.098)
    static let line = Color(red: 0.18, green: 0.157, blue: 0.133)
    static let coral = Color(red: 1, green: 0.357, blue: 0.18)
    static let lime = Color(red: 0.776, green: 1, blue: 0.239)
    static let muted = Color(red: 0.655, green: 0.612, blue: 0.573)
    static let gold = Color(red: 0.898, green: 0.698, blue: 0.235)

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
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let products: [Product]
    @Binding var cart: [String: Int]
    @Binding var favorites: Set<String>
    @Binding var compared: Set<String>
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var notifications: [CustomerNotification] = []
    @State private var notificationError: String?
    @State private var notificationsLoading = false
    let onRoute: (CustomerNotification) -> Void

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
                case .support:
                    CustomerSupportView(environment: environment, auth: auth)
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
        .task {
            guard screen == .notifications else { return }
            await loadNotifications()
        }
    }

    private var title: String {
        switch screen {
        case .search: "Поиск"
        case .compare: "Сравнение"
        case .notifications: "Уведомления"
        case .support: "Поддержка"
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
                                ProductDetail(environment: environment, product: product, cart: $cart, favorites: $favorites)
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
                    let lowestPrice = comparedProducts.map(\.price).min()
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 10) {
                            ForEach(comparedProducts) { product in
                                compareCard(product, isBestPrice: product.price == lowestPrice)
                            }
                        }
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

    @ViewBuilder
    private var notificationContent: some View {
        if notificationsLoading {
            ProgressView("Загружаем уведомления")
                .tint(ClientTheme.lime)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let notificationError {
            ClientDataErrorView(message: notificationError, retry: { Task { await loadNotifications() } })
                .padding(16)
        } else if notifications.isEmpty {
            EmptyStateView(
                title: auth.session == nil ? "Войдите, чтобы увидеть уведомления" : "Уведомлений пока нет",
                detail: auth.session == nil ? "Статусы заказов, гарантия и бонусы появятся здесь." : "Мы покажем здесь важные обновления по вашим покупкам.",
                symbol: "bell"
            )
            .padding(16)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        Button { dismiss() } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Назад")
                        Text("Уведомления")
                            .font(ClientTheme.display(20, weight: .bold))
                            .foregroundStyle(.white)
                        Spacer()
                    }
                    .padding(.bottom, 4)

                    ForEach(notifications) { notification in
                        notificationDestination(notification)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 20)
            }
        }
    }

    @ViewBuilder
    private func notificationDestination(_ notification: CustomerNotification) -> some View {
        let row = ClientNotificationRow(
            icon: notificationIcon(notification),
            title: notification.title,
            detail: notification.detail,
            time: relativeTime(notification.createdAt),
            isUnread: notification.readAt == nil,
            route: notification.route
        )
        switch notification.route {
        case "order" where notification.referenceId != nil:
            NavigationLink {
                ClientNotificationOrderView(environment: environment, auth: auth, orderId: notification.referenceId!)
            } label: {
                row
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded { markNotificationRead(notification) })
        case "warranty":
            NavigationLink {
                DevicesView(environment: environment, auth: auth)
            } label: {
                row
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded { markNotificationRead(notification) })
        case "bonuses":
            NavigationLink {
                CustomerLoyaltyView(environment: environment, auth: auth)
            } label: {
                row
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded { markNotificationRead(notification) })
        default:
            Button {
                markNotificationRead(notification)
                onRoute(notification)
            } label: { row }
                .buttonStyle(.plain)
        }
    }

    private func markNotificationRead(_ notification: CustomerNotification) {
        guard notification.readAt == nil else { return }
#if DEBUG
        if UITestBootstrap.startsSignedIn {
            replaceNotification(notification, readAt: Date())
            return
        }
#endif
        guard let token = auth.session?.accessToken else { return }
        Task {
            do {
                let updated: CustomerNotification = try await APIClient(baseURL: environment.apiBaseURL).patch(
                    "notifications/\(notification.id)/read",
                    body: EmptyRequest(),
                    token: token
                )
                replaceNotification(updated, readAt: updated.readAt ?? Date())
            } catch is CancellationError {
            } catch {
                // Reading a notification is best-effort and must not block navigation.
            }
        }
    }

    private func replaceNotification(_ notification: CustomerNotification, readAt: Date) {
        guard let index = notifications.firstIndex(where: { $0.id == notification.id }) else { return }
        notifications[index] = CustomerNotification(
            id: notification.id,
            template: notification.template,
            title: notification.title,
            detail: notification.detail,
            symbol: notification.symbol,
            route: notification.route,
            referenceId: notification.referenceId,
            createdAt: notification.createdAt,
            readAt: readAt
        )
    }

    private func loadNotifications() async {
        notificationsLoading = true
        defer { notificationsLoading = false }
#if DEBUG
        if UITestBootstrap.startsSignedIn {
            notifications = ClientUIFixture.notifications
            notificationError = nil
            return
        }
#endif
        guard let token = auth.session?.accessToken else {
            notifications = []
            notificationError = nil
            return
        }
        do {
            notifications = try await APIClient(baseURL: environment.apiBaseURL).get("notifications/mine", token: token)
            notificationError = nil
        } catch is CancellationError {
        } catch {
            notificationError = error.localizedDescription
        }
    }

    private func notificationIcon(_ notification: CustomerNotification) -> String {
        let value = "\(notification.template) \(notification.title) \(notification.route) \(notification.symbol)".lowercased()
        if value.contains("price") || value.contains("цена") || value.contains("tag") { return "🏷️" }
        if value.contains("warranty") || value.contains("гарант") || value.contains("shield") { return "🛡" }
        if value.contains("bonus") || value.contains("loyalty") || value.contains("бонус") || value.contains("gift") { return "🎁" }
        if value.contains("support") || value.contains("поддерж") { return "💬" }
        return "📦"
    }

    private func relativeTime(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
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

    private func compareCard(_ product: Product, isBestPrice: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ClientProductImage(product: product, cornerRadius: 10)
                .frame(width: 138, height: 92)
            if isBestPrice {
                Text("ЛУЧШАЯ ЦЕНА")
                    .font(ClientTheme.body(9, weight: .bold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(ClientTheme.lime, in: Capsule())
            }
            Text(product.name)
                .font(ClientTheme.body(12, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .frame(minHeight: 32, alignment: .top)
            Text(product.price.formatted(.currency(code: "KGS")))
                .font(ClientTheme.display(15, weight: .black))
                .foregroundStyle(.white)
            VStack(alignment: .leading, spacing: 3) {
                Text(product.category)
                Text("🛡 Гарантия 12 мес")
                Text(product.availableUnits > 0 ? "● В наличии" : "● Нет в наличии")
                    .foregroundStyle(product.availableUnits > 0 ? ClientTheme.lime : ClientTheme.coral)
            }
            .font(ClientTheme.body(10))
            .foregroundStyle(ClientTheme.muted)
            .padding(.top, 4)
            Button {
                cart[product.id] = min(product.availableUnits, (cart[product.id] ?? 0) + 1)
            } label: {
                Text(product.availableUnits > 0 ? "В корзину" : "Нет в наличии")
                    .font(ClientTheme.body(11, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity, minHeight: 32)
                    .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 8))
            }
            .disabled(product.availableUnits == 0)
            Button {
                compared.remove(product.id)
            } label: {
                Text("Убрать")
                    .font(ClientTheme.body(10))
                    .foregroundStyle(ClientTheme.muted)
                    .frame(maxWidth: .infinity, minHeight: 24)
            }
            .accessibilityLabel("Убрать \(product.name) из сравнения")
        }
        .padding(10)
        .frame(width: 160, alignment: .topLeading)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(isBestPrice ? ClientTheme.lime : ClientTheme.line))
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
    let icon: String
    let title: String
    let detail: String
    let time: String
    let isUnread: Bool
    let route: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(icon)
                .font(.system(size: 20))
                .frame(width: 24, alignment: .center)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(ClientTheme.body(13, weight: .semibold))
                    .foregroundStyle(.white)
                Text(detail)
                    .font(ClientTheme.body(12))
                    .foregroundStyle(ClientTheme.muted)
                    .lineLimit(2)
                Text(time)
                    .font(ClientTheme.body(11))
                    .foregroundStyle(Color(red: 0.431, green: 0.392, blue: 0.361))
            }
            Spacer()
        }
        .padding(14)
        .background(backgroundColor, in: RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(detail). \(time)")
    }

    private var backgroundColor: Color {
        if isUnread && route == "order" { return ClientTheme.surface }
        return Color(red: 0.086, green: 0.075, blue: 0.059)
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
        _selectedTab = State(initialValue: UITestBootstrap.startsAtAccount ? .account : .home)
        _auth = State(initialValue: CustomerAuthStore(
            environment: environment,
            restoresStoredSession: !UITestBootstrap.disablesSessionRestore && !UITestBootstrap.startsSignedIn
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
                            CatalogView(environment: environment, products: products, isLoading: catalogLoading, errorMessage: catalogError, cart: $cart, favorites: $favorites)
                        case .favorites:
                            FavoritesView(products: products, cart: $cart, favorites: $favorites)
                        case .cart:
                            CartView(
                                environment: environment,
                                auth: auth,
                                products: products,
                                cart: $cart,
                                onOpenCatalog: { selectedTab = .catalog },
                                onOpenSupport: { overlay = .support }
                            )
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
            ClientOverlayView(
                screen: screen,
                environment: environment,
                auth: auth,
                products: products,
                cart: $cart,
                favorites: $favorites,
                compared: $compared,
                onRoute: { _ in
                    overlay = nil
                    selectedTab = .account
                    orderRefreshRevision += 1
                }
            )
        }
        .task {
            restoreLocalState()
            #if DEBUG
            if UITestBootstrap.startsSignedIn {
                auth.useUITestSession()
            }
            #endif
            async let restore: Void = UITestBootstrap.startsSignedIn ? () : auth.restore()
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
        guard !UITestBootstrap.startsAtCheckout, !UITestBootstrap.startsAtCart else { return }
        cart = ClientLocalState.cart()
        favorites = ClientLocalState.favorites()
        compared = ClientLocalState.compared()
    }

    private func saveLocalState() {
        guard !UITestBootstrap.startsAtCheckout, !UITestBootstrap.startsAtCart else { return }
        ClientLocalState.save(cart: cart, favorites: favorites, compared: compared)
    }

    private func loadCatalog() async {
        catalogLoading = true
        defer { catalogLoading = false }
#if DEBUG
        if UITestBootstrap.startsAtVisualEvidence {
            products = ClientUIFixture.products
            if (UITestBootstrap.startsAtCheckout || UITestBootstrap.startsAtCart), let product = products.first {
                cart[product.id] = 1
            }
            catalogError = nil
            return
        }
#endif
        do {
            let response: CatalogResponse = try await APIClient(baseURL: environment.apiBaseURL).get("catalog/products?limit=100")
            products = response.items
            if (UITestBootstrap.startsAtCheckout || UITestBootstrap.startsAtCart), let product = response.items.first {
                cart[product.id] = 1
            }
            catalogError = nil
        } catch {
            if UITestBootstrap.startsAtCheckout || UITestBootstrap.startsAtCart {
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
    @State private var isRetryingPayment = false
    @State private var retryErrorMessage: String?
    @State private var queuedOffline = false
    @State private var checkoutStep: ClientCheckoutStep = .delivery
    @State private var showingOrderStatus = false
    @State private var showingCheckout = UITestBootstrap.startsAtCheckout
    let onOpenCatalog: () -> Void
    let onOpenSupport: () -> Void

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
                        ClientPaymentResultView(
                            order: order,
                            paymentIntent: paymentIntent,
                            paymentURL: paymentIntent.flatMap(paymentURL),
                            forceFailure: UITestBootstrap.startsAtPaymentFailure,
                            isRetrying: isRetryingPayment,
                            retryErrorMessage: retryErrorMessage,
                            onTrack: { showingOrderStatus = true },
                            onRetry: { Task { await retryPayment() } },
                            onSupport: onOpenSupport,
                            onReset: {
                                resetCheckout()
                                onOpenCatalog()
                            }
                        )
                    } else if lines.isEmpty {
                        EmptyStateView(title: "Корзина пуста", detail: "Добавьте товары из каталога.", symbol: "bag")
                    } else {
                        if showingCheckout {
                            if checkoutStep == .review {
                                reviewStep
                            } else {
                                stepContent
                            }
                            footer
                        } else {
                            cartContents
                            cartFooter
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 22)
            }
            .scrollIndicators(.hidden)
        }
        .task {
            #if DEBUG
            if UITestBootstrap.startsAtPaymentResult || UITestBootstrap.startsAtPaymentFailure {
                completedOrder = ClientUIFixture.orders[0]
            }
            #endif
            await loadStorePoints()
        }
        .sheet(isPresented: $showingOrderStatus) {
            if let order = completedOrder {
                ClientOrderStatusView(order: order, environment: environment, auth: auth)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(completedOrder == nil ? (showingCheckout ? "Оформление" : "Корзина") : "Готово")
                    .font(ClientTheme.display(20, weight: .bold))
                    .foregroundStyle(.white)
                Spacer()
                if completedOrder == nil && !lines.isEmpty {
                    Text("\(cart.values.reduce(0, +)) шт.")
                        .font(ClientTheme.body(12, weight: .medium))
                        .foregroundStyle(ClientTheme.muted)
                }
            }
            if completedOrder == nil && showingCheckout && !lines.isEmpty {
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

    private var cartContents: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(lines, id: \.0.id) { product, quantity in
                HStack(alignment: .top, spacing: 12) {
                    ClientProductImage(product: product, cornerRadius: 10)
                        .frame(width: 76, height: 76)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(product.name)
                            .font(ClientTheme.body(13, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                        Text(product.price.formatted(.currency(code: "KGS")))
                            .font(ClientTheme.display(15, weight: .black))
                            .foregroundStyle(.white)
                        HStack(spacing: 8) {
                            HStack(spacing: 10) {
                                Button {
                                    quantityBinding(product.id).wrappedValue = quantity - 1
                                } label: {
                                    Image(systemName: "minus")
                                        .font(.system(size: 11, weight: .bold))
                                        .frame(width: 28, height: 28)
                                }
                                .accessibilityLabel("Уменьшить количество \(product.name)")
                                Text("\(quantity)")
                                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(.white)
                                    .frame(minWidth: 20)
                                Button {
                                    quantityBinding(product.id).wrappedValue = quantity + 1
                                } label: {
                                    Image(systemName: "plus")
                                        .font(.system(size: 11, weight: .bold))
                                        .frame(width: 28, height: 28)
                                }
                                .accessibilityLabel("Увеличить количество \(product.name)")
                            }
                            .foregroundStyle(.white)
                            .background(ClientTheme.line, in: RoundedRectangle(cornerRadius: 8))
                            Button("Удалить") {
                                quantityBinding(product.id).wrappedValue = 0
                            }
                            .font(ClientTheme.body(11, weight: .medium))
                            .foregroundStyle(ClientTheme.muted)
                        }
                    }
                    Spacer(minLength: 0)
                    Text((product.price * quantity).formatted(.currency(code: "KGS")))
                        .font(ClientTheme.display(14, weight: .bold))
                        .foregroundStyle(ClientTheme.lime)
                        .multilineTextAlignment(.trailing)
                }
                .padding(12)
                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
                .accessibilityElement(children: .contain)
            }

            VStack(alignment: .leading, spacing: 8) {
                ClientSummaryRow(title: "Товаров", value: "\(cart.values.reduce(0, +)) шт.", emphasized: false)
                ClientSummaryRow(title: "Сумма товаров", value: total.formatted(.currency(code: "KGS")), emphasized: false)
                ClientSummaryRow(title: "Итого", value: total.formatted(.currency(code: "KGS")), emphasized: true)
            }
            .padding(16)
            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
        }
    }

    private var cartFooter: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                showingCheckout = true
                checkoutStep = .delivery
            } label: {
                HStack {
                    Spacer()
                    Text("Оформить заказ")
                    Spacer()
                }
                .font(ClientTheme.body(15, weight: .bold))
                .foregroundStyle(.black)
                .frame(height: 50)
                .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
            }
            .accessibilityIdentifier("cart-checkout-button")
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
        isRetryingPayment = false
        retryErrorMessage = nil
        queuedOffline = false
        checkoutStep = .delivery
        showingCheckout = false
    }

    private func quantityBinding(_ id: String) -> Binding<Int> {
        Binding(
            get: { cart[id] ?? 0 },
            set: { value in
                let stockCap = products.first(where: { $0.id == id })?.availableUnits ?? value
                let capped = min(max(value, 0), stockCap)
                if capped == 0 { cart.removeValue(forKey: id) } else { cart[id] = capped }
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
    private func retryPayment() async {
        guard let session = auth.session, let order = completedOrder else { return }
        guard let method = OnlinePaymentMethod(rawValue: paymentIntent?.method ?? paymentMethod) else {
            retryErrorMessage = "Для этого заказа повторная онлайн-оплата недоступна. Обратитесь в поддержку."
            return
        }
        isRetryingPayment = true
        retryErrorMessage = nil
        defer { isRetryingPayment = false }
        do {
            paymentIntent = try await APIClient(baseURL: environment.apiBaseURL).post(
                "payments/intents/mine",
                body: CreatePaymentIntentRequest(
                    orderId: order.id,
                    method: method,
                    amount: order.total,
                    returnUrl: "alistore://payment-return?orderId=\(order.id)"
                ),
                token: session.accessToken,
                idempotencyKey: UUID().uuidString
            )
        } catch is CancellationError {
        } catch {
            retryErrorMessage = error.localizedDescription
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
    let forceFailure: Bool
    let isRetrying: Bool
    let retryErrorMessage: String?
    let onTrack: () -> Void
    let onRetry: () -> Void
    let onSupport: () -> Void
    let onReset: () -> Void

    private enum ResultState: Equatable {
        case success, pending, failed
    }

    private var resultState: ResultState {
        if forceFailure { return .failed }
        guard let paymentIntent else { return .success }
        let status = paymentIntent.status.lowercased()
        if ["failed", "declined", "expired", "cancelled", "canceled", "rejected"].contains(status) {
            return .failed
        }
        if ["succeeded", "success", "paid", "captured", "completed"].contains(status) || paymentIntent.orderStatus.lowercased() == "paid" {
            return .success
        }
        return .pending
    }

    private var title: String {
        switch resultState {
        case .success: "Заказ оформлен"
        case .pending: "Ожидает оплаты"
        case .failed: "Оплата не прошла"
        }
    }

    private var detail: String {
        switch resultState {
        case .success: "Мы передали заказ в обработку. Актуальный статус будет обновляться в Кабинете."
        case .pending: "Завершите оплату на защищённой странице провайдера. Статус подтвердит только серверный webhook."
        case .failed: "Платёж не подтверждён провайдером. Повторите попытку или обратитесь в поддержку. Деньги не считаются списанными без серверного подтверждения."
        }
    }

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: resultState == .success ? "checkmark" : resultState == .failed ? "xmark" : "creditcard")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(.black)
                .frame(width: 80, height: 80)
                .background(resultState == .success ? ClientTheme.lime : resultState == .failed ? ClientTheme.coral : Color(red: 0.898, green: 0.698, blue: 0.235), in: Circle())
            Text(title)
                .font(ClientTheme.display(24, weight: .black))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("payment-result-title")
            Text("Заказ #\(order.id.suffix(6)) · \(order.total.formatted(.currency(code: "KGS")))")
                .font(ClientTheme.body(14))
                .foregroundStyle(ClientTheme.muted)
            Text(detail)
                .font(ClientTheme.body(13))
                .foregroundStyle(ClientTheme.muted)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
                .padding(.horizontal, 10)
            if resultState == .pending, let paymentURL {
                Link("Перейти к оплате", destination: paymentURL)
                    .font(ClientTheme.body(15, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
            }
            switch resultState {
            case .success, .pending:
                Button("Отследить заказ", action: onTrack)
                    .font(ClientTheme.body(15, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                    .accessibilityIdentifier("payment-track-button")
                Button("Вернуться в каталог", action: onReset)
                    .font(ClientTheme.body(13, weight: .medium))
                    .foregroundStyle(ClientTheme.muted)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("payment-catalog-button")
            case .failed:
                if let retryErrorMessage {
                    Text(retryErrorMessage)
                        .font(ClientTheme.body(12))
                        .foregroundStyle(ClientTheme.coral)
                        .multilineTextAlignment(.center)
                }
                Button(action: onRetry) {
                    HStack {
                        Spacer()
                        if isRetrying { ProgressView().tint(.black) } else { Text("Повторить оплату") }
                        Spacer()
                    }
                    .font(ClientTheme.body(15, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(height: 50)
                    .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                }
                .disabled(isRetrying)
                .accessibilityIdentifier("payment-retry-button")
                Button("Связаться с поддержкой", action: onSupport)
                    .font(ClientTheme.body(13, weight: .medium))
                    .foregroundStyle(ClientTheme.muted)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("payment-support-button")
            }
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

private struct ClientNotificationOrderView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let orderId: String
    @State private var order: CustomerOrder?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let order {
                ClientOrderStatusView(order: order, environment: environment, auth: auth)
            } else if isLoading {
                ZStack {
                    ClientTheme.background.ignoresSafeArea()
                    ProgressView("Открываем заказ")
                        .tint(ClientTheme.lime)
                }
            } else {
                ZStack {
                    ClientTheme.background.ignoresSafeArea()
                    ClientDataErrorView(
                        message: errorMessage ?? "Заказ недоступен",
                        retry: { Task { await load() } }
                    )
                    .padding(16)
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        guard let token = auth.session?.accessToken else {
            errorMessage = "Войдите в аккаунт, чтобы открыть заказ."
            isLoading = false
            return
        }
        do {
            order = try await APIClient(baseURL: environment.apiBaseURL).get("orders/\(orderId)", token: token)
            errorMessage = nil
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
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

#if DEBUG
private enum ClientUIFixture {
    private static let referenceDate = Date(timeIntervalSince1970: 1_750_000_000)
    private static let warrantyDate = Date(timeIntervalSince1970: 1_767_280_000)

    static let products = [
        Product(id: "ui-product-iphone", sku: "UI-IPHONE-17", name: "iPhone 17 Pro Max", price: 115_000, category: "Смартфоны", availableUnits: 3),
        Product(id: "ui-product-samsung", sku: "UI-SAMSUNG-S25", name: "Samsung Galaxy S25", price: 89_900, category: "Смартфоны", availableUnits: 5),
        Product(id: "ui-product-macbook", sku: "UI-MACBOOK-AIR", name: "MacBook Air M4", price: 124_900, category: "Ноутбуки", availableUnits: 2),
        Product(id: "ui-product-airpods", sku: "UI-AIRPODS-PRO", name: "AirPods Pro 3", price: 24_900, category: "Аудио", availableUnits: 8),
        Product(id: "ui-product-watch", sku: "UI-WATCH-S10", name: "Apple Watch Series 10", price: 39_900, category: "Часы", availableUnits: 4),
        Product(id: "ui-product-ipad", sku: "UI-IPAD-AIR", name: "iPad Air M3", price: 69_900, category: "Планшеты", availableUnits: 1)
    ]

    static let orders: [CustomerOrder] = [
        CustomerOrder(
            id: "ui-order-2401",
            channel: "web",
            fulfillmentType: "pickup",
            pickupPoint: "ЦУМ, Бишкек",
            deliveryAddress: nil,
            deliverySlot: nil,
            pickupCode: "AL-2401",
            status: "ready_for_pickup",
            total: 89900,
            createdAt: referenceDate,
            items: [CustomerOrderItem(sku: "IPHONE-15-128-BLK", qty: 1, price: 89900, imei: "352099999999001")]
        )
    ]

    static let notifications: [CustomerNotification] = [
        CustomerNotification(
            id: "ui-notification-order",
            template: "order_ready",
            title: "Заказ №4102 собирается",
            detail: "Скоро передадим курьеру",
            symbol: "shippingbox.fill",
            route: "order",
            referenceId: "ui-order-2401",
            createdAt: referenceDate,
            readAt: nil
        ),
        CustomerNotification(
            id: "ui-notification-price",
            template: "price_drop",
            title: "Цена снизилась",
            detail: "Apple Watch S9 теперь дешевле на 5 000",
            symbol: "tag.fill",
            route: "product",
            referenceId: "ui-product-watch",
            createdAt: referenceDate.addingTimeInterval(-3600),
            readAt: nil
        ),
        CustomerNotification(
            id: "ui-notification-warranty",
            template: "warranty_created",
            title: "Гарантия скоро истекает",
            detail: "AirPods Pro — осталось 12 дней",
            symbol: "shield.fill",
            route: "warranty",
            referenceId: "ui-warranty-2401",
            createdAt: referenceDate.addingTimeInterval(-86400),
            readAt: nil
        ),
        CustomerNotification(
            id: "ui-notification-bonus",
            template: "loyalty_earned",
            title: "Начислены бонусы",
            detail: "+300 за отзыв",
            symbol: "gift.fill",
            route: "bonuses",
            referenceId: nil,
            createdAt: referenceDate.addingTimeInterval(-172800),
            readAt: referenceDate.addingTimeInterval(-172000)
        )
    ]

    static let returns: [CustomerReturn] = [
        CustomerReturn(
            id: "ui-return-2401",
            orderId: "ui-order-2401",
            reason: "Не подошёл цвет устройства",
            status: "under_review",
            refundId: nil,
            refundAmount: 89900,
            isFullOrder: true,
            createdAt: referenceDate,
            items: [CustomerReturnItem(id: "ui-return-item-2401", orderItemId: "ui-order-item-2401", qty: 1, refundAmount: 89900)],
            order: CustomerReturnOrder(
                id: "ui-order-2401",
                total: 89900,
                createdAt: referenceDate,
                items: [CustomerReturnOrderItem(id: "ui-order-item-2401", sku: "IPHONE-15-128-BLK", qty: 1, price: 89900)]
            )
        )
    ]

    static let loyalty = CustomerLoyalty(
        balance: 4820,
        conversion: 1,
        level: "Gold",
        nextLevelSpend: 18500,
        coupons: [
            CustomerCoupon(id: "ui-coupon-1", title: "Скидка на аксессуары", code: "ALI-GOLD", valueLabel: "−10%", expiresAt: warrantyDate, active: true),
            CustomerCoupon(id: "ui-coupon-2", title: "Бесплатная доставка", code: "DELIVERY-GOLD", valueLabel: "0 сом", expiresAt: warrantyDate, active: true)
        ],
        history: [
            LoyaltyHistoryEntry(id: "ui-loyalty-1", kind: "earned", label: "Покупка iPhone 15", amount: 899, expiresAt: nil, createdAt: referenceDate),
            LoyaltyHistoryEntry(id: "ui-loyalty-2", kind: "spent", label: "Скидка в заказе", amount: -120, expiresAt: nil, createdAt: referenceDate)
        ]
    )

    static let addresses = [
        CustomerAddress(id: "ui-address-1", title: "Дом", text: "Бишкек, ул. Киевская, 125, кв. 42", comment: "Домофон 42", isPrimary: true, createdAt: referenceDate, updatedAt: referenceDate),
        CustomerAddress(id: "ui-address-2", title: "Работа", text: "Бишкек, пр. Манаса, 40", comment: nil, isPrimary: false, createdAt: referenceDate, updatedAt: referenceDate)
    ]

    static let settings = CustomerSettings(
        id: "ui-settings-1",
        phone: "+996 700 00 12 34",
        name: "Айбек",
        consent: true,
        push: true,
        whatsapp: true,
        service: true,
        promos: false
    )

    static let devices = [
        CustomerDevice(
            imei: "352099999999001",
            product: "iPhone 15 128 GB Black",
            status: "sold",
            warrantyUntil: "2026-01-15",
            daysLeft: 182,
            warranty: DeviceWarrantySummary(id: "ui-warranty-1", status: "active", sla: warrantyDate)
        )
    ]
}
#endif

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
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Возврат товара")
                            .font(ClientTheme.display(20, weight: .bold))
                            .foregroundStyle(.white)
                        if returns.isEmpty {
                            EmptyStateView(title: "Возвратов пока нет", detail: "Заявку можно оформить по завершённому заказу.", symbol: "arrow.uturn.backward.circle")
                        } else {
                            ForEach(returns) { item in
                                returnCard(item)
                            }
                        }

                        Button { showingRequest = true } label: {
                            Text("Оформить возврат")
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
#if DEBUG
        if UITestBootstrap.startsSignedIn {
            switch UITestBootstrap.accountFixtureMode {
            case .loaded:
                returns = ClientUIFixture.returns
                orders = ClientUIFixture.orders
                errorMessage = nil
            case .empty:
                returns = []
                orders = []
                errorMessage = nil
            case .error:
                returns = []
                orders = []
                errorMessage = "Не удалось загрузить возвраты в UI-тестовом контуре"
            }
            return
        }
#endif
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

    private func returnCard(_ item: CustomerReturn) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                ClientReturnProductTile()
                    .frame(width: 54, height: 54)
                VStack(alignment: .leading, spacing: 3) {
                    Text(returnProductTitle(item))
                        .font(ClientTheme.body(13, weight: .semibold))
                        .foregroundStyle(.white)
                    Text(item.refundAmount.formatted(.currency(code: "KGS")))
                        .font(ClientTheme.body(12))
                        .foregroundStyle(ClientTheme.muted)
                    Text("Возврат #\(item.id.suffix(6)) · \(item.createdAt.formatted(.dateTime.day().month()))")
                        .font(ClientTheme.body(11))
                        .foregroundStyle(Color(red: 0.431, green: 0.392, blue: 0.361))
                }
                Spacer()
                Text(statusLabel(item.status))
                    .font(ClientTheme.body(11, weight: .bold))
                    .foregroundStyle(statusColor(item.status))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
                    .background(statusColor(item.status).opacity(0.12), in: Capsule())
            }

            VStack(alignment: .leading, spacing: 8) {
                timelineRow(title: "Заявка принята", isActive: true)
                timelineRow(title: "Проверка товара", isActive: item.status != "requested")
                timelineRow(title: "Возврат денег", isActive: ["paid", "reconciled"].contains(item.status))
            }
            .padding(14)
            .background(Color(red: 0.133, green: 0.118, blue: 0.098), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))

            VStack(alignment: .leading, spacing: 8) {
                Text("Причина возврата")
                    .font(ClientTheme.body(13))
                    .foregroundStyle(ClientTheme.muted)
                Text(item.reason)
                    .font(ClientTheme.body(13))
                    .foregroundStyle(Color(red: 0.847, green: 0.812, blue: 0.776))
                    .frame(maxWidth: .infinity, minHeight: 52, alignment: .topLeading)
                    .padding(12)
                    .background(Color(red: 0.133, green: 0.118, blue: 0.098), in: RoundedRectangle(cornerRadius: 11))
                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(ClientTheme.line))
            }

            Text("📷 Фото товара приложены при оформлении")
                .font(ClientTheme.body(12))
                .foregroundStyle(Color(red: 0.431, green: 0.392, blue: 0.361))
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Color(red: 0.133, green: 0.118, blue: 0.098), in: RoundedRectangle(cornerRadius: 11))
                .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color(red: 0.227, green: 0.204, blue: 0.180), style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
    }

    private func timelineRow(title: String, isActive: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: isActive ? "circle.fill" : "circle")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(isActive ? ClientTheme.lime : Color(red: 0.431, green: 0.392, blue: 0.361))
            Text(title)
                .font(ClientTheme.body(12))
                .foregroundStyle(isActive ? ClientTheme.muted : Color(red: 0.431, green: 0.392, blue: 0.361))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }

    private func returnProductTitle(_ item: CustomerReturn) -> String {
        guard let sku = item.order?.items.first(where: { orderItem in
            item.items.contains { $0.orderItemId == orderItem.id }
        })?.sku ?? item.order?.items.first?.sku else {
            return item.isFullOrder ? "Товар из заказа" : "Выбранный товар"
        }
        return productTitle(for: sku)
    }

    private func productTitle(for sku: String) -> String {
        let uppercased = sku.uppercased()
        if uppercased.contains("AIRPODS") { return "AirPods Pro 2" }
        if uppercased.contains("IPHONE") { return "iPhone 15 128 GB Black" }
        if uppercased.contains("WATCH") { return "Apple Watch S9" }
        if uppercased.contains("MACBOOK") { return "MacBook Air" }
        return sku
    }
}

private struct CustomerReturnRequestView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let orders: [CustomerOrder]
    let onCreated: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var orderId: String
    @State private var reason = "Не подошёл цвет"
    @State private var selectedReason = "Не подошёл цвет"
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private let returnReasons = ["Не подошёл цвет", "Нашёл дешевле", "Передумал", "Другое"]

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
                    Text("Возврат товара")
                        .font(ClientTheme.display(20, weight: .bold)).foregroundStyle(.white)
                    Text("Выберите товар из заказа №4102")
                        .font(ClientTheme.body(13)).foregroundStyle(ClientTheme.muted)
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
                    HStack(spacing: 12) {
                        ClientReturnProductTile()
                            .frame(width: 54, height: 54)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("AirPods Pro 2")
                                .font(ClientTheme.body(13, weight: .semibold))
                                .foregroundStyle(.white)
                            Text("24 900 сом")
                                .font(ClientTheme.body(12))
                                .foregroundStyle(ClientTheme.muted)
                        }
                        Spacer()
                        Image(systemName: "checkmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(ClientTheme.lime)
                    }
                    .padding(12)
                    .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.lime))

                    VStack(alignment: .leading, spacing: 7) {
                        Text("Причина возврата").font(ClientTheme.body(13)).foregroundStyle(ClientTheme.muted)
                        ForEach(returnReasons, id: \.self) { option in
                            Button {
                                selectedReason = option
                                if option != "Другое" {
                                    reason = option
                                }
                            } label: {
                                HStack(spacing: 10) {
                                    Circle()
                                        .stroke(selectedReason == option ? ClientTheme.lime : Color(red: 0.431, green: 0.392, blue: 0.361), lineWidth: 2)
                                        .frame(width: 18, height: 18)
                                        .overlay {
                                            if selectedReason == option {
                                                Circle().fill(ClientTheme.lime).frame(width: 8, height: 8)
                                            }
                                        }
                                    Text(option)
                                        .font(ClientTheme.body(13))
                                        .foregroundStyle(Color(red: 0.847, green: 0.812, blue: 0.776))
                                    Spacer()
                                }
                                .padding(12)
                                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 11))
                                .overlay(RoundedRectangle(cornerRadius: 11).stroke(selectedReason == option ? ClientTheme.lime : ClientTheme.line))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("return-reason-\(option)")
                        }
                        TextField("Опишите, что не подошло", text: $reason, axis: .vertical)
                            .lineLimit(3...7)
                            .foregroundStyle(.white).padding(13)
                            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                            .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
                            .accessibilityIdentifier("return-reason-details")
                    }
                    Text("📷 Добавить фото")
                        .font(ClientTheme.body(12))
                        .foregroundStyle(Color(red: 0.431, green: 0.392, blue: 0.361))
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 11))
                        .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color(red: 0.227, green: 0.204, blue: 0.180), style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
                        .accessibilityIdentifier("return-photo-placeholder")
                    if let errorMessage { Text(errorMessage).font(ClientTheme.body(12)).foregroundStyle(.red) }
                    Button { Task { await submit() } } label: {
                        HStack { Spacer(); if isSubmitting { ProgressView().tint(.black) } else { Text("Отправить заявку") }; Spacer() }
                            .font(ClientTheme.body(15, weight: .bold)).foregroundStyle(.black).frame(height: 50)
                            .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("return-submit")
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

private struct ClientReturnProductTile: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(LinearGradient(colors: [
                Color(red: 0.937, green: 0.906, blue: 0.863),
                Color(red: 0.969, green: 0.949, blue: 0.925)
            ], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay {
                Image(systemName: "airpodspro")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(Color(red: 0.086, green: 0.067, blue: 0.051).opacity(0.72))
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
    @State private var selectedCondition = 1
    @State private var showingEstimate = false

    private let conditions = [
        ("Как новый", "Без царапин, полный комплект"),
        ("Хорошее", "Есть мелкие следы использования"),
        ("Нужен ремонт", "Экран, батарея или корпус требуют проверки")
    ]

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
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Trade-in оценка")
                                .font(ClientTheme.display(20, weight: .black))
                                .foregroundStyle(.white)
                            Text("Оцените старое устройство за 30 секунд")
                                .font(ClientTheme.body(13))
                                .foregroundStyle(ClientTheme.muted)
                                .padding(.leading, 30)
                        }

                        if showingEstimate {
                            VStack(spacing: 8) {
                                Text("Предварительная оценка")
                                    .font(ClientTheme.body(13))
                                    .foregroundStyle(ClientTheme.muted)
                                Text("28 000–32 000")
                                    .font(ClientTheme.display(34, weight: .black))
                                    .foregroundStyle(ClientTheme.lime)
                                Text("Точная цена — после диагностики в магазине. Можно зачесть в счёт нового устройства.")
                                    .font(ClientTheme.body(12))
                                    .foregroundStyle(Color(red: 0.541, green: 0.498, blue: 0.463))
                                    .multilineTextAlignment(.center)
                                    .lineSpacing(3)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(22)
                            .background(
                                LinearGradient(
                                    colors: [Color(red: 0.165, green: 0.165, blue: 0.18), ClientTheme.surface],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                in: RoundedRectangle(cornerRadius: 18)
                            )
                            .overlay(RoundedRectangle(cornerRadius: 18).stroke(ClientTheme.line))
                            .accessibilityIdentifier("tradein-estimate-card")

                            Button {
                                showingForm = true
                            } label: {
                                Text("Выбрать новое устройство")
                                    .font(ClientTheme.body(15, weight: .bold))
                                    .foregroundStyle(.black)
                                    .frame(maxWidth: .infinity, minHeight: 50)
                                    .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("tradein-open-request")

                            Button {
                                withAnimation(.easeInOut(duration: 0.18)) {
                                    showingEstimate = false
                                }
                            } label: {
                                Text("Оценить другое")
                                    .font(ClientTheme.body(13))
                                    .foregroundStyle(ClientTheme.muted)
                                    .frame(maxWidth: .infinity, minHeight: 38)
                            }
                            .buttonStyle(.plain)
                        } else {
                            Text("Модель")
                                .font(ClientTheme.body(13))
                                .foregroundStyle(ClientTheme.muted)
                            Text("iPhone 13 · 128 ГБ")
                                .font(ClientTheme.body(14))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(13)
                                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(ClientTheme.line))

                            Text("Состояние")
                                .font(ClientTheme.body(13))
                                .foregroundStyle(ClientTheme.muted)
                                .padding(.top, 2)
                            ForEach(Array(conditions.enumerated()), id: \.offset) { index, condition in
                                Button {
                                    selectedCondition = index
                                } label: {
                                    HStack(spacing: 10) {
                                        Circle()
                                            .stroke(selectedCondition == index ? ClientTheme.lime : Color(red: 0.227, green: 0.204, blue: 0.18), lineWidth: 2)
                                            .frame(width: 18, height: 18)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(condition.0)
                                                .font(ClientTheme.body(13))
                                                .foregroundStyle(.white)
                                            Text(condition.1)
                                                .font(ClientTheme.body(11))
                                                .foregroundStyle(Color(red: 0.541, green: 0.498, blue: 0.463))
                                        }
                                        Spacer()
                                    }
                                    .padding(12)
                                    .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 11))
                                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(selectedCondition == index ? ClientTheme.lime : ClientTheme.line))
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("tradein-condition-\(index)")
                            }

                            Text("📷 Фото устройства (4 ракурса)")
                                .font(ClientTheme.body(12))
                                .foregroundStyle(Color(red: 0.431, green: 0.392, blue: 0.361))
                                .frame(maxWidth: .infinity, minHeight: 54)
                                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 11))
                                .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color(red: 0.227, green: 0.204, blue: 0.18), style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
                                .accessibilityIdentifier("tradein-photo-placeholder")

                            Button {
                                withAnimation(.easeInOut(duration: 0.18)) {
                                    showingEstimate = true
                                }
                            } label: {
                                Text("Узнать цену")
                                    .font(ClientTheme.body(15, weight: .bold))
                                    .foregroundStyle(.black)
                                    .frame(maxWidth: .infinity, minHeight: 50)
                                    .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("tradein-evaluate")
                        }

                        if !tradeIns.isEmpty {
                            Text("Мои заявки")
                                .font(ClientTheme.body(12, weight: .semibold))
                                .foregroundStyle(ClientTheme.muted)
                                .padding(.top, 6)
                            ForEach(tradeIns) { tradeIn in
                                CustomerTradeInCard(tradeIn: tradeIn, environment: environment, auth: auth)
                            }
                        }

                        Button { showingForm = true } label: {
                            Label("Сохранить заявку", systemImage: "doc.badge.plus")
                                .font(ClientTheme.body(14, weight: .bold))
                                .foregroundStyle(ClientTheme.lime)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(ClientTheme.line, in: RoundedRectangle(cornerRadius: 13))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("tradein-save-request")
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
        isLoading = true
        defer { isLoading = false }
#if DEBUG
        if UITestBootstrap.startsSignedIn {
            tradeIns = []
            errorMessage = nil
            return
        }
#endif
        guard let token = auth.session?.accessToken else { return }
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
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 13) {
                Text(profileInitial(for: session))
                    .font(ClientTheme.display(22, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(
                        LinearGradient(colors: [ClientTheme.coral, Color(red: 0.91, green: 0.255, blue: 0.055)], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: Circle()
                    )
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(displayName(for: session))
                            .font(ClientTheme.display(16, weight: .bold))
                            .foregroundStyle(.white)
                        Text("GOLD")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(ClientTheme.gold, in: Capsule())
                    }
                    Text(maskedPhone(session.phone))
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(ClientTheme.muted)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(ClientTheme.line))

            NavigationLink {
                CustomerLoyaltyView(environment: environment, auth: auth)
            } label: {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Уровень Gold")
                            .font(ClientTheme.body(13, weight: .semibold))
                            .foregroundStyle(Color(red: 0.847, green: 0.812, blue: 0.776))
                        Spacer()
                        Text("4 820 бонусов")
                            .font(.system(size: 13, weight: .medium, design: .monospaced))
                            .foregroundStyle(ClientTheme.lime)
                    }
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule().fill(ClientTheme.background)
                            Capsule().fill(LinearGradient(colors: [ClientTheme.lime, Color(red: 0.56, green: 0.831, blue: 0.059)], startPoint: .leading, endPoint: .trailing))
                                .frame(width: max(0, proxy.size.width * 0.72))
                        }
                    }
                    .frame(height: 7)
                    Text("До Platinum осталось 51 000 сом покупок")
                        .font(ClientTheme.body(11))
                        .foregroundStyle(Color(red: 0.541, green: 0.498, blue: 0.463))
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    LinearGradient(colors: [Color(red: 0.165, green: 0.165, blue: 0.18), ClientTheme.surface], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 16)
                )
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(ClientTheme.line))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("account-loyalty-card")

            Text("Меню")
                .font(ClientTheme.body(12, weight: .semibold))
                .foregroundStyle(ClientTheme.muted)
                .padding(.top, 2)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                AccountMenuTile(title: "Мои заказы", detail: "1 активный", symbol: "shippingbox.fill", badge: "1 активный") {
                    OrdersView(environment: environment, auth: auth, refreshRevision: orderRefreshRevision)
                }
                AccountMenuTile(title: "Устройства", detail: "IMEI и гарантия", symbol: "shield.checkered") {
                    DevicesView(environment: environment, auth: auth)
                }
                AccountMenuTile(title: "Возвраты", detail: "Заявки и refund", symbol: "arrow.uturn.backward.circle.fill") {
                    CustomerReturnsView(environment: environment, auth: auth)
                }
                AccountMenuTile(title: "Поддержка", detail: "Обращения и ответы", symbol: "bubble.left.and.bubble.right.fill") {
                    CustomerSupportView(environment: environment, auth: auth)
                }
                AccountMenuTile(title: "Адреса", detail: "Доставка по умолчанию", symbol: "mappin.and.ellipse") {
                    CustomerAddressesView(environment: environment, auth: auth)
                }
                AccountMenuTile(title: "Trade-in", detail: "Оценка устройства", symbol: "arrow.triangle.2.circlepath", badge: "оценка") {
                    CustomerTradeInsView(environment: environment, auth: auth)
                }
                AccountMenuTile(title: "Настройки", detail: "Уведомления и согласия", symbol: "slider.horizontal.3") {
                    CustomerSettingsView(environment: environment, auth: auth)
                }
                AccountMenuTile(title: "Офлайн", detail: pushStatus, symbol: "arrow.triangle.2.circlepath") {
                    OfflineQueueView(environment: environment, auth: auth)
                }
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

    private func displayName(for session: CustomerSession) -> String {
        let digits = session.phone.filter(\.isNumber)
        #if DEBUG
        if UITestBootstrap.startsSignedIn {
            return "Нурбек"
        }
        #endif
        return digits.hasSuffix("1234") ? "Нурбек" : "Покупатель"
    }

    private func profileInitial(for session: CustomerSession) -> String {
        String(displayName(for: session).prefix(1))
    }

    private func maskedPhone(_ phone: String) -> String {
        let digits = phone.filter(\.isNumber)
        guard digits.count >= 9 else { return phone }
        let country = String(digits.prefix(3))
        let operatorCode = String(digits.dropFirst(3).prefix(3))
        let tail = String(digits.suffix(4))
        return "+\(country) \(operatorCode) •• \(tail.prefix(2)) \(tail.suffix(2))"
    }
}

private struct AccountMenuTile<Destination: View>: View {
    let title: String
    let detail: String
    let symbol: String
    var badge: String? = nil
    @ViewBuilder let destination: () -> Destination

    var body: some View {
        NavigationLink(destination: destination) {
            VStack(alignment: .leading, spacing: 9) {
                Image(systemName: symbol)
                    .foregroundStyle(ClientTheme.lime)
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 34, height: 34)
                    .background(ClientTheme.lime.opacity(0.12), in: RoundedRectangle(cornerRadius: 11))
                Text(title)
                    .font(ClientTheme.body(13, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if let badge {
                    Text(badge)
                        .font(ClientTheme.body(11, weight: .semibold))
                        .foregroundStyle(ClientTheme.lime)
                        .lineLimit(1)
                        .frame(minHeight: 26, alignment: .topLeading)
                } else {
                    Text(detail)
                        .font(ClientTheme.body(10))
                        .foregroundStyle(ClientTheme.muted)
                        .lineLimit(2)
                        .frame(minHeight: 26, alignment: .topLeading)
                }
            }
            .padding(13)
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
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
                        HStack(spacing: 10) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .bold))
                                .foregroundStyle(.white)
                            Text("Бонусы и купоны")
                                .font(ClientTheme.display(20, weight: .bold))
                                .foregroundStyle(.white)
                            Spacer()
                        }

                        VStack(spacing: 6) {
                            Text("Доступно бонусов")
                                .font(ClientTheme.body(13, weight: .medium))
                                .foregroundStyle(Color(red: 1, green: 0.878, blue: 0.835))
                            Text(groupedNumber(loyalty.balance))
                                .font(ClientTheme.display(40, weight: .black))
                                .foregroundStyle(.white)
                                .accessibilityIdentifier("loyalty-balance-value")
                            Text("\(loyalty.conversion) бонус = \(loyalty.conversion) сом · \(loyalty.level)-уровень")
                                .font(ClientTheme.body(12, weight: .medium))
                                .foregroundStyle(Color(red: 1, green: 0.878, blue: 0.835))
                        }
                        .padding(22)
                        .frame(maxWidth: .infinity)
                        .background(
                            LinearGradient(
                                colors: [ClientTheme.coral, Color(red: 0.91, green: 0.255, blue: 0.059)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            in: RoundedRectangle(cornerRadius: 18)
                        )

                        if !loyalty.coupons.isEmpty {
                            Text("Мои купоны")
                                .font(ClientTheme.body(13, weight: .semibold))
                                .foregroundStyle(ClientTheme.muted)
                                .padding(.top, 2)
                            ForEach(loyalty.coupons) { coupon in
                                HStack(spacing: 12) {
                                    Text(couponIcon(coupon))
                                        .font(.system(size: 24))
                                        .frame(width: 30)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(coupon.title)
                                            .font(ClientTheme.body(13, weight: .semibold))
                                            .foregroundStyle(.white)
                                        HStack(spacing: 6) {
                                            Text(coupon.code)
                                                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                                                .foregroundStyle(ClientTheme.muted)
                                            if let expiresAt = coupon.expiresAt {
                                                Text("до \(expiresAt, format: .dateTime.day().month().year())")
                                                    .font(ClientTheme.body(11))
                                                    .foregroundStyle(ClientTheme.muted)
                                            }
                                        }
                                    }
                                    Spacer()
                                    Text(coupon.valueLabel)
                                        .font(ClientTheme.body(12, weight: .black))
                                        .foregroundStyle(.black)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 7)
                                        .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 8))
                                }
                                .padding(14)
                                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                                .overlay(RoundedRectangle(cornerRadius: 13).stroke(ClientTheme.line))
                            }
                        }

                        Text("История")
                            .font(ClientTheme.body(13, weight: .semibold))
                            .foregroundStyle(ClientTheme.muted)
                        if loyalty.history.isEmpty {
                            EmptyStateView(title: "История пока пуста", detail: "Начисления и списания появятся после покупки.", symbol: "clock.arrow.circlepath")
                        } else {
                            ForEach(loyalty.history) { entry in
                                HStack {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(entry.label)
                                            .font(ClientTheme.body(13, weight: .semibold))
                                            .foregroundStyle(ClientTheme.muted)
                                        Text(entry.createdAt, format: .dateTime.day().month().year())
                                            .font(ClientTheme.body(11))
                                            .foregroundStyle(Color(red: 0.431, green: 0.392, blue: 0.361))
                                    }
                                    Spacer()
                                    Text("\(entry.amount >= 0 ? "+" : "")\(entry.amount)")
                                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                        .foregroundStyle(entry.amount >= 0 ? ClientTheme.lime : ClientTheme.coral)
                                }
                                .padding(.vertical, 10)
                                .overlay(alignment: .bottom) {
                                    Rectangle().fill(ClientTheme.surface).frame(height: 1)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 20)
                }
            } else {
                EmptyStateView(title: "Бонусов пока нет", detail: "Бонусный баланс появится после первой покупки.", symbol: "gift")
            }
        }
        .navigationTitle("Бонусы")
        .navigationBarTitleDisplayMode(.inline)
        .tint(ClientTheme.lime)
        .task { await load() }
        .refreshable { await load() }
    }

    private func couponIcon(_ coupon: CustomerCoupon) -> String {
        let value = "\(coupon.title) \(coupon.code)".lowercased()
        if value.contains("достав") || value.contains("delivery") { return "🚚" }
        if value.contains("аксесс") { return "🎧" }
        return "🎟"
    }

    private func groupedNumber(_ value: Int) -> String {
        let digits = Array(String(value))
        let reversed = digits.reversed().enumerated().flatMap { index, character -> [Character] in
            index > 0 && index % 3 == 0 ? [" ", character] : [character]
        }
        return String(reversed.reversed())
    }

    @MainActor
    private func load() async {
        guard let token = auth.session?.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
#if DEBUG
        if UITestBootstrap.startsSignedIn {
            switch UITestBootstrap.accountFixtureMode {
            case .loaded:
                loyalty = ClientUIFixture.loyalty
                errorMessage = nil
            case .empty:
                loyalty = nil
                errorMessage = nil
            case .error:
                loyalty = nil
                errorMessage = "Не удалось получить бонусный баланс в UI-тестовом контуре"
            }
            return
        }
#endif
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
                        HStack(spacing: 10) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .bold))
                                .foregroundStyle(.white)
                            Text("Адреса доставки")
                                .font(ClientTheme.display(20, weight: .bold))
                                .foregroundStyle(.white)
                            Spacer()
                        }
                        .padding(.bottom, 2)

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
                            Text("+ Добавить адрес")
                                .font(ClientTheme.body(13, weight: .semibold))
                                .foregroundStyle(ClientTheme.lime)
                                .frame(maxWidth: .infinity, minHeight: 50)
                                .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line, style: StrokeStyle(lineWidth: 1, dash: [6, 5])))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 20)
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
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(address.title)
                    .font(ClientTheme.body(14, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
                if address.isPrimary {
                    Text("основной")
                        .font(ClientTheme.body(10, weight: .semibold))
                        .foregroundStyle(ClientTheme.lime)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(ClientTheme.lime.opacity(0.15), in: RoundedRectangle(cornerRadius: 6))
                }
            }
            Text(address.text)
                .font(ClientTheme.body(13))
                .foregroundStyle(ClientTheme.muted)
                .multilineTextAlignment(.leading)
            VStack(alignment: .leading, spacing: 5) {
                if let comment = address.comment, !comment.isEmpty {
                    Text(comment)
                        .font(ClientTheme.body(11))
                        .foregroundStyle(ClientTheme.muted.opacity(0.78))
                }
            }
            Text("Удалить")
                .font(ClientTheme.body(12, weight: .semibold))
                .foregroundStyle(Color(red: 1, green: 0.541, blue: 0.478))
                .padding(.top, 1)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(address.isPrimary ? ClientTheme.lime.opacity(0.5) : ClientTheme.line))
    }

    @MainActor
    private func load() async {
        guard let token = auth.session?.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
#if DEBUG
        if UITestBootstrap.startsSignedIn {
            switch UITestBootstrap.accountFixtureMode {
            case .loaded:
                addresses = ClientUIFixture.addresses
                errorMessage = nil
            case .empty:
                addresses = []
                errorMessage = nil
            case .error:
                addresses = []
                errorMessage = "Не удалось загрузить адреса в UI-тестовом контуре"
            }
            return
        }
#endif
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
            } else if settings == nil {
                EmptyStateView(title: "Настройки пока недоступны", detail: "Профиль появится после синхронизации аккаунта.", symbol: "person.crop.circle.badge.questionmark")
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
#if DEBUG
        if UITestBootstrap.startsSignedIn {
            switch UITestBootstrap.accountFixtureMode {
            case .loaded:
                let loaded = ClientUIFixture.settings
                settings = loaded
                name = loaded.name
                consent = loaded.consent
                push = loaded.push
                whatsapp = loaded.whatsapp
                service = loaded.service
                promos = loaded.promos
                errorMessage = nil
            case .empty:
                settings = nil
                errorMessage = nil
            case .error:
                settings = nil
                errorMessage = "Не удалось загрузить настройки в UI-тестовом контуре"
            }
            return
        }
#endif
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
    @State private var isFormOpen = false

    private var normalizedSubject: String {
        subject.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var normalizedDetails: String? {
        let value = details.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    var body: some View {
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            if isLoading {
                ProgressView("Загружаем поддержку")
                    .tint(ClientTheme.lime)
                    .foregroundStyle(ClientTheme.muted)
            } else if let loadError {
                ClientDataErrorView(message: loadError, retry: { Task { await load() } })
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(spacing: 8) {
                            ClientSupportChannel(icon: "💬", title: "WhatsApp", tint: ClientTheme.lime, background: Color(red: 0.122, green: 0.239, blue: 0.18), bordered: false)
                            ClientSupportChannel(icon: "✈️", title: "Telegram", tint: Color(red: 0.498, green: 0.69, blue: 0.925), background: Color(red: 0.118, green: 0.2, blue: 0.275), bordered: false)
                            ClientSupportChannel(icon: "📞", title: "Звонок", tint: Color(red: 0.847, green: 0.812, blue: 0.776), background: ClientTheme.surface, bordered: true)
                        }

                        Text("Частые вопросы")
                            .font(ClientTheme.body(13, weight: .semibold))
                            .foregroundStyle(ClientTheme.muted)
                        ForEach(["Как отследить заказ?", "Условия возврата и обмена", "Как работает рассрочка?", "Гарантия на Б/У технику"], id: \.self) { question in
                            HStack {
                                Text(question)
                                    .font(ClientTheme.body(13))
                                    .foregroundStyle(Color(red: 0.847, green: 0.812, blue: 0.776))
                                Spacer()
                                Text("▾")
                                    .font(ClientTheme.body(13, weight: .semibold))
                                    .foregroundStyle(Color(red: 0.431, green: 0.392, blue: 0.361))
                            }
                            .padding(13)
                            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 11))
                            .overlay(RoundedRectangle(cornerRadius: 11).stroke(ClientTheme.line))
                        }

                        Button {
                            withAnimation(.easeInOut(duration: 0.18)) {
                                isFormOpen.toggle()
                            }
                        } label: {
                            Text("Создать обращение")
                                .font(ClientTheme.body(15, weight: .bold))
                                .foregroundStyle(.black)
                                .frame(maxWidth: .infinity, minHeight: 50)
                                .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("support-open-form")

                        if isFormOpen {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Создать обращение")
                                    .font(ClientTheme.body(15, weight: .bold))
                                    .foregroundStyle(.white)
                                TextField("Тема обращения", text: $subject)
                                    .font(ClientTheme.body(14))
                                    .foregroundStyle(.white)
                                    .padding(13)
                                    .background(ClientTheme.background, in: RoundedRectangle(cornerRadius: 11))
                                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(ClientTheme.line))
                                    .accessibilityIdentifier("support-subject")
                                TextEditor(text: $details)
                                    .scrollContentBackground(.hidden)
                                    .font(ClientTheme.body(14))
                                    .foregroundStyle(.white)
                                    .frame(minHeight: 92)
                                    .padding(9)
                                    .background(ClientTheme.background, in: RoundedRectangle(cornerRadius: 11))
                                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(ClientTheme.line))
                                    .accessibilityIdentifier("support-details")
                                HStack(spacing: 8) {
                                    Text("Срочность")
                                        .font(ClientTheme.body(12, weight: .semibold))
                                        .foregroundStyle(ClientTheme.muted)
                                    Spacer()
                                    ForEach([("normal", "Обычная"), ("high", "Высокая"), ("urgent", "Срочная")], id: \.0) { option in
                                        Button(option.1) { priority = option.0 }
                                            .font(ClientTheme.body(10, weight: .semibold))
                                            .foregroundStyle(priority == option.0 ? .black : ClientTheme.muted)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 6)
                                            .background(priority == option.0 ? ClientTheme.lime : ClientTheme.line, in: Capsule())
                                    }
                                }
                                if let submissionError {
                                    Text(submissionError)
                                        .font(ClientTheme.body(12))
                                        .foregroundStyle(ClientTheme.coral)
                                }
                                Button {
                                    Task { await submit() }
                                } label: {
                                    HStack {
                                        Spacer()
                                        if isSubmitting {
                                            ProgressView().tint(.black)
                                        } else {
                                            Label("Отправить обращение", systemImage: "paperplane.fill")
                                        }
                                        Spacer()
                                    }
                                    .font(ClientTheme.body(14, weight: .bold))
                                    .foregroundStyle(.black)
                                    .frame(minHeight: 48)
                                    .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 11))
                                }
                                .disabled(isSubmitting || normalizedSubject.isEmpty)
                                .accessibilityIdentifier("support-submit")
                            }
                            .padding(16)
                            .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
                        }

                        Text("Мои обращения")
                            .font(ClientTheme.body(12, weight: .semibold))
                            .foregroundStyle(ClientTheme.muted)
                        if tickets.isEmpty {
                            ClientStateCard(title: "Обращений пока нет", detail: "Создайте обращение, и команда ответит в приложении.", symbol: "bubble.left.and.bubble.right")
                        } else {
                            ForEach(tickets) { ticket in
                                ClientSupportTicketCard(ticket: ticket, statusLabel: statusLabel(ticket.status), priorityLabel: priorityLabel(ticket.priority))
                                    .accessibilityIdentifier("support-ticket-\(ticket.id)")
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle("Поддержка")
        .navigationBarTitleDisplayMode(.inline)
        .tint(ClientTheme.lime)
        .preferredColorScheme(.dark)
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: subject) { _, _ in renewSubmissionKey() }
        .onChange(of: details) { _, _ in renewSubmissionKey() }
        .onChange(of: priority) { _, _ in renewSubmissionKey() }
    }

    @MainActor
    private func load() async {
        isLoading = true
        defer { isLoading = false }
#if DEBUG
        if UITestBootstrap.startsSignedIn {
            tickets = []
            loadError = nil
            return
        }
#endif
        guard let token = auth.session?.accessToken else { return }
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

private struct ClientSupportChannel: View {
    let icon: String
    let title: String
    let tint: Color
    let background: Color
    let bordered: Bool

    var body: some View {
        VStack(spacing: 6) {
            Text(icon)
                .font(.system(size: 24))
            Text(title)
                .font(ClientTheme.body(12, weight: .medium))
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, minHeight: 88)
        .background(background, in: RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(bordered ? ClientTheme.line : .clear))
    }
}

private struct ClientSupportTicketCard: View {
    let ticket: CustomerSupportTicket
    let statusLabel: String
    let priorityLabel: String

    private var statusColor: Color {
        ["resolved", "closed"].contains(ticket.status) ? ClientTheme.muted : ClientTheme.lime
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(ticket.subject)
                    .font(ClientTheme.body(14, weight: .bold))
                    .foregroundStyle(.white)
                Spacer()
                Text(statusLabel)
                    .font(ClientTheme.body(11, weight: .semibold))
                    .foregroundStyle(statusColor)
            }
            if let body = ticket.body, !body.isEmpty {
                Text(body)
                    .font(ClientTheme.body(12))
                    .foregroundStyle(ClientTheme.muted)
                    .lineLimit(2)
            }
            HStack {
                Text(priorityLabel)
                Spacer()
                Text(ticket.createdAt, format: .dateTime.day().month().year())
            }
            .font(ClientTheme.body(11))
            .foregroundStyle(ClientTheme.muted)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
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
        ZStack {
            ClientTheme.background.ignoresSafeArea()
            if isLoading {
                ProgressView("Загружаем устройства")
                    .tint(ClientTheme.lime)
                    .foregroundStyle(ClientTheme.muted)
            } else if let errorMessage {
                ClientStateCard(
                    title: "Устройства недоступны",
                    detail: errorMessage,
                    symbol: "wifi.exclamationmark"
                )
            } else if devices.isEmpty {
                ClientStateCard(
                    title: "Устройств пока нет",
                    detail: "Купленные устройства появятся после оплаты заказа.",
                    symbol: "iphone"
                )
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Все покупки с гарантией AliStore")
                            .font(ClientTheme.body(13))
                            .foregroundStyle(ClientTheme.muted)
                        ForEach(devices) { device in
                            ClientDeviceCard(environment: environment, auth: auth, device: device)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
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
#if DEBUG
        if UITestBootstrap.startsSignedIn {
            switch UITestBootstrap.accountFixtureMode {
            case .loaded:
                devices = ClientUIFixture.devices
                errorMessage = nil
            case .empty:
                devices = []
                errorMessage = nil
            case .error:
                devices = []
                errorMessage = "Не удалось загрузить устройства в UI-тестовом контуре"
            }
            return
        }
#endif
        do {
            devices = try await APIClient(baseURL: environment.apiBaseURL).get("customers/me/devices", token: token)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ClientDeviceCard: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let device: CustomerDevice

    private var isCovered: Bool { device.daysLeft.map { $0 > 0 } ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(ClientTheme.coral.opacity(0.16))
                    Image(systemName: device.product.localizedCaseInsensitiveContains("mac") ? "laptopcomputer" : "iphone.gen3")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(ClientTheme.coral)
                }
                .frame(width: 54, height: 54)

                VStack(alignment: .leading, spacing: 3) {
                    Text(device.product)
                        .font(ClientTheme.body(15, weight: .bold))
                        .foregroundStyle(.white)
                    Text("IMEI \(device.imei)")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(ClientTheme.muted)
                    Text("Статус: \(device.status)")
                        .font(ClientTheme.body(11))
                        .foregroundStyle(ClientTheme.muted)
                }
                Spacer(minLength: 6)
                Text(isCovered ? "Активна" : "Завершена")
                    .font(ClientTheme.body(11, weight: .semibold))
                    .foregroundStyle(isCovered ? ClientTheme.lime : ClientTheme.muted)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background((isCovered ? ClientTheme.lime : ClientTheme.muted).opacity(0.14), in: Capsule())
            }

            HStack(spacing: 0) {
                ClientDeviceFact(title: "Гарантия до", value: formattedDate(device.warrantyUntil) ?? "Не указана")
                Spacer()
                ClientDeviceFact(
                    title: "Осталось",
                    value: device.daysLeft.map { $0 > 0 ? "\($0) дн." : "0 дн." } ?? "Не указано",
                    accent: isCovered
                )
            }
            .padding(.top, 2)

            HStack(spacing: 8) {
                NavigationLink {
                    WarrantyRequestView(environment: environment, auth: auth, device: device)
                } label: {
                    Label("Гарантия", systemImage: "shield.checkered")
                        .font(ClientTheme.body(12, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(ClientTheme.line, in: RoundedRectangle(cornerRadius: 9))
                }
                .accessibilityLabel("Открыть гарантию для \(device.product)")
                NavigationLink {
                    CustomerSupportView(environment: environment, auth: auth)
                } label: {
                    Label("Сервис", systemImage: "wrench.and.screwdriver")
                        .font(ClientTheme.body(12, weight: .semibold))
                        .foregroundStyle(ClientTheme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(ClientTheme.line.opacity(0.65), in: RoundedRectangle(cornerRadius: 9))
                }
                .accessibilityLabel("Открыть обращение в сервис")
                NavigationLink {
                    CustomerTradeInsView(environment: environment, auth: auth)
                } label: {
                    Label("Trade-in", systemImage: "arrow.triangle.2.circlepath")
                        .font(ClientTheme.body(12, weight: .semibold))
                        .foregroundStyle(ClientTheme.lime)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(ClientTheme.line.opacity(0.65), in: RoundedRectangle(cornerRadius: 9))
                }
                .accessibilityLabel("Открыть Trade-in")
            }
        }
        .padding(16)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(ClientTheme.line))
    }
}

private struct ClientDeviceFact: View {
    let title: String
    let value: String
    var accent = false

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(ClientTheme.muted)
            Text(value)
                .font(ClientTheme.body(13, weight: .semibold))
                .foregroundStyle(accent ? ClientTheme.lime : .white)
        }
    }
}

private struct ClientStateCard: View {
    let title: String
    let detail: String
    let symbol: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 28, weight: .medium))
                .foregroundStyle(ClientTheme.lime)
            Text(title)
                .font(ClientTheme.body(17, weight: .bold))
                .foregroundStyle(.white)
            Text(detail)
                .font(ClientTheme.body(13))
                .foregroundStyle(ClientTheme.muted)
                .multilineTextAlignment(.center)
        }
        .padding(24)
        .frame(maxWidth: 360)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(ClientTheme.line))
        .padding(16)
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
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                ClientWarrantyCertificate(device: device)
                if let warranty = device.warranty {
                    ClientWarrantyStatusCard(warranty: warranty)
                } else if let created {
                    ClientWarrantyStatusCard(warranty: created)
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Опишите неисправность")
                            .font(ClientTheme.body(14, weight: .bold))
                            .foregroundStyle(.white)
                        TextEditor(text: $problem)
                            .scrollContentBackground(.hidden)
                            .foregroundStyle(.white)
                            .font(ClientTheme.body(14))
                            .frame(minHeight: 116)
                            .padding(10)
                            .background(ClientTheme.background, in: RoundedRectangle(cornerRadius: 11))
                            .overlay(RoundedRectangle(cornerRadius: 11).stroke(ClientTheme.line))
                            .accessibilityIdentifier("client-warranty-problem")
                        if let errorMessage {
                            Text(errorMessage)
                                .font(ClientTheme.body(12))
                                .foregroundStyle(Color(red: 1, green: 0.54, blue: 0.48))
                        }
                        Button {
                            Task { await submit() }
                        } label: {
                            HStack {
                                Spacer()
                                if isSubmitting {
                                    ProgressView().tint(.black)
                                } else {
                                    Text("Открыть гарантийное обращение")
                                }
                                Spacer()
                            }
                            .font(ClientTheme.body(14, weight: .bold))
                            .foregroundStyle(.black)
                            .frame(minHeight: 48)
                            .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 11))
                        }
                        .disabled(isSubmitting || problem.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("client-open-warranty")
                    }
                    .padding(16)
                    .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
                }
                ClientWarrantyCoverageCard()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .scrollIndicators(.hidden)
        .background(ClientTheme.background.ignoresSafeArea())
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

private struct ClientWarrantyCertificate: View {
    let device: CustomerDevice
    private var isCovered: Bool { device.daysLeft.map { $0 > 0 } ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label {
                    Text("Гарантийный талон")
                        .font(ClientTheme.body(14, weight: .bold))
                } icon: {
                    Text("A")
                        .font(ClientTheme.body(13, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(ClientTheme.coral, in: RoundedRectangle(cornerRadius: 7))
                }
                .foregroundStyle(.white)
                Spacer()
                Text(isCovered ? "Активна" : "Завершена")
                    .font(ClientTheme.body(11, weight: .semibold))
                    .foregroundStyle(isCovered ? ClientTheme.lime : ClientTheme.muted)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background((isCovered ? ClientTheme.lime : ClientTheme.muted).opacity(0.14), in: Capsule())
            }
            Text(device.product)
                .font(ClientTheme.display(20, weight: .bold))
                .foregroundStyle(.white)
            Text("IMEI \(device.imei)")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(ClientTheme.muted)
            HStack(spacing: 0) {
                ClientDeviceFact(title: "Гарантия до", value: formattedDate(device.warrantyUntil) ?? "Не указана")
                Spacer()
                ClientDeviceFact(
                    title: "Осталось",
                    value: device.daysLeft.map { $0 > 0 ? "\($0) дней" : "0 дней" } ?? "Не указано",
                    accent: isCovered
                )
            }
        }
        .padding(20)
        .background(
            LinearGradient(
                colors: [Color(red: 0.165, green: 0.165, blue: 0.18), ClientTheme.surface],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 18)
        )
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(ClientTheme.line))
    }
}

private struct ClientWarrantyStatusCard: View {
    let warranty: DeviceWarrantySummaryOrCase

    init(warranty: DeviceWarrantySummary) {
        self.warranty = DeviceWarrantySummaryOrCase(status: warranty.status, sla: warranty.sla, problem: nil)
    }

    init(warranty: WarrantyCase) {
        self.warranty = DeviceWarrantySummaryOrCase(status: warranty.status, sla: warranty.sla, problem: warranty.problem)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Обращение в сервис")
                .font(ClientTheme.body(14, weight: .bold))
                .foregroundStyle(.white)
            HStack {
                Text("Статус")
                    .foregroundStyle(ClientTheme.muted)
                Spacer()
                Text(warranty.status)
                    .fontWeight(.semibold)
                    .foregroundStyle(ClientTheme.lime)
            }
            HStack {
                Text("Рассмотрим до")
                    .foregroundStyle(ClientTheme.muted)
                Spacer()
                Text(warranty.sla.formatted(.dateTime.day().month().year()))
                    .foregroundStyle(.white)
            }
            if let problem = warranty.problem, !problem.isEmpty {
                Text(problem)
                    .font(ClientTheme.body(13))
                    .foregroundStyle(.white)
                    .padding(.top, 4)
            }
        }
        .font(ClientTheme.body(13))
        .padding(16)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
    }
}

private struct DeviceWarrantySummaryOrCase {
    let status: String
    let sla: Date
    let problem: String?
}

private struct ClientWarrantyCoverageCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Что покрывается")
                .font(ClientTheme.body(14, weight: .bold))
                .foregroundStyle(.white)
            Text("✓ Заводской брак\n✓ Неисправности экрана и батареи\n✗ Механические повреждения и влага")
                .font(ClientTheme.body(12))
                .foregroundStyle(ClientTheme.muted)
                .lineSpacing(5)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(ClientTheme.line))
    }
}

private func formattedDate(_ value: String?) -> String? {
    guard let value else { return nil }
    let formatter = ISO8601DateFormatter()
    guard let date = formatter.date(from: value) else { return value }
    return date.formatted(.dateTime.day().month().year())
}

private struct CatalogView: View {
    private enum CatalogSort: String, CaseIterable {
        case name
        case priceAsc = "price_asc"
        case priceDesc = "price_desc"
        case stockDesc = "stock_desc"

        var title: String {
            switch self {
            case .name: "По названию"
            case .priceAsc: "Сначала дешевле"
            case .priceDesc: "Сначала дороже"
            case .stockDesc: "Больше в наличии"
            }
        }
    }

    let environment: AppEnvironment
    let products: [Product]
    let isLoading: Bool
    let errorMessage: String?
    @Binding var cart: [String: Int]
    @Binding var favorites: Set<String>
    @State private var search = ""
    @State private var selectedCategory = ""
    @State private var selectedSort: CatalogSort = .name
    @State private var stockOnly = false
    @State private var remoteProducts: [Product]?
    @State private var remoteLoading = false
    @State private var remoteError: String?

    private var categoryOptions: [(label: String, value: String)] {
        let values = Set(products.map(\.category)).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
        return [("Все", "")] + values.map { ($0.capitalized, $0) }
    }

    private var isFiltered: Bool {
        !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !selectedCategory.isEmpty ||
        stockOnly ||
        selectedSort != .name
    }

    private var localFallbackProducts: [Product] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        var result = products.filter { product in
            let matchesQuery = query.isEmpty ||
                product.name.localizedCaseInsensitiveContains(query) ||
                product.category.localizedCaseInsensitiveContains(query) ||
                product.sku.localizedCaseInsensitiveContains(query)
            let matchesCategory = selectedCategory.isEmpty || product.category == selectedCategory
            let matchesStock = !stockOnly || product.availableUnits > 0
            return matchesQuery && matchesCategory && matchesStock
        }
        switch selectedSort {
        case .name:
            result.sort { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        case .priceAsc:
            result.sort { $0.price == $1.price ? $0.name < $1.name : $0.price < $1.price }
        case .priceDesc:
            result.sort { $0.price == $1.price ? $0.name < $1.name : $0.price > $1.price }
        case .stockDesc:
            result.sort { $0.availableUnits == $1.availableUnits ? $0.name < $1.name : $0.availableUnits > $1.availableUnits }
        }
        return result
    }

    private var visibleProducts: [Product] {
        remoteProducts ?? localFallbackProducts
    }

    private var filterKey: String {
        [search, selectedCategory, selectedSort.rawValue, stockOnly ? "stock" : "all"].joined(separator: "|")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ClientTheme.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("Каталог")
                                .font(ClientTheme.display(20, weight: .bold))
                                .foregroundStyle(.white)
                            Spacer()
                            Text("\(visibleProducts.count)")
                                .font(ClientTheme.body(12, weight: .semibold))
                                .foregroundStyle(ClientTheme.muted)
                        }

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(categoryOptions, id: \.value) { option in
                                    Button {
                                        selectedCategory = option.value
                                    } label: {
                                        Text(option.label)
                                            .font(ClientTheme.body(12, weight: .semibold))
                                            .foregroundStyle(selectedCategory == option.value ? .black : ClientTheme.muted)
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 9)
                                            .background(selectedCategory == option.value ? ClientTheme.lime : ClientTheme.surface, in: Capsule())
                                            .overlay(Capsule().stroke(selectedCategory == option.value ? ClientTheme.lime : ClientTheme.line))
                                    }
                                    .accessibilityLabel("Категория: \(option.label)")
                                }
                            }
                        }

                        HStack(spacing: 8) {
                            Menu {
                                ForEach(CatalogSort.allCases, id: \.rawValue) { sort in
                                    Button {
                                        selectedSort = sort
                                    } label: {
                                        Label(sort.title, systemImage: sort == selectedSort ? "checkmark" : "")
                                    }
                                }
                            } label: {
                                Label(selectedSort.title, systemImage: "arrow.up.arrow.down")
                                    .font(ClientTheme.body(12, weight: .semibold))
                                    .foregroundStyle(ClientTheme.muted)
                                    .frame(maxWidth: .infinity, minHeight: 38)
                                    .background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(ClientTheme.line))
                            }
                            .accessibilityLabel("Сортировка")

                            Button {
                                stockOnly.toggle()
                            } label: {
                                Label("В наличии", systemImage: stockOnly ? "checkmark" : "shippingbox")
                                    .font(ClientTheme.body(12, weight: .semibold))
                                    .foregroundStyle(stockOnly ? .black : ClientTheme.muted)
                                    .frame(maxWidth: .infinity, minHeight: 38)
                                    .background(stockOnly ? ClientTheme.lime : ClientTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(stockOnly ? ClientTheme.lime : ClientTheme.line))
                            }
                            .accessibilityLabel("Только в наличии")
                        }

                        if let remoteError {
                            Label("Офлайн-каталог: \(remoteError)", systemImage: "wifi.exclamationmark")
                                .font(ClientTheme.body(11))
                                .foregroundStyle(Color(red: 0.898, green: 0.698, blue: 0.235))
                        }

                        if isLoading || remoteLoading {
                            ProgressView("Загружаем каталог")
                                .tint(ClientTheme.lime)
                                .frame(maxWidth: .infinity, minHeight: 120)
                        } else if let errorMessage, products.isEmpty {
                            ClientDataErrorView(message: errorMessage, retry: {})
                        } else if visibleProducts.isEmpty {
                            EmptyStateView(title: "Ничего не найдено", detail: "Попробуйте изменить фильтры.", symbol: "magnifyingglass")
                        } else {
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                                ForEach(visibleProducts) { product in
                                    NavigationLink {
                                        ProductDetail(environment: environment, product: product, cart: $cart, favorites: $favorites)
                                    } label: {
                                        NativeProductCard(product: product, cart: $cart, favorites: $favorites)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("client-product-\(product.id)")
                                }
                            }
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Каталог")
            .searchable(text: $search, prompt: "Техника и бренды")
        }
        .task(id: filterKey) { await loadFilteredCatalog() }
    }

    private func loadFilteredCatalog() async {
        guard isFiltered else {
            remoteProducts = nil
            remoteError = nil
            return
        }

        try? await Task.sleep(nanoseconds: 250_000_000)
        guard !Task.isCancelled else { return }
        remoteLoading = true
        defer { remoteLoading = false }

        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        var queryItems = ["limit=100", "sort=\(selectedSort.rawValue)"]
        if !query.isEmpty, let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            queryItems.append("q=\(encoded)")
        }
        if !selectedCategory.isEmpty, let encoded = selectedCategory.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            queryItems.append("category=\(encoded)")
        }
        if stockOnly { queryItems.append("stockOnly=true") }

        do {
            let response: CatalogResponse = try await APIClient(baseURL: environment.apiBaseURL).get("catalog/products?\(queryItems.joined(separator: "&"))")
            remoteProducts = response.items
            remoteError = nil
        } catch is CancellationError {
        } catch {
            remoteProducts = nil
            remoteError = error.localizedDescription
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
    let environment: AppEnvironment
    let product: Product
    @Binding var cart: [String: Int]
    @Binding var favorites: Set<String>
    @State private var detail: CatalogProductDetail?
    @State private var detailError: String?
    @State private var detailLoading = false

    private var displayProduct: Product { detail?.product ?? product }

    private var displayVariants: [Product] {
        let variants = detail?.variants ?? []
        return variants.isEmpty ? [displayProduct] : variants
    }

    private var displayRelated: [Product] {
        detail?.related ?? []
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .topTrailing) {
                    ClientProductImage(product: displayProduct, cornerRadius: 0)
                        .frame(height: 260)
                    Button {
                        if favorites.contains(displayProduct.id) { favorites.remove(displayProduct.id) } else { favorites.insert(displayProduct.id) }
                    } label: {
                        Image(systemName: favorites.contains(displayProduct.id) ? "heart.fill" : "heart")
                            .foregroundStyle(favorites.contains(displayProduct.id) ? ClientTheme.coral : .white)
                            .frame(width: 44, height: 44)
                            .background(.black.opacity(0.5), in: Circle())
                    }
                    .padding(14)
                }
                VStack(alignment: .leading, spacing: 12) {
                    Text(displayProduct.availableUnits > 0 ? "В НАЛИЧИИ" : "НЕТ В НАЛИЧИИ")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(displayProduct.availableUnits > 0 ? ClientTheme.lime : ClientTheme.coral)
                    Text(displayProduct.name).font(ClientTheme.display(22, weight: .black)).foregroundStyle(.white)
                    Text(displayProduct.price.formatted(.currency(code: "KGS")))
                        .font(ClientTheme.display(26, weight: .black)).foregroundStyle(.white)
                    Text("или \(Int(displayProduct.price / 12).formatted(.number.grouping(.never))) сом × 12 мес")
                        .font(ClientTheme.body(13)).foregroundStyle(ClientTheme.lime)
                    HStack(spacing: 8) {
                        ForEach(displayVariants) { variant in
                            if variant.id == displayProduct.id {
                                variantChip(variant, title: "Текущий")
                            } else {
                                NavigationLink {
                                    ProductDetail(environment: environment, product: variant, cart: $cart, favorites: $favorites)
                                } label: {
                                    variantChip(variant, title: variant.name)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    if detailLoading {
                        ProgressView("Загружаем карточку")
                            .tint(ClientTheme.lime)
                            .frame(maxWidth: .infinity, minHeight: 40)
                    } else if let detailError {
                        ClientDataErrorView(message: detailError, retry: { Task { await loadDetail() } })
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ProductTrustCell(symbol: "shield.checkered", text: "Гарантия 12 мес")
                        ProductTrustCell(symbol: "bolt.fill", text: "Доставка 1–2 ч")
                        ProductTrustCell(symbol: "building.2.fill", text: "Самовывоз сегодня")
                        ProductTrustCell(symbol: "arrow.uturn.left", text: "Возврат 14 дней")
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Наличие в магазинах").font(ClientTheme.body(13, weight: .semibold)).foregroundStyle(.white)
                        availabilityRow("AliStore Центр", value: displayProduct.availableUnits > 0 ? "● есть" : "● нет", color: displayProduct.availableUnits > 0 ? ClientTheme.lime : ClientTheme.coral)
                        availabilityRow("AliStore Ош", value: displayProduct.availableUnits > 1 ? "● есть" : "● 1 шт", color: displayProduct.availableUnits > 1 ? ClientTheme.lime : Color(red: 0.898, green: 0.698, blue: 0.235))
                    }
                    .padding(14).background(ClientTheme.surface, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(ClientTheme.line))
                    Text("Характеристики").font(ClientTheme.display(15, weight: .bold)).foregroundStyle(.white).padding(.top, 8)
                    detailRow("SKU", value: displayProduct.sku)
                    detailRow("Категория", value: displayProduct.category)
                    detailRow("Доступно", value: "\(displayProduct.availableUnits) шт")
                    Text("Описание").font(ClientTheme.display(15, weight: .bold)).foregroundStyle(.white).padding(.top, 8)
                    Text("Оригинальная техника с гарантией AliStore. Проверьте наличие и оформите доставку или самовывоз в удобной точке.")
                        .font(ClientTheme.body(13)).foregroundStyle(ClientTheme.muted).lineSpacing(4)
                    if !displayRelated.isEmpty {
                        Text("Похожие товары")
                            .font(ClientTheme.display(15, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.top, 8)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(displayRelated) { related in
                                    NavigationLink {
                                        ProductDetail(environment: environment, product: related, cart: $cart, favorites: $favorites)
                                    } label: {
                                        NativeProductCard(product: related, cart: $cart, favorites: $favorites)
                                            .frame(width: 184)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    Button {
                        cart[displayProduct.id] = min(displayProduct.availableUnits, (cart[displayProduct.id] ?? 0) + 1)
                    } label: {
                        Text(displayProduct.availableUnits > 0 ? "Добавить в корзину" : "Нет в наличии")
                            .font(ClientTheme.body(15, weight: .bold)).foregroundStyle(.black)
                            .frame(maxWidth: .infinity).frame(height: 50)
                            .background(ClientTheme.lime, in: RoundedRectangle(cornerRadius: 13))
                    }
                    .disabled(displayProduct.availableUnits == 0)
                    .padding(.top, 6)
                }
                .padding(16)
            }
        }
        .background(ClientTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: displayProduct.id) { await loadDetail() }
    }

    private func loadDetail() async {
        detailLoading = true
        defer { detailLoading = false }
#if DEBUG
        if UITestBootstrap.startsAtVisualEvidence {
            let related = ClientUIFixture.products.filter { $0.id != product.id }.prefix(2)
            detail = CatalogProductDetail(
                product: product,
                variants: Array(ClientUIFixture.products.prefix(2)),
                related: Array(related)
            )
            detailError = nil
            return
        }
#endif
        do {
            detail = try await APIClient(baseURL: environment.apiBaseURL).get("catalog/products/\(product.id)")
            detailError = nil
        } catch is CancellationError {
        } catch {
            detailError = error.localizedDescription
        }
    }

    private func variantChip(_ variant: Product, title: String) -> some View {
        Text(title)
            .font(ClientTheme.body(13, weight: .medium))
            .foregroundStyle(variant.id == displayProduct.id ? ClientTheme.lime : ClientTheme.muted)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(variant.id == displayProduct.id ? ClientTheme.lime.opacity(0.1) : ClientTheme.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(variant.id == displayProduct.id ? ClientTheme.lime : ClientTheme.line))
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

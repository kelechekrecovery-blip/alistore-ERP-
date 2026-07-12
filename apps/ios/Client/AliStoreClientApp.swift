import AliStoreCore
import SwiftData
import SwiftUI

@main
struct AliStoreClientApp: App {
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

    init(environment: AppEnvironment) {
        self.environment = environment
        _auth = State(initialValue: CustomerAuthStore(environment: environment))
    }

    var body: some View {
        TabView {
            CatalogView(products: products, isLoading: catalogLoading, errorMessage: catalogError, cart: $cart)
                .tabItem { Label("Каталог", systemImage: "square.grid.2x2") }
            CartView(environment: environment, auth: auth, products: products, cart: $cart)
                .tabItem { Label("Корзина", systemImage: "bag") }
                .badge(cart.values.reduce(0, +))
            OrdersView(environment: environment, auth: auth)
                .tabItem { Label("Заказы", systemImage: "shippingbox") }
            AccountView(auth: auth)
                .tabItem { Label("Кабинет", systemImage: "person.crop.circle") }
        }
        .tint(.orange)
        .task {
            async let restore: Void = auth.restore()
            async let catalog: Void = loadCatalog()
            _ = await (restore, catalog)
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
}

private struct CartView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
    let products: [Product]
    @Binding var cart: [String: Int]
    @State private var fulfillment = "pickup"
    @State private var address = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var completedOrder: CustomerOrder?

    private var lines: [(Product, Int)] {
        cart.compactMap { id, quantity in products.first(where: { $0.id == id }).map { ($0, quantity) } }
    }
    private var total: Int { lines.reduce(0) { $0 + $1.0.price * $1.1 } }

    var body: some View {
        NavigationStack {
            Group {
                if let order = completedOrder {
                    ContentUnavailableView(
                        "Заказ оформлен",
                        systemImage: "checkmark.circle.fill",
                        description: Text("#\(order.id.suffix(6)) · \(order.total.formatted(.currency(code: "KGS")))")
                    )
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
            completedOrder = order
            cart.removeAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct OrdersView: View {
    let environment: AppEnvironment
    let auth: CustomerAuthStore
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
            .task(id: auth.session?.accessToken) { await load() }
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
    let auth: CustomerAuthStore
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

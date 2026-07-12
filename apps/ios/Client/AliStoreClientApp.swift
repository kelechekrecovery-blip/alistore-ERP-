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

    init(environment: AppEnvironment) {
        self.environment = environment
        _auth = State(initialValue: CustomerAuthStore(environment: environment))
    }

    var body: some View {
        TabView {
            CatalogView(environment: environment)
                .tabItem { Label("Каталог", systemImage: "square.grid.2x2") }
            EmptyStateView(title: "Корзина пуста", detail: "Добавленные товары будут доступны офлайн.", symbol: "bag")
                .tabItem { Label("Корзина", systemImage: "bag") }
            OrdersView(environment: environment, auth: auth)
                .tabItem { Label("Заказы", systemImage: "shippingbox") }
            AccountView(auth: auth)
                .tabItem { Label("Кабинет", systemImage: "person.crop.circle") }
        }
        .tint(.orange)
        .task { await auth.restore() }
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
    let environment: AppEnvironment
    @State private var products: [Product] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

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
                            ProductDetail(product: product)
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
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: CatalogResponse = try await APIClient(baseURL: environment.apiBaseURL).get("catalog/products?limit=100")
            products = response.items
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ProductDetail: View {
    let product: Product

    var body: some View {
        List {
            Section {
                LabeledContent("SKU", value: product.sku)
                LabeledContent("Категория", value: product.category)
                LabeledContent("Цена", value: product.price, format: .currency(code: "KGS"))
                LabeledContent("Доступно", value: "\(product.availableUnits)")
            }
            Section {
                Button("Добавить в корзину", systemImage: "bag.badge.plus") {}
                    .disabled(product.availableUnits == 0)
            }
        }
        .navigationTitle(product.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

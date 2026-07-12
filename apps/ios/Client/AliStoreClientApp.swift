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

    var body: some View {
        TabView {
            CatalogView(environment: environment)
                .tabItem { Label("Каталог", systemImage: "square.grid.2x2") }
            EmptyStateView(title: "Корзина пуста", detail: "Добавленные товары будут доступны офлайн.", symbol: "bag")
                .tabItem { Label("Корзина", systemImage: "bag") }
            EmptyStateView(title: "Заказов пока нет", detail: "История появится после входа по номеру телефона.", symbol: "shippingbox")
                .tabItem { Label("Заказы", systemImage: "shippingbox") }
            EmptyStateView(title: "Аккаунт", detail: "OTP-вход, бонусы, адреса и гарантия.", symbol: "person.crop.circle")
                .tabItem { Label("Кабинет", systemImage: "person.crop.circle") }
        }
        .tint(.orange)
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

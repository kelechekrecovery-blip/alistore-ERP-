import AliStoreCore
import SwiftUI

/// Инвентаризация: пересчёт остатка по товару и точке.
///
/// Расхождение считает сервер, экран его только показывает. Право
/// `inventory:count` есть у warehouse/admin/owner, но не у seller — сотрудник с
/// ролью продавца увидит здесь 403, и это ожидаемо, а не дефект экрана.
struct StaffInventoryView: View {
    let session: StaffSession
    let environment: AppEnvironment

    @State private var store: StaffInventoryStore
    @State private var products: [Product] = []
    @State private var selectedProductId = ""
    @State private var location = "BISHKEK-1"
    @State private var countedText = ""
    @State private var isLoadingCatalog = false
    @State private var catalogError: String?

    init(session: StaffSession, environment: AppEnvironment) {
        self.session = session
        self.environment = environment
        _store = State(initialValue: StaffInventoryStore(environment: environment, token: session.accessToken))
    }

    private var counted: Int? {
        let trimmed = countedText.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, let value = Int(trimmed), value >= 0 else { return nil }
        return value
    }

    private var canSubmit: Bool {
        !selectedProductId.isEmpty && counted != nil && !store.isSubmitting
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Пересчитайте фактический остаток — сервер сравнит его с учётным и запишет расхождение в Event Ledger.")
                    .font(.caption)
                    .foregroundStyle(Design3.textMuted)

                if isLoadingCatalog && products.isEmpty {
                    ProgressView("Загружаем каталог…").tint(Design3.lime)
                } else if let catalogError, products.isEmpty {
                    StaffInventoryNotice(text: catalogError, isError: true)
                    Button("Повторить") { Task { await loadCatalog() } }
                        .buttonStyle(.bordered)
                } else {
                    productPicker
                    locationField
                    countedField
                    submitButton
                }

                if let result = store.lastResult {
                    resultCard(result)
                }
                if let error = store.errorMessage {
                    StaffInventoryNotice(text: error, isError: true)
                }
            }
            .padding(16)
        }
        .background(Design3.screen.ignoresSafeArea())
        .navigationTitle("Инвентаризация")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadCatalog() }
    }

    private var productPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Товар").font(.caption.weight(.semibold)).foregroundStyle(Design3.textMuted)
            Picker("Товар", selection: $selectedProductId) {
                Text("Выберите товар").tag("")
                ForEach(products) { product in
                    Text("\(product.name) · \(product.sku)").tag(product.id)
                }
            }
            .pickerStyle(.menu)
            .tint(Design3.lime)
            .accessibilityIdentifier("staff-inventory-product")
        }
    }

    private var locationField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Точка").font(.caption.weight(.semibold)).foregroundStyle(Design3.textMuted)
            TextField("BISHKEK-1", text: $location)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .padding(12)
                .background(Design3.surface, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(Design3.textBright)
                .accessibilityIdentifier("staff-inventory-location")
        }
    }

    private var countedField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Фактически посчитано").font(.caption.weight(.semibold)).foregroundStyle(Design3.textMuted)
            TextField("0", text: $countedText)
                .keyboardType(.numberPad)
                .padding(12)
                .background(Design3.surface, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(Design3.textBright)
                .accessibilityIdentifier("staff-inventory-counted")
        }
    }

    private var submitButton: some View {
        Button {
            guard let counted else { return }
            Task { await store.count(productId: selectedProductId, location: location.trimmingCharacters(in: .whitespaces), counted: counted) }
        } label: {
            HStack {
                Spacer()
                if store.isSubmitting { ProgressView().tint(.black) } else { Text("Записать пересчёт") }
                Spacer()
            }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.black)
            .frame(height: 50)
            .background(canSubmit ? Design3.lime : Design3.surfaceRaised, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(!canSubmit)
        .accessibilityIdentifier("staff-inventory-submit")
    }

    private func resultCard(_ result: InventoryCountResult) -> some View {
        // Расхождение — знак и цвет несут смысл: недостача коралловая, излишек
        // лаймовый, сходится — нейтральный. Значение берём с сервера как есть.
        let tint = result.diff == 0 ? Design3.textBright : (result.diff < 0 ? Design3.orange : Design3.lime)
        return VStack(alignment: .leading, spacing: 8) {
            Text(result.diff == 0 ? "Сходится" : "Расхождение").font(.subheadline.weight(.bold)).foregroundStyle(tint)
            HStack {
                Text("Учётный остаток").font(.caption).foregroundStyle(Design3.textMuted)
                Spacer()
                Text("\(result.expected)").font(.caption.weight(.semibold)).foregroundStyle(Design3.textBright)
            }
            HStack {
                Text("Посчитано").font(.caption).foregroundStyle(Design3.textMuted)
                Spacer()
                Text("\(result.counted)").font(.caption.weight(.semibold)).foregroundStyle(Design3.textBright)
            }
            HStack {
                Text("Расхождение").font(.caption).foregroundStyle(Design3.textMuted)
                Spacer()
                Text(result.diff > 0 ? "+\(result.diff)" : "\(result.diff)")
                    .font(.caption.weight(.bold)).foregroundStyle(tint)
                    .accessibilityIdentifier("staff-inventory-diff")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Design3.surface, in: RoundedRectangle(cornerRadius: 12))
    }

    @MainActor
    private func loadCatalog() async {
        isLoadingCatalog = true
        catalogError = nil
        defer { isLoadingCatalog = false }
        do {
            let response: CatalogResponse = try await APIClient(baseURL: environment.apiBaseURL)
                .get("catalog/products", token: session.accessToken)
            products = response.items
        } catch {
            catalogError = error.localizedDescription
        }
    }
}

private struct StaffInventoryNotice: View {
    let text: String
    let isError: Bool

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(isError ? Design3.orange : Design3.lime)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Design3.surface, in: RoundedRectangle(cornerRadius: 10))
    }
}

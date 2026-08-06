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

    /// Два режима на одном экране: пересчёт приводит остаток к фактическому сразу,
    /// списание уходит на одобрение. Разделены явно, чтобы кассир не списал товар,
    /// думая, что просто пересчитывает.
    private enum Mode: String, CaseIterable {
        case count
        case writeOff
        var title: String { self == .count ? "Пересчёт" : "Списание" }
    }

    @State private var store: StaffInventoryStore
    @State private var products: [Product] = []
    @State private var mode: Mode = .count
    @State private var selectedProductId = ""
    @State private var location: String
    @State private var countedText = ""
    @State private var reasonText = ""
    @State private var isLoadingCatalog = false
    @State private var catalogError: String?

    init(session: StaffSession, environment: AppEnvironment) {
        self.session = session
        self.environment = environment
        _store = State(initialValue: StaffInventoryStore(environment: environment, token: session.accessToken))
        _location = State(initialValue: session.point ?? "")
    }

    private var counted: Int? {
        let trimmed = countedText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let value = Int(trimmed), value >= 0 else { return nil }
        return value
    }

    private var writeOffQty: Int? {
        let trimmed = countedText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let value = Int(trimmed), value >= 1 else { return nil }
        return value
    }

    private var canSubmit: Bool {
        guard !selectedProductId.isEmpty, !store.isSubmitting else { return false }
        switch mode {
        case .count: return counted != nil
        case .writeOff:
            return writeOffQty != nil && !reasonText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(mode == .count
                    ? "Пересчитайте фактический остаток — сервер сравнит его с учётным и запишет расхождение в Event Ledger."
                    : "Списание уходит на одобрение: сток уменьшится только после того, как ответственный подтвердит заявку.")
                    .font(.caption)
                    .foregroundStyle(Design3.textMuted)

                modeSwitcher

                if isLoadingCatalog && products.isEmpty {
                    ProgressView("Загружаем каталог…").tint(Design3.lime)
                } else if let catalogError, products.isEmpty {
                    StaffInventoryNotice(text: catalogError, isError: true)
                    Button("Повторить") { Task { await loadCatalog() } }
                        .buttonStyle(.bordered)
                } else {
                    productPicker
                }

                // Точка и количество не зависят от загрузки каталога. Оставляем
                // форму доступной при медленной сети и при ошибке каталога; запись
                // всё равно заблокирована, пока пользователь не выбрал товар.
                locationField
                countedField
                if mode == .writeOff { reasonField }
                submitButton

                if mode == .count, let result = store.lastResult {
                    resultCard(result)
                }
                if mode == .writeOff, let approval = store.lastApproval {
                    approvalCard(approval)
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

    private var modeSwitcher: some View {
        Picker("Режим", selection: $mode) {
            ForEach(Mode.allCases, id: \.self) { Text($0.title).tag($0) }
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("staff-inventory-mode")
    }

    private var reasonField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Причина").font(.caption.weight(.semibold)).foregroundStyle(Design3.textMuted)
            TextField("бой, брак, недостача…", text: $reasonText, axis: .vertical)
                .padding(12)
                .background(Design3.surface, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(Design3.textBright)
                .accessibilityIdentifier("staff-inventory-reason")
        }
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
            Text(mode == .count ? "Фактически посчитано" : "Сколько списать")
                .font(.caption.weight(.semibold)).foregroundStyle(Design3.textMuted)
            TextField("0", text: $countedText)
                .keyboardType(.numberPad)
                .padding(12)
                .background(Design3.surface, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(Design3.textBright)
                .accessibilityIdentifier("staff-inventory-counted")
        }
    }

    private var submitButton: some View {
        Button { submit() } label: {
            HStack {
                Spacer()
                if store.isSubmitting {
                    ProgressView().tint(.black)
                } else {
                    Text(mode == .count ? "Записать пересчёт" : "Отправить на одобрение")
                }
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

    private func submit() {
        let point = location.trimmingCharacters(in: .whitespacesAndNewlines)
        switch mode {
        case .count:
            guard let counted else { return }
            Task { await store.count(productId: selectedProductId, location: point, counted: counted) }
        case .writeOff:
            guard let qty = writeOffQty else { return }
            let reason = reasonText.trimmingCharacters(in: .whitespacesAndNewlines)
            Task { await store.writeOff(productId: selectedProductId, location: point, qty: qty, reason: reason) }
        }
    }

    private func approvalCard(_ approval: InventoryApproval) -> some View {
        // Списание не применилось, а встало в очередь — говорим это прямо, чтобы
        // кассир не считал товар уже списанным.
        VStack(alignment: .leading, spacing: 6) {
            Label("Отправлено на одобрение", systemImage: "clock.badge.checkmark")
                .font(.subheadline.weight(.bold)).foregroundStyle(Design3.gold)
            Text("Заявка №\(approval.approvalId.suffix(8)). Сток уменьшится после подтверждения ответственным.")
                .font(.caption).foregroundStyle(Design3.textMuted)
                .accessibilityIdentifier("staff-inventory-approval")
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Design3.surface, in: RoundedRectangle(cornerRadius: 12))
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

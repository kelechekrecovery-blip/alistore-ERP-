import AliStoreCore
import SwiftUI

/// Приёмка Б/У у прилавка: заявка создаётся здесь, а не «где-то потом».
///
/// До этого экран скупки заканчивался чек-листом и отправлял оператора в
/// Evidence Vault вводить номер заявки руками — заявки, которой ещё не
/// существовало. Оператор снимал паспорт продавца и четыре ракурса, чтобы
/// получить отказ сервера.
///
/// Цену считает сервер (`GET /tradeins/estimate`) и он же записывает её в
/// договор при `POST /tradeins/intake`. Здесь она только показывается: подставить
/// свою цифру в договор купли-продажи вёрстка права не имеет.
struct StaffBuybackIntakeView: View {
    let session: StaffSession
    /// Созданная заявка отдаётся наверх — по её id крепятся фото.
    let onCreated: (TradeInView) -> Void

    @State private var phone = "+996"
    @State private var customer: CustomerLookupResult?
    @State private var lookupError: String?
    @State private var isLookingUp = false

    @State private var model = ""
    @State private var imei = ""
    @State private var grade = "A"
    @State private var passport = ""

    @State private var estimate: TradeInEstimate?
    @State private var isEstimating = false
    @State private var isSubmitting = false
    @State private var submitError: String?

    private let environment = AppEnvironment.live()
    private let grades = [("A", "Отличное"), ("B", "Хорошее"), ("C", "С дефектами")]

    /// Отправка возможна только когда известно всё, что уйдёт в договор.
    private var canSubmit: Bool {
        customer != nil
        && !model.trimmingCharacters(in: .whitespaces).isEmpty
        && !passport.trimmingCharacters(in: .whitespaces).isEmpty
        && (estimate?.priceSom ?? 0) > 0
        && !isSubmitting
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                sellerSection
                deviceSection
                priceSection
                if let submitError {
                    Text(submitError)
                        .font(.caption)
                        .foregroundStyle(Design3.orange)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                submitButton
            }
            .padding(16)
        }
        .background(Design3.screen.ignoresSafeArea())
        .navigationTitle("Приёмка Б/У")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var sellerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Продавец").font(.caption.weight(.semibold)).foregroundStyle(Design3.textMuted)
            HStack(spacing: 8) {
                TextField("+996 700 000000", text: $phone)
                    .keyboardType(.phonePad)
                    .padding(12)
                    .background(Design3.surface, in: RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(Design3.textBright)
                    .accessibilityIdentifier("staff-buyback-phone")
                Button(isLookingUp ? "…" : "Найти") { Task { await lookup() } }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 16).frame(height: 44)
                    .background(Design3.lime, in: RoundedRectangle(cornerRadius: 10))
                    .buttonStyle(.plain)
                    .disabled(isLookingUp)
                    .accessibilityIdentifier("staff-buyback-lookup")
            }
            if let customer {
                Text("\(customer.name) · \(customer.phone)")
                    .font(.caption).foregroundStyle(Design3.lime)
                    .accessibilityIdentifier("staff-buyback-customer")
            }
            if let lookupError {
                // Ненайденный клиент — не ошибка оператора: у продавца может не
                // быть карточки. Говорим, что делать дальше, а не только «нет».
                Text(lookupError).font(.caption).foregroundStyle(Design3.orange)
            }
        }
    }

    private var deviceSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Устройство").font(.caption.weight(.semibold)).foregroundStyle(Design3.textMuted)
            TextField("iPhone 13 Pro 256GB", text: $model)
                .padding(12)
                .background(Design3.surface, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(Design3.textBright)
                .accessibilityIdentifier("staff-buyback-model")
                .onChange(of: model) { _, _ in estimate = nil }
            TextField("IMEI (необязательно)", text: $imei)
                .keyboardType(.numberPad)
                .padding(12)
                .background(Design3.surface, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(Design3.textBright)
                .accessibilityIdentifier("staff-buyback-imei")
            Picker("Состояние", selection: $grade) {
                ForEach(grades, id: \.0) { Text($0.1).tag($0.0) }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("staff-buyback-grade")
            .onChange(of: grade) { _, _ in estimate = nil }
            TextField("Паспорт продавца", text: $passport)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .padding(12)
                .background(Design3.surface, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(Design3.textBright)
                .accessibilityIdentifier("staff-buyback-passport")
        }
    }

    private var priceSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Выплата").font(.caption.weight(.semibold)).foregroundStyle(Design3.textMuted)
            HStack {
                if let estimate {
                    Text("\(estimate.priceSom) сом")
                        .font(.title2.weight(.black)).foregroundStyle(Design3.lime)
                        .accessibilityIdentifier("staff-buyback-price")
                } else {
                    Text("не рассчитана").font(.subheadline).foregroundStyle(Design3.textSubtle)
                }
                Spacer()
                Button(isEstimating ? "…" : "Рассчитать") { Task { await runEstimate() } }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Design3.textBright)
                    .padding(.horizontal, 14).frame(height: 40)
                    .background(Design3.surfaceRaised, in: RoundedRectangle(cornerRadius: 10))
                    .buttonStyle(.plain)
                    .disabled(model.trimmingCharacters(in: .whitespaces).isEmpty || isEstimating)
                    .accessibilityIdentifier("staff-buyback-estimate")
            }
            // Правка модели или состояния сбрасывает расчёт: иначе в договор
            // ушла бы цена от предыдущего устройства.
            Text("Цену считает сервер по модели и состоянию. Она же уходит в договор.")
                .font(.caption2).foregroundStyle(Design3.textSubtle)
        }
    }

    private var submitButton: some View {
        Button { Task { await submit() } } label: {
            HStack {
                Spacer()
                if isSubmitting { ProgressView().tint(.black) } else { Text("Создать заявку") }
                Spacer()
            }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.black)
            .frame(height: 50)
            .background(canSubmit ? Design3.lime : Design3.surfaceRaised, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(!canSubmit)
        .accessibilityIdentifier("staff-buyback-submit")
    }

    @MainActor
    private func lookup() async {
        isLookingUp = true
        lookupError = nil
        customer = nil
        defer { isLookingUp = false }
        let query = phone.trimmingCharacters(in: .whitespaces)
        do {
            customer = try await APIClient(baseURL: environment.apiBaseURL)
                .get("customers/lookup?phone=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query)",
                     token: session.accessToken)
        } catch {
            lookupError = "Клиент не найден. Заведите карточку в Customer 360 и повторите."
        }
    }

    @MainActor
    private func runEstimate() async {
        isEstimating = true
        defer { isEstimating = false }
        let cleanModel = model.trimmingCharacters(in: .whitespaces)
        do {
            estimate = try await APIClient(baseURL: environment.apiBaseURL).get(
                "tradeins/estimate?model=\(cleanModel.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cleanModel)&grade=\(grade)",
                token: session.accessToken
            )
        } catch {
            estimate = nil
            submitError = "Не удалось рассчитать цену: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func submit() async {
        guard let customer, let estimate else { return }
        isSubmitting = true
        submitError = nil
        defer { isSubmitting = false }
        let cleanImei = imei.trimmingCharacters(in: .whitespaces)
        let request = CreateTradeInRequest(
            customerId: customer.id,
            model: model.trimmingCharacters(in: .whitespaces),
            imei: cleanImei.isEmpty ? nil : cleanImei,
            grade: grade,
            price: estimate.priceSom,
            sellerPassport: passport.trimmingCharacters(in: .whitespaces)
        )
        do {
            // Ключ идемпотентности обязателен: приёмка выдаёт наличные, и
            // повторный тап не должен завести вторую заявку на то же устройство.
            let created: TradeInView = try await APIClient(baseURL: environment.apiBaseURL).post(
                "tradeins/intake",
                body: request,
                token: session.accessToken,
                idempotencyKey: UUID().uuidString
            )
            onCreated(created)
        } catch {
            submitError = error.localizedDescription
        }
    }
}

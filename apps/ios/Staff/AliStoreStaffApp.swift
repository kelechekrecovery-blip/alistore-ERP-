import AliStoreCore
import SwiftData
import SwiftUI

@main
struct AliStoreStaffApp: App {
    @State private var auth = StaffAuthStore(environment: .live(), keychainService: "kg.alistore.staff")

    var body: some Scene {
        WindowGroup {
            if let session = auth.session {
                StaffRootView(session: session, logout: auth.logout)
            } else {
                StaffLoginView(auth: auth, title: "AliStore Staff")
            }
        }
        .modelContainer(OfflineStore.container())
    }
}

private struct StaffRootView: View {
    let session: StaffSession
    let logout: () -> Void

    var body: some View {
        TabView {
            NavigationStack {
                List {
                    NativeStatusCard(title: "Заказы", value: "Очередь магазина", symbol: "shippingbox", tint: .orange)
                    NativeStatusCard(title: "Поддержка", value: "Customer 360", symbol: "message", tint: .blue)
                    NativeStatusCard(title: "Гарантия", value: "SLA-кейсы", symbol: "checkmark.shield", tint: .green)
                }
                .navigationTitle("Задачи")
            }
            .tabItem { Label("Задачи", systemImage: "checklist") }
            EmptyStateView(title: "Сканер", detail: "IMEI, приёмка и инвентаризация.", symbol: "barcode.viewfinder")
                .tabItem { Label("Сканер", systemImage: "barcode.viewfinder") }
            NavigationStack {
                StaffShiftView(session: session, logout: logout)
            }
            .tabItem { Label("Смена", systemImage: "clock") }
        }
    }
}

private struct StaffShiftView: View {
    let session: StaffSession
    let logout: () -> Void
    @State private var shift: CashShift?
    @State private var isLoading = true
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var point = "BISHKEK-1"
    @State private var openCash = "5000"
    @State private var closeCash = ""
    @State private var reason = ""

    private let environment = AppEnvironment.live()

    var body: some View {
        Form {
            Section("Сотрудник") {
                LabeledContent("Логин", value: session.username)
                LabeledContent("Роль", value: session.role)
            }
            if isLoading {
                Section { ProgressView("Проверяем смену…") }
            } else if let errorMessage {
                Section {
                    ContentUnavailableView("Не удалось загрузить смену", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
                    Button("Повторить", systemImage: "arrow.clockwise") { Task { await loadShift() } }
                }
            } else if let shift {
                openShiftSection(shift)
            } else {
                Section("Открытие смены") {
                    TextField("Точка", text: $point)
                        .textInputAutocapitalization(.characters)
                    TextField("Наличные на начало", text: $openCash)
                        .keyboardType(.numberPad)
                    Button("Открыть смену", systemImage: "play.circle.fill") {
                        Task { await openShift() }
                    }
                    .disabled(isSubmitting || point.trimmingCharacters(in: .whitespaces).isEmpty || Int(openCash) == nil)
                }
            }
            Section {
                Button("Выйти", role: .destructive, action: logout)
            }
        }
        .navigationTitle("Смена")
        .task { await loadShift() }
        .refreshable { await loadShift() }
    }

    @ViewBuilder
    private func openShiftSection(_ shift: CashShift) -> some View {
        Section("Открытая смена") {
            LabeledContent("Точка", value: shift.point)
            LabeledContent("Открыта", value: shift.openedAt.formatted(date: .abbreviated, time: .shortened))
            LabeledContent("На начало", value: money(shift.openCash))
            LabeledContent("Ожидается", value: money(shift.expectedCash))
            LabeledContent("Платежей", value: String(shift.payments?.count ?? 0))
        }
        Section("Сверка кассы") {
            TextField("Фактически в кассе", text: $closeCash)
                .keyboardType(.numberPad)
            if let counted = Int(closeCash), counted != shift.expectedCash {
                LabeledContent("Расхождение", value: money(counted - shift.expectedCash))
                    .foregroundStyle(.orange)
                TextField("Причина расхождения", text: $reason, axis: .vertical)
            }
            Button("Закрыть смену", systemImage: "stop.circle.fill", role: .destructive) {
                Task { await closeShift(shift) }
            }
            .disabled(!canClose(shift) || isSubmitting)
        }
    }

    private func canClose(_ shift: CashShift) -> Bool {
        guard let counted = Int(closeCash), counted >= 0 else { return false }
        return counted == shift.expectedCash || !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    @MainActor
    private func loadShift() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let current: CashShift? = try await APIClient(baseURL: environment.apiBaseURL).get("shifts/current", token: session.accessToken)
            if let current {
                shift = try await APIClient(baseURL: environment.apiBaseURL).get("shifts/\(current.id)", token: session.accessToken)
                closeCash = String(shift?.expectedCash ?? current.openCash)
            } else {
                shift = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func openShift() async {
        guard let amount = Int(openCash) else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let created: CashShift = try await APIClient(baseURL: environment.apiBaseURL).post(
                "shifts/open",
                body: OpenShiftRequest(staffId: session.staffId, point: point, openCash: amount),
                token: session.accessToken
            )
            shift = created
            await loadShift()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func closeShift(_ activeShift: CashShift) async {
        guard let amount = Int(closeCash), canClose(activeShift) else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let _: CashShift = try await APIClient(baseURL: environment.apiBaseURL).post(
                "shifts/\(activeShift.id)/close",
                body: CloseShiftRequest(
                    closeCash: amount,
                    reason: reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : reason
                ),
                token: session.accessToken
            )
            shift = nil
            closeCash = ""
            reason = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func money(_ amount: Int) -> String {
        amount.formatted(.currency(code: "KGS").precision(.fractionLength(0)))
    }
}

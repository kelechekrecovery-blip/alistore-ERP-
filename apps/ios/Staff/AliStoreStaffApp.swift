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
                StaffOrdersView(session: session)
            }
            .tabItem { Label("Задачи", systemImage: "checklist") }
            NavigationStack {
                StaffScannerView(session: session)
            }
                .tabItem { Label("Сканер", systemImage: "barcode.viewfinder") }
            NavigationStack {
                Customer360View(session: session)
            }
            .tabItem { Label("Клиенты", systemImage: "person.2") }
            NavigationStack {
                StaffShiftView(session: session, logout: logout)
            }
            .tabItem { Label("Смена", systemImage: "clock") }
        }
    }
}

private struct Customer360View: View {
    let session: StaffSession
    @State private var customerId = ""
    @State private var overview: Customer360?
    @State private var isLoading = false
    @State private var busyWarrantyId: String?
    @State private var errorMessage: String?
    private let environment = AppEnvironment.live()

    var body: some View {
        List {
            Section("Customer 360") {
                TextField("ID клиента", text: $customerId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Открыть профиль", systemImage: "magnifyingglass") { Task { await loadOverview() } }
                    .disabled(customerId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)
            }
            if isLoading {
                Section { ProgressView("Загружаем профиль…") }
            }
            if let errorMessage {
                Section { Label(errorMessage, systemImage: "exclamationmark.triangle").foregroundStyle(.red) }
            }
            if let overview {
                profileSections(overview)
            } else if !isLoading && errorMessage == nil {
                Section {
                    ContentUnavailableView("Выберите клиента", systemImage: "person.text.rectangle", description: Text("Введите внутренний ID из заказа или сканера."))
                }
            }
        }
        .navigationTitle("Клиенты")
        .refreshable { if overview != nil { await loadOverview() } }
    }

    @ViewBuilder
    private func profileSections(_ overview: Customer360) -> some View {
        Section("Профиль") {
            LabeledContent("Имя", value: overview.customer.name)
            LabeledContent("Телефон", value: overview.customer.phone)
            LabeledContent("LTV", value: money(overview.customer.ltv))
            LabeledContent("Согласие", value: overview.customer.consent ? "Есть" : "Нет")
            if !overview.customer.segments.isEmpty {
                LabeledContent("Сегменты", value: overview.customer.segments.joined(separator: ", "))
            }
        }
        Section("Покупки") {
            LabeledContent("Заказов", value: String(overview.orders.total))
            LabeledContent("Оплачено", value: money(overview.orders.spent))
            ForEach(overview.orders.recent) { order in
                LabeledContent("#\(order.id.suffix(6)) · \(order.status)", value: money(order.total))
            }
        }
        Section("Финансы и обращения") {
            LabeledContent("Открытый долг", value: money(overview.debts.openBalance))
            LabeledContent("Гарантий", value: String(overview.warranties.open))
            LabeledContent("Тикетов", value: String(overview.tickets.open))
        }
        if !overview.warranties.items.isEmpty {
            Section("Гарантия") {
                ForEach(overview.warranties.items) { warranty in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            Text(warranty.imei).font(.subheadline.monospaced())
                            Spacer()
                            Text(warranty.status).font(.caption).foregroundStyle(.secondary)
                        }
                        Label(
                            warranty.sla.formatted(date: .abbreviated, time: .omitted),
                            systemImage: warranty.sla < Date() ? "exclamationmark.circle.fill" : "clock"
                        )
                        .font(.caption)
                        .foregroundStyle(warranty.sla < Date() ? .red : .secondary)
                        if let next = nextWarrantyStatus(warranty.status) {
                            Button(warrantyActionLabel(next), systemImage: "arrow.right.circle") {
                                Task { await transitionWarranty(warranty.id, to: next) }
                            }
                            .disabled(busyWarrantyId != nil)
                        }
                    }
                    .padding(.vertical, 3)
                }
            }
        }
        if !overview.tickets.items.isEmpty {
            Section("Поддержка") {
                ForEach(overview.tickets.items) { ticket in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(ticket.subject).fontWeight(.semibold)
                        Text("\(ticket.priority) · \(ticket.status)").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    @MainActor
    private func loadOverview() async {
        let id = customerId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            overview = try await APIClient(baseURL: environment.apiBaseURL).get(
                "customers/\(id)/overview",
                token: session.accessToken
            )
        } catch {
            overview = nil
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func transitionWarranty(_ id: String, to status: String) async {
        busyWarrantyId = id
        errorMessage = nil
        defer { busyWarrantyId = nil }
        do {
            let _: WarrantyCase = try await APIClient(baseURL: environment.apiBaseURL).patch(
                "warranty/\(id)",
                body: WarrantyStatusRequest(status: status),
                token: session.accessToken
            )
            await loadOverview()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func nextWarrantyStatus(_ status: String) -> String? {
        switch status {
        case "created": "received"
        case "received": "diagnostics"
        case "diagnostics": "approved"
        case "waiting_supplier": "approved"
        case "approved": "repaired"
        case "repaired", "rejected", "replaced": "closed"
        default: nil
        }
    }

    private func warrantyActionLabel(_ status: String) -> String {
        switch status {
        case "received": "Принять устройство"
        case "diagnostics": "Начать диагностику"
        case "approved": "Согласовать ремонт"
        case "repaired": "Ремонт завершён"
        case "closed": "Закрыть обращение"
        default: status
        }
    }

    private func money(_ amount: Int) -> String {
        amount.formatted(.currency(code: "KGS").precision(.fractionLength(0)))
    }
}

private struct StaffOrdersView: View {
    let session: StaffSession
    @State private var status = "created"
    @State private var orders: [CustomerOrder] = []
    @State private var isLoading = true
    @State private var busyOrderId: String?
    @State private var errorMessage: String?
    private let environment = AppEnvironment.live()

    private let statuses = [
        ("created", "Новые"),
        ("reserved", "Резерв"),
        ("paid", "Оплачены"),
        ("picking", "Сборка"),
        ("packed", "Упакованы"),
        ("ready_for_pickup", "Выдача"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            Picker("Статус", selection: $status) {
                ForEach(statuses, id: \.0) { Text($0.1).tag($0.0) }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)

            if isLoading {
                ProgressView("Загружаем заказы…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("Очередь недоступна", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Повторить", systemImage: "arrow.clockwise") { Task { await loadOrders() } }
                }
            } else if orders.isEmpty {
                ContentUnavailableView("Нет заказов", systemImage: "shippingbox", description: Text("В выбранной очереди сейчас пусто."))
            } else {
                List(orders) { order in
                    NavigationLink {
                        StaffOrderDetailView(
                            order: order,
                            actionLabel: actionLabel(order),
                            isBusy: busyOrderId == order.id,
                            onAction: { Task { await performAction(order) } }
                        )
                    } label: {
                        VStack(alignment: .leading, spacing: 7) {
                            HStack {
                                Text("#\(order.id.suffix(8))").font(.headline.monospaced())
                                Spacer()
                                Text(money(order.total)).fontWeight(.semibold)
                            }
                            Text(order.items.map { "\($0.sku) × \($0.qty)" }.joined(separator: ", "))
                                .font(.subheadline)
                                .lineLimit(2)
                            Label(fulfillmentLabel(order), systemImage: order.fulfillmentType == "courier" ? "truck.box" : "storefront")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.plain)
                .refreshable { await loadOrders() }
            }
        }
        .navigationTitle("Заказы")
        .task(id: status) { await loadOrders() }
    }

    @MainActor
    private func loadOrders() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            orders = try await APIClient(baseURL: environment.apiBaseURL).get(
                "orders?status=\(status)",
                token: session.accessToken
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func performAction(_ order: CustomerOrder) async {
        guard let action = nextAction(order) else { return }
        busyOrderId = order.id
        errorMessage = nil
        defer { busyOrderId = nil }
        do {
            let api = APIClient(baseURL: environment.apiBaseURL)
            if action == "fulfill" {
                let _: FulfillOrderResponse = try await api.post(
                    "orders/\(order.id)/fulfill",
                    body: EmptyRequest(),
                    token: session.accessToken
                )
            } else {
                let _: OrderStatusMutation = try await api.post(
                    "orders/\(order.id)/transition",
                    body: OrderTransitionRequest(to: action),
                    token: session.accessToken
                )
            }
            await loadOrders()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func nextAction(_ order: CustomerOrder) -> String? {
        switch order.status {
        case "created": "fulfill"
        case "paid": "picking"
        case "picking": "packed"
        case "packed": order.fulfillmentType == "courier" ? "courier_assigned" : "ready_for_pickup"
        case "ready_for_pickup": "completed"
        default: nil
        }
    }

    private func actionLabel(_ order: CustomerOrder) -> String? {
        switch nextAction(order) {
        case "fulfill": "Назначить IMEI"
        case "picking": "Начать сборку"
        case "packed": "Упаковано"
        case "courier_assigned": "Передать курьеру"
        case "ready_for_pickup": "Готов к выдаче"
        case "completed": "Выдать заказ"
        default: nil
        }
    }

    private func fulfillmentLabel(_ order: CustomerOrder) -> String {
        order.fulfillmentType == "courier" ? (order.deliveryAddress ?? "Доставка") : (order.pickupPoint ?? "Самовывоз")
    }

    private func money(_ amount: Int) -> String {
        amount.formatted(.currency(code: "KGS").precision(.fractionLength(0)))
    }

    private struct StaffOrderDetailView: View {
        let order: CustomerOrder
        let actionLabel: String?
        let isBusy: Bool
        let onAction: () -> Void

        var body: some View {
            List {
                Section("Заказ") {
                    LabeledContent("Номер", value: "#\(order.id.suffix(8))")
                    LabeledContent("Статус", value: order.status)
                    LabeledContent("Канал", value: order.channel)
                    LabeledContent("Сумма", value: order.total.formatted(.currency(code: "KGS").precision(.fractionLength(0))))
                }
                Section("Товары") {
                    ForEach(Array(order.items.enumerated()), id: \.offset) { _, item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.sku).fontWeight(.semibold)
                            Text("\(item.qty) × \(item.price.formatted()) сом")
                            if let imei = item.imei { Text("IMEI \(imei)").font(.caption.monospaced()).foregroundStyle(.secondary) }
                        }
                    }
                }
                if let actionLabel {
                    Section {
                        Button(actionLabel, systemImage: "checkmark.circle.fill", action: onAction)
                            .disabled(isBusy)
                    }
                }
            }
            .navigationTitle("Заказ")
            .navigationBarTitleDisplayMode(.inline)
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

import AliStoreCore
import PhotosUI
import SwiftData
import SwiftUI

struct POSOfflineView: View {
    let session: StaffSession
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PendingMutation.createdAt) private var mutations: [PendingMutation]
    @State private var isSyncing = false
    @State private var message: String?
    private let api = APIClient(baseURL: AppEnvironment.live().apiBaseURL)

    var body: some View {
        NavigationStack {
            List {
                if mutations.isEmpty {
                    ContentUnavailableView("Очередь пуста", systemImage: "checkmark.circle", description: Text("Офлайн-продажи синхронизированы"))
                        .listRowBackground(POSPalette.ink)
                }
                ForEach(mutations) { mutation in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(stateLabel(mutation.state)).font(.headline)
                            Spacer()
                            Text(String(mutation.idempotencyKey.suffix(8))).font(.caption.monospaced())
                        }
                        Text("Попыток: \(mutation.attempts)").font(.caption).foregroundStyle(POSPalette.muted)
                        if let error = mutation.lastError { Text(error).font(.caption).foregroundStyle(POSPalette.coral) }
                        if OfflinePOSQueue.approvalId(from: mutation.lastError) != nil {
                            Button("Повторить после одобрения", systemImage: "checkmark.shield") {
                                do { try OfflinePOSQueue.attachApproval(mutation, context: modelContext); Task { await replay(mutation) } }
                                catch { message = error.localizedDescription }
                            }
                        } else if mutation.state == "failed" || mutation.state == "conflict" {
                            Button("Повторить", systemImage: "arrow.clockwise") {
                                do { try OfflinePOSQueue.retry(mutation, context: modelContext); Task { await replay(mutation) } }
                                catch { message = error.localizedDescription }
                            }
                        }
                    }
                    .padding(.vertical, 6)
                    .listRowBackground(POSPalette.surface)
                }
                if let message { Text(message).foregroundStyle(POSPalette.coral).listRowBackground(POSPalette.ink) }
            }
            .scrollContentBackground(.hidden)
            .background(POSPalette.ink)
            .navigationTitle("Офлайн-очередь")
            .toolbar {
                Button { Task { await replayAll() } } label: {
                    if isSyncing { ProgressView() } else { Image(systemName: "arrow.triangle.2.circlepath") }
                }
                .disabled(isSyncing || mutations.isEmpty)
                .accessibilityLabel("Синхронизировать")
            }
        }
    }

    @MainActor private func replayAll() async {
        isSyncing = true
        defer { isSyncing = false }
        for mutation in mutations where mutation.state != "conflict" {
            await OfflinePOSQueue.replay(mutation, api: api, token: session.accessToken, context: modelContext)
        }
    }

    @MainActor private func replay(_ mutation: PendingMutation) async {
        await OfflinePOSQueue.replay(mutation, api: api, token: session.accessToken, context: modelContext)
    }

    private func stateLabel(_ state: String) -> String {
        ["queued": "В очереди", "syncing": "Синхронизация", "conflict": "Нужна проверка", "failed": "Ошибка"][state] ?? state
    }
}

struct POSShiftView: View {
    let session: StaffSession
    let pushStatus: String
    let enablePush: () -> Void
    let logout: () -> Void
    @State private var shift: CashShift?
    @State private var point = "BISHKEK-1"
    @State private var openCash = "0"
    @State private var closeCash = ""
    @State private var reason = ""
    @State private var isBusy = false
    @State private var errorMessage: String?
    @State private var message: String?
    private let api = APIClient(baseURL: AppEnvironment.live().apiBaseURL)

    var body: some View {
        NavigationStack {
            Form {
                Section("Кассир") {
                    LabeledContent("Сотрудник", value: session.username)
                    LabeledContent("Роль", value: session.role)
                    LabeledContent("Push", value: pushStatus)
                    Button("Включить уведомления", systemImage: "bell.badge", action: enablePush)
                }
                if let shift {
                    Section("Открытая смена") {
                        LabeledContent("Точка", value: shift.point)
                        LabeledContent("Открытие", value: "\(shift.openCash) сом")
                        LabeledContent("Ожидается", value: "\(shift.expectedCash) сом")
                        LabeledContent("Платежей", value: "\(shift.payments?.count ?? 0)")
                        TextField("Фактически в кассе", text: $closeCash).keyboardType(.numberPad)
                        TextField("Причина расхождения", text: $reason)
                        Button("Закрыть смену", systemImage: "lock.fill", role: .destructive) { Task { await close(shift) } }
                            .disabled(isBusy || Int(closeCash) == nil)
                    }
                } else {
                    Section("Открыть смену") {
                        TextField("Точка", text: $point).textInputAutocapitalization(.characters)
                        TextField("Наличные при открытии", text: $openCash).keyboardType(.numberPad)
                        Button("Открыть смену", systemImage: "lock.open.fill") { Task { await open() } }
                            .disabled(isBusy || point.isEmpty || Int(openCash) == nil)
                    }
                }
                if isBusy { Section { ProgressView() } }
                if let message { Section { Text(message).foregroundStyle(POSPalette.lime) } }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(POSPalette.coral) } }
                Section { Button("Выйти", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive, action: logout) }
            }
            .navigationTitle("Смена")
            .task { await load() }
            .refreshable { await load() }
        }
    }

    @MainActor private func load() async {
        do { shift = try await api.get("shifts/current", token: session.accessToken) }
        catch { errorMessage = error.localizedDescription }
    }

    @MainActor private func open() async {
        isBusy = true; errorMessage = nil; defer { isBusy = false }
        do {
            shift = try await api.post(
                "shifts/open",
                body: OpenShiftRequest(staffId: session.staffId, point: point, openCash: Int(openCash) ?? 0),
                token: session.accessToken,
                idempotencyKey: UUID().uuidString
            )
            message = "Смена открыта"
        } catch { errorMessage = error.localizedDescription }
    }

    @MainActor private func close(_ current: CashShift) async {
        isBusy = true; errorMessage = nil; defer { isBusy = false }
        do {
            let closed: CashShift = try await api.post(
                "shifts/\(current.id)/close",
                body: CloseShiftRequest(closeCash: Int(closeCash) ?? 0, reason: reason.isEmpty ? nil : reason),
                token: session.accessToken,
                idempotencyKey: UUID().uuidString
            )
            message = "Смена закрыта · расхождение \(closed.diff ?? 0) сом"
            shift = nil; closeCash = ""; reason = ""
        } catch { errorMessage = error.localizedDescription }
    }
}

struct POSOperationsView: View {
    let session: StaffSession
    @State private var products: [Product] = []
    @State private var returns: [POSReturn] = []
    @State private var orderId = ""
    @State private var receipt: POSReceipt?
    @State private var payments: [POSPayment] = []
    @State private var paymentId = ""
    @State private var refundAmount = ""
    @State private var refundReason = ""
    @State private var oldIMEI = ""
    @State private var newProductId = ""
    @State private var exchangeMethod = "cash"
    @State private var exchangeKey = UUID().uuidString
    @State private var exchangePhotoItem: PhotosPickerItem?
    @State private var exchangeEvidence: Data?
    @State private var isBusy = false
    @State private var message: String?
    @State private var errorMessage: String?
    @State private var restockLocation = "RETURNS-BISHKEK"
    private let api = APIClient(baseURL: AppEnvironment.live().apiBaseURL)

    var body: some View {
        NavigationStack {
            Form {
                Section("Чек и платежи") {
                    TextField("ID заказа", text: $orderId).textInputAutocapitalization(.never)
                    Button("Найти", systemImage: "magnifyingglass") { Task { await lookupOrder() } }
                        .disabled(orderId.isEmpty || isBusy)
                    ForEach(payments) { payment in
                        Button {
                            paymentId = payment.id
                            refundAmount = String(payment.amount)
                        } label: {
                            LabeledContent(payment.method, value: "\(payment.amount) · \(payment.status)")
                        }
                    }
                    if let receipt {
                        Text(receipt.markup).font(.system(.caption2, design: .monospaced))
                        Button("Печать", systemImage: "printer", action: { POSReceiptPrinter.print(receipt.markup) })
                    }
                }
                Section("Refund через approval") {
                    TextField("ID платежа", text: $paymentId).textInputAutocapitalization(.never)
                    TextField("Сумма", text: $refundAmount).keyboardType(.numberPad)
                    TextField("Причина", text: $refundReason)
                    Button("Запросить возврат", systemImage: "arrow.uturn.backward.circle") { Task { await requestRefund() } }
                        .disabled(paymentId.isEmpty || (Int(refundAmount) ?? 0) <= 0 || refundReason.isEmpty || isBusy)
                }
                Section("Возвраты") {
                    if returns.isEmpty { Text("Нет заявок").foregroundStyle(POSPalette.muted) }
                    if returns.contains(where: { $0.status == "paid" }) {
                        TextField("Склад возврата", text: $restockLocation).textInputAutocapitalization(.characters)
                    }
                    ForEach(returns) { item in
                        VStack(alignment: .leading) {
                            Text("#\(item.id.suffix(8)) · \(item.status)").font(.subheadline.weight(.semibold))
                            Text(item.reason).font(.caption).foregroundStyle(POSPalette.muted)
                            ForEach(POSReturnFlow.nextStatuses(for: item.status), id: \.self) { next in
                                Button(POSReturnFlow.actionLabel(for: next)) { Task { await transition(item, to: next) } }
                                    .disabled(isBusy)
                            }
                        }
                    }
                }
                Section("Обмен устройства") {
                    TextField("Исходный заказ", text: $orderId).textInputAutocapitalization(.never)
                    TextField("Старый IMEI", text: $oldIMEI).keyboardType(.numberPad)
                    Picker("Новый товар", selection: $newProductId) {
                        Text("Выберите товар").tag("")
                        ForEach(products) { Text($0.name).tag($0.id) }
                    }
                    Picker("Доплата", selection: $exchangeMethod) {
                        Text("Наличные").tag("cash"); Text("Карта").tag("card"); Text("MBank").tag("qr_mbank")
                    }
                    PhotosPicker(selection: $exchangePhotoItem, matching: .images) {
                        Label(exchangeEvidence == nil ? "Фото состояния" : "Фото выбрано", systemImage: "camera.fill")
                    }
                    .onChange(of: exchangePhotoItem) { _, item in
                        Task { exchangeEvidence = try? await item?.loadTransferable(type: Data.self) }
                    }
                    Button("Создать заявку на обмен", systemImage: "checkmark.shield") { Task { await exchange() } }
                        .disabled(orderId.isEmpty || oldIMEI.isEmpty || newProductId.isEmpty || exchangeEvidence == nil || isBusy)
                }
                if isBusy { Section { ProgressView() } }
                if let message { Section { Text(message).foregroundStyle(POSPalette.lime) } }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(POSPalette.coral) } }
            }
            .navigationTitle("Операции")
            .task { await refresh() }
            .refreshable { await refresh() }
        }
    }

    @MainActor private func refresh() async {
        do {
            async let catalog: CatalogResponse = api.get("catalog/products")
            async let loadedReturns: [POSReturn] = api.get("returns", token: session.accessToken)
            products = try await catalog.items
            returns = try await loadedReturns
        } catch { errorMessage = error.localizedDescription }
    }

    @MainActor private func lookupOrder() async {
        isBusy = true; errorMessage = nil; defer { isBusy = false }
        do {
            let encoded = orderId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? orderId
            async let loadedReceipt: POSReceipt = api.get("receipts/order/\(encoded)", token: session.accessToken)
            async let loadedPayments: [POSPayment] = api.get("payments?orderId=\(encoded)", token: session.accessToken)
            receipt = try await loadedReceipt
            payments = try await loadedPayments
        } catch { errorMessage = error.localizedDescription }
    }

    @MainActor private func requestRefund() async {
        isBusy = true; errorMessage = nil; defer { isBusy = false }
        do {
            let encoded = paymentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? paymentId
            let approval: POSRefundApproval = try await api.post(
                "payments/\(encoded)/refund",
                body: POSRefundRequest(amount: Int(refundAmount) ?? 0, reason: refundReason),
                token: session.accessToken
            )
            message = "Refund передан на approval #\(approval.approvalId.suffix(8))"
        } catch { errorMessage = error.localizedDescription }
    }

    @MainActor private func transition(_ item: POSReturn, to status: String) async {
        isBusy = true; errorMessage = nil; message = nil; defer { isBusy = false }
        do {
            let updated: POSReturn = try await api.patch(
                "returns/\(item.id)",
                body: POSReturnTransitionRequest(status: status, location: status == "reconciled" ? restockLocation : nil),
                token: session.accessToken
            )
            returns = returns.map { $0.id == updated.id ? updated : $0 }
            message = "Возврат #\(updated.id.suffix(8)): \(updated.status)"
        } catch { errorMessage = error.localizedDescription }
    }

    @MainActor private func exchange() async {
        isBusy = true; errorMessage = nil; defer { isBusy = false }
        do {
            let result: POSExchangeResult = try await api.post(
                "exchanges",
                body: POSExchangeRequest(originalOrderId: orderId, oldImei: oldIMEI, newProductId: newProductId, method: exchangeMethod),
                token: session.accessToken,
                idempotencyKey: exchangeKey
            )
            guard let exchangeEvidence else { return }
            let _: EvidenceAttachment = try await api.uploadEvidence(
                imageData: exchangeEvidence,
                entityType: "exchange",
                entityId: result.exchangeRequestId,
                label: "exchange_condition",
                token: session.accessToken
            )
            message = "Ожидает согласования #\(result.approvalId.suffix(8)) · доплата \(result.surchargeAmount) сом · IMEI …\(result.newImei.suffix(6))"
            exchangeKey = UUID().uuidString
            oldIMEI = ""; newProductId = ""; exchangePhotoItem = nil; self.exchangeEvidence = nil
            await refresh()
        } catch { errorMessage = error.localizedDescription }
    }
}

import AliStoreCore
import PhotosUI
import SwiftData
import SwiftUI
import UIKit
import UserNotifications

private let courierInk = Color(red: 0.08, green: 0.08, blue: 0.08)
private let courierSurface = Color(red: 0.14, green: 0.14, blue: 0.14)
private let courierMuted = Color(red: 0.66, green: 0.66, blue: 0.66)
private let courierCoral = Color(red: 1.0, green: 0.42, blue: 0.34)
private let courierLime = Color(red: 0.78, green: 0.94, blue: 0.29)

private enum CourierTab: Hashable { case route, cod, profile }

struct CourierRootView: View {
    let session: StaffSession
    let logout: () -> Void

    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Query(sort: \PendingMutation.createdAt) private var pending: [PendingMutation]
    @State private var tab = CourierTab.route
    @State private var deliveries: [CourierDelivery] = []
    @State private var focusedDeliveryId: String?
    @State private var isLoading = true
    @State private var isReplaying = false
    @State private var message: String?
    @State private var pushStatus = "Push не настроен"

    private let environment = AppEnvironment.live()
    private var api: APIClient { APIClient(baseURL: environment.apiBaseURL) }

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                CourierRouteView(
                    deliveries: orderedDeliveries,
                    focusedDeliveryId: focusedDeliveryId,
                    isLoading: isLoading,
                    message: message,
                    session: session,
                    submit: submit,
                    refresh: load
                )
            }
            .tabItem { Label("Маршрут", systemImage: "map") }
            .tag(CourierTab.route)

            NavigationStack {
                CourierCODView(deliveries: deliveries, pending: pending, session: session, refresh: load)
            }
            .tabItem { Label("COD", systemImage: "banknote") }
            .tag(CourierTab.cod)

            NavigationStack {
                CourierProfileView(
                    session: session,
                    pending: pending,
                    pushStatus: pushStatus,
                    isReplaying: isReplaying,
                    enablePush: enablePush,
                    retry: { Task { await replay(includeConflicts: true) } },
                    logout: logout
                )
            }
            .tabItem { Label("Профиль", systemImage: "person") }
            .tag(CourierTab.profile)
        }
        .tint(courierCoral)
        .task { await load() }
        .onOpenURL(perform: route)
        .onReceive(NotificationCenter.default.publisher(for: .courierNotificationRoute)) { notification in
            guard let url = notification.object as? URL else { return }
            route(url)
        }
        .onReceive(NotificationCenter.default.publisher(for: .courierAPNsToken)) { notification in
            guard let token = notification.object as? String else { return }
            Task { await registerPushToken(token) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .courierAPNsFailure)) { notification in
            pushStatus = notification.object as? String ?? "APNs registration failed"
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await replay(includeConflicts: false) }
        }
    }

    private var orderedDeliveries: [CourierDelivery] {
        deliveries.sorted { left, right in
            if left.id == focusedDeliveryId { return true }
            if right.id == focusedDeliveryId { return false }
            return left.status != "delivered" && right.status == "delivered"
        }
    }

    @MainActor
    private func load() async {
        isLoading = deliveries.isEmpty
        #if DEBUG
        if UITestBootstrap.startsSignedIn {
            deliveries = Self.fixtureDeliveries
            message = nil
            isLoading = false
            return
        }
        #endif
        do {
            deliveries = try await api.get("courier/me/deliveries", token: session.accessToken)
            message = nil
        } catch {
            message = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    private func submit(endpoint: String, body: Data, key: String) async -> String {
        do {
            let _: CourierCommandResponse = try await api.postEncoded(
                endpoint,
                body: body,
                token: session.accessToken,
                idempotencyKey: key
            )
            await load()
            return "Операция подтверждена сервером"
        } catch {
            guard shouldQueue(error) else { return error.localizedDescription }
            do {
                try OfflineCourierQueue.enqueueEncoded(
                    endpoint: endpoint,
                    body: body,
                    idempotencyKey: key,
                    context: modelContext
                )
                return "Сохранено офлайн"
            } catch {
                return error.localizedDescription
            }
        }
    }

    @MainActor
    private func replay(includeConflicts: Bool) async {
        guard !isReplaying else { return }
        let commands = pending.filter { mutation in
            mutation.state == "queued" || mutation.state == "failed" || (includeConflicts && mutation.state == "conflict")
        }
        guard !commands.isEmpty else { return }
        isReplaying = true
        for mutation in commands {
            await OfflineCourierQueue.replay(mutation, api: api, token: session.accessToken, context: modelContext)
        }
        isReplaying = false
        await load()
    }

    private func route(_ url: URL) {
        guard url.scheme == "alistore-courier", url.host == "deliveries",
              let orderId = url.pathComponents.dropFirst().first else { return }
        focusedDeliveryId = orderId.removingPercentEncoding ?? orderId
        tab = .route
        Task { await load() }
    }

    private func enablePush() {
        Task {
            do {
                let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
                guard granted else { pushStatus = "Уведомления отключены"; return }
                pushStatus = "Регистрация APNs…"
                UIApplication.shared.registerForRemoteNotifications()
            } catch {
                pushStatus = error.localizedDescription
            }
        }
    }

    @MainActor
    private func registerPushToken(_ token: String) async {
        do {
            let registered: RegisteredPushToken = try await api.post(
                "notifications/push-tokens",
                body: RegisterPushTokenRequest(token: token, deviceId: installationId(), scope: "staff"),
                token: session.accessToken
            )
            pushStatus = registered.enabled ? "Push подключён" : "Push отключён"
        } catch {
            pushStatus = error.localizedDescription
        }
    }

    private func installationId() -> String {
        let key = "alistore.courier.installation-id"
        if let value = UserDefaults.standard.string(forKey: key) { return value }
        let value = "ios-courier-\(UUID().uuidString.lowercased())"
        UserDefaults.standard.set(value, forKey: key)
        return value
    }

    private func shouldQueue(_ error: Error) -> Bool {
        if error is URLError { return true }
        guard let apiError = error as? APIError else { return false }
        switch apiError {
        case .invalidResponse, .decoding:
            return true
        case let .rejected(status, _):
            return status >= 500
        }
    }

    #if DEBUG
    private static var fixtureDeliveries: [CourierDelivery] {
        let json = """
        [
          {
            "id": "4102",
            "status": "courier_assigned",
            "total": 119900,
            "deliveryAddress": "Бишкек, ул. Киевская, 125",
            "deliverySlot": "Сегодня 15:00-17:00",
            "customer": { "name": "Айбек Маматов", "phone": "+996555010203" },
            "items": [
              { "sku": "iPhone 15 128 GB Black", "qty": 1, "price": 119900, "imei": "356789101234567" }
            ],
            "payments": [],
            "courierRun": { "id": "run-4102", "codTotal": 119900, "collectedTotal": 0, "handedOver": false }
          },
          {
            "id": "4098",
            "status": "out_for_delivery",
            "total": 45900,
            "deliveryAddress": "пр. Чуй 132, офис 4",
            "deliverySlot": "Сегодня 17:00-19:00",
            "customer": { "name": "Элина Осмонова", "phone": "+996700111222" },
            "items": [
              { "sku": "AirPods Pro 2", "qty": 1, "price": 45900, "imei": null }
            ],
            "payments": [],
            "courierRun": { "id": "run-4098", "codTotal": 45900, "collectedTotal": 45900, "handedOver": false }
          }
        ]
        """
        return (try? JSONDecoder().decode([CourierDelivery].self, from: Data(json.utf8))) ?? []
    }
    #endif
}

private struct CourierRouteView: View {
    let deliveries: [CourierDelivery]
    let focusedDeliveryId: String?
    let isLoading: Bool
    let message: String?
    let session: StaffSession
    let submit: (String, Data, String) async -> String
    let refresh: () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                Text("Мой маршрут").font(.largeTitle.bold()).foregroundStyle(.white)
                Text("\(deliveries.filter { $0.status != "delivered" }.count) активных доставок")
                    .foregroundStyle(courierMuted)
                if let message { Label(message, systemImage: "exclamationmark.triangle").foregroundStyle(courierCoral) }
                if isLoading { ProgressView().tint(courierLime).frame(maxWidth: .infinity).padding(.top, 60) }
                else if deliveries.isEmpty {
                    ContentUnavailableView("Маршрут пуст", systemImage: "map", description: Text("Новые назначения появятся после диспетчеризации."))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 48)
                } else {
                    ForEach(deliveries) { delivery in
                        CourierDeliveryCard(
                            delivery: delivery,
                            focused: delivery.id == focusedDeliveryId,
                            session: session,
                            submit: submit,
                            refresh: refresh
                        )
                    }
                }
            }
            .padding(16)
        }
        .background(courierInk.ignoresSafeArea())
        .refreshable { await refresh() }
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct CourierDeliveryCard: View {
    let delivery: CourierDelivery
    let focused: Bool
    let session: StaffSession
    let submit: (String, Data, String) async -> String
    let refresh: () async -> Void

    @Environment(\.openURL) private var openURL
    @State private var failureReason = ""
    @State private var isBusy = false
    @State private var statusMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline) {
                Text(delivery.customer.name).font(.headline).foregroundStyle(.white)
                Spacer()
                Text(statusLabel).font(.caption.bold()).foregroundStyle(courierLime)
            }
            Text(delivery.deliveryAddress ?? "Адрес не указан").foregroundStyle(courierMuted)
            if let slot = delivery.deliverySlot { Text(slot).font(.caption).foregroundStyle(courierMuted) }
            Text("\(delivery.items.reduce(0) { $0 + $1.qty }) шт. · \(delivery.outstandingCOD) сом COD")
                .font(.subheadline.bold()).foregroundStyle(.white)
            if focused { Label("Открыто из уведомления", systemImage: "bell.fill").font(.caption).foregroundStyle(courierCoral) }

            HStack(spacing: 8) {
                Button("Маршрут", systemImage: "map") { openMap() }.buttonStyle(.bordered).frame(maxWidth: .infinity)
                Button("Позвонить", systemImage: "phone") { openPhone() }.buttonStyle(.bordered).frame(maxWidth: .infinity)
            }
            .tint(.white)

            if delivery.status == "courier_assigned" {
                primaryButton("Начать доставку") {
                    await execute(endpoint: "courier/orders/\(delivery.id)/start", body: EmptyMutationRequest())
                }
            } else if delivery.status == "out_for_delivery" {
                CourierEvidenceView(orderId: delivery.id, session: session)
                primaryButton("Доставлено · \(delivery.outstandingCOD) сом") {
                    await execute(
                        endpoint: "courier/orders/\(delivery.id)/deliver",
                        body: CompleteCourierDeliveryRequest(codAmount: delivery.outstandingCOD)
                    )
                }
                TextField("Причина неудачной доставки", text: $failureReason, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                Button("Не удалось доставить", systemImage: "exclamationmark.octagon") {
                    Task {
                        await execute(
                            endpoint: "deliveries/\(delivery.id)/fail",
                            body: FailCourierDeliveryRequest(reason: failureReason.trimmingCharacters(in: .whitespacesAndNewlines))
                        )
                    }
                }
                .buttonStyle(.bordered)
                .tint(courierCoral)
                .disabled(isBusy || failureReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            } else {
                Label("Доставка завершена", systemImage: "checkmark.seal.fill").foregroundStyle(courierLime)
            }
            if let statusMessage { Text(statusMessage).font(.caption).foregroundStyle(courierLime) }
        }
        .padding(16)
        .background(courierSurface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay { if focused { RoundedRectangle(cornerRadius: 8).stroke(courierCoral, lineWidth: 2) } }
    }

    private var statusLabel: String {
        ["courier_assigned": "Назначено", "out_for_delivery": "В пути", "delivered": "Доставлено"][delivery.status] ?? delivery.status
    }

    @ViewBuilder
    private func primaryButton(_ title: String, action: @escaping () async -> Void) -> some View {
        Button(title) { Task { await action() } }
            .buttonStyle(.borderedProminent)
            .tint(courierLime)
            .foregroundStyle(courierInk)
            .frame(maxWidth: .infinity)
            .disabled(isBusy)
    }

    @MainActor
    private func execute<Body: Encodable & Sendable>(endpoint: String, body: Body) async {
        isBusy = true
        do {
            statusMessage = await submit(endpoint, try JSONEncoder().encode(body), UUID().uuidString)
        } catch {
            statusMessage = error.localizedDescription
        }
        isBusy = false
        await refresh()
    }

    private func openMap() {
        guard let address = delivery.deliveryAddress,
              let encoded = address.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "http://maps.apple.com/?q=\(encoded)") else { return }
        openURL(url)
    }

    private func openPhone() {
        let digits = delivery.customer.phone.filter { $0.isNumber || $0 == "+" }
        guard !digits.isEmpty, let url = URL(string: "tel:\(digits)") else { return }
        openURL(url)
    }
}

private struct CourierEvidenceView: View {
    let orderId: String
    let session: StaffSession
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var imageData: Data?
    @State private var showCamera = false
    @State private var isUploading = false
    @State private var message: String?
    private let environment = AppEnvironment.live()

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Evidence доставки").font(.subheadline.bold()).foregroundStyle(.white)
            HStack {
                Button("Фото", systemImage: "camera") {
                    guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                        message = "Камера недоступна на этом устройстве"
                        return
                    }
                    showCamera = true
                }
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label("Галерея", systemImage: "photo")
                }
            }
            .buttonStyle(.bordered)
            .tint(.white)
            if imageData != nil {
                Button("Сохранить фото", systemImage: "arrow.up.circle.fill") { Task { await upload() } }
                    .buttonStyle(.borderedProminent).tint(courierCoral).disabled(isUploading)
            }
            if isUploading { ProgressView().tint(courierLime) }
            if let message { Text(message).font(.caption).foregroundStyle(courierMuted) }
        }
        .sheet(isPresented: $showCamera) { CourierCameraPicker { imageData = $0 } }
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            Task {
                do { imageData = try await item.loadTransferable(type: Data.self); message = "Фото готово" }
                catch { message = error.localizedDescription }
            }
        }
    }

    @MainActor
    private func upload() async {
        guard let imageData else { return }
        isUploading = true
        defer { isUploading = false }
        do {
            let _: EvidenceAttachment = try await APIClient(baseURL: environment.apiBaseURL).uploadEvidence(
                imageData: imageData,
                entityType: "order",
                entityId: orderId,
                label: "delivery_proof",
                token: session.accessToken
            )
            self.imageData = nil
            message = "Evidence сохранён"
        } catch {
            message = error.localizedDescription
        }
    }
}

private struct CourierCODView: View {
    let deliveries: [CourierDelivery]
    let pending: [PendingMutation]
    let session: StaffSession
    let refresh: () async -> Void

    private var runs: [CourierRunSummary] {
        var seen = Set<String>()
        return deliveries.compactMap(\.courierRun).filter { seen.insert($0.id).inserted }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                Text("Сверка COD").font(.largeTitle.bold()).foregroundStyle(.white)
                Text("Офлайн-команд: \(pending.count)").foregroundStyle(courierMuted)
                if runs.isEmpty {
                    ContentUnavailableView("Нет активного COD", systemImage: "banknote", description: Text("Рейсы появятся после назначения."))
                        .foregroundStyle(.white).frame(maxWidth: .infinity).padding(.top, 48)
                }
                ForEach(runs) { run in CourierRunCard(run: run, session: session, refresh: refresh) }
            }
            .padding(18)
        }
        .background(courierInk.ignoresSafeArea())
    }
}

private struct CourierRunCard: View {
    let run: CourierRunSummary
    let session: StaffSession
    let refresh: () async -> Void
    @State private var amount = ""
    @State private var reason = ""
    @State private var message: String?
    @State private var isBusy = false
    @Environment(\.modelContext) private var modelContext
    private let environment = AppEnvironment.live()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Рейс \(run.id.suffix(6))").font(.headline).foregroundStyle(.white)
            Text("Собрано \(run.collectedTotal) из \(run.codTotal) сом").foregroundStyle(courierMuted)
            if run.handedOver {
                Label("Сверено", systemImage: "checkmark.seal.fill").foregroundStyle(courierLime)
            } else {
                TextField("Сумма сдачи", text: $amount).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                    .onAppear { if amount.isEmpty { amount = String(run.collectedTotal) } }
                if Int(amount) != run.codTotal {
                    TextField("Причина расхождения", text: $reason, axis: .vertical).textFieldStyle(.roundedBorder)
                }
                Button("Сдать COD", systemImage: "banknote") { Task { await handover() } }
                    .buttonStyle(.borderedProminent).tint(courierLime).foregroundStyle(courierInk)
                    .disabled(isBusy || run.collectedTotal != run.codTotal || Int(amount) == nil || (Int(amount) != run.codTotal && reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            }
            if let message { Text(message).font(.caption).foregroundStyle(courierCoral) }
        }
        .padding(16).background(courierSurface).clipShape(RoundedRectangle(cornerRadius: 8))
    }

    @MainActor
    private func handover() async {
        guard let amountValue = Int(amount) else { return }
        let request = CourierHandoverRequest(runId: run.id, amount: amountValue, reason: reason.nilIfBlank)
        let key = "courier-handover-\(run.id)"
        isBusy = true
        defer { isBusy = false }
        do {
            let _: CourierRunSummary = try await APIClient(baseURL: environment.apiBaseURL).post(
                "courier/handover",
                body: request,
                token: session.accessToken,
                idempotencyKey: key
            )
            message = "Наличные сданы"
            await refresh()
        } catch {
            if shouldQueueHandover(error) {
                do {
                    try OfflineCourierQueue.enqueue(
                        endpoint: "courier/handover",
                        body: request,
                        idempotencyKey: key,
                        context: modelContext
                    )
                    message = "Сдача COD сохранена офлайн"
                } catch {
                    message = error.localizedDescription
                }
            } else {
                message = error.localizedDescription
            }
        }
    }

    private func shouldQueueHandover(_ error: Error) -> Bool {
        if error is URLError { return true }
        guard let apiError = error as? APIError else { return false }
        switch apiError {
        case .invalidResponse, .decoding: return true
        case let .rejected(status, _): return status >= 500
        }
    }
}

private struct CourierProfileView: View {
    let session: StaffSession
    let pending: [PendingMutation]
    let pushStatus: String
    let isReplaying: Bool
    let enablePush: () -> Void
    let retry: () -> Void
    let logout: () -> Void

    var body: some View {
        List {
            Section("Курьер") {
                LabeledContent("Логин", value: session.username)
                LabeledContent("ID", value: String(session.staffId.suffix(8)))
                LabeledContent("Push", value: pushStatus)
                Button("Включить уведомления", systemImage: "bell.badge", action: enablePush)
            }
            Section("Офлайн-очередь") {
                LabeledContent("В очереди", value: String(pending.filter { $0.state == "queued" }.count))
                LabeledContent("Конфликты", value: String(pending.filter { $0.state == "conflict" }.count))
                Button("Повторить команды", systemImage: "arrow.clockwise", action: retry).disabled(isReplaying || pending.isEmpty)
                ForEach(pending) { command in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(command.endpoint).font(.caption.monospaced()).lineLimit(1)
                        Text(command.state).font(.caption2).foregroundStyle(command.state == "conflict" ? courierCoral : courierMuted)
                        if let error = command.lastError { Text(error).font(.caption2).foregroundStyle(.secondary) }
                    }
                }
            }
            Section { Button("Выйти", role: .destructive, action: logout) }
        }
        .navigationTitle("Профиль")
    }
}

private struct CourierCameraPicker: UIViewControllerRepresentable {
    let onImage: (Data) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator { Coordinator(onImage: onImage, dismiss: dismiss) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let onImage: (Data) -> Void
        let dismiss: DismissAction
        init(onImage: @escaping (Data) -> Void, dismiss: DismissAction) {
            self.onImage = onImage
            self.dismiss = dismiss
        }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.86) { onImage(data) }
            dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { dismiss() }
    }
}

private extension String {
    var nilIfBlank: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}

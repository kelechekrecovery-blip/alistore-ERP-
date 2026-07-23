import AliStoreCore
@preconcurrency import AVFoundation
import SwiftData
import SwiftUI
import UIKit

struct POSSaleView: View {
    let session: StaffSession
    let openShift: () -> Void
    @Environment(\.modelContext) private var modelContext
    @State private var products: [Product] = []
    @State private var isLoading = false
    @State private var shift: CashShift?
    @State private var cart: [String: Int] = [:]
    // Список, а не один IMEI на товар: сервер при указанном IMEI принудительно
    // ставит строке `qty: 1` (`pos.service.ts:558`), поэтому две единицы одной
    // модели — это две строки. Пока здесь лежал один номер, второй сканированный
    // IMEI затирал первый, а количество откатывалось к единице.
    @State private var selectedIMEI: [String: [String]] = [:]
    @State private var scannerCode = ""
    @State private var showScanner = false
    @State private var discount = "0"
    @State private var paymentMethod = "cash"
    @State private var splitCash = ""
    @State private var activeSaleId = UUID().uuidString
    @State private var approvalId: String?
    @State private var receipt: POSReceipt?
    @State private var isBusy = false
    @State private var message: String?
    @State private var errorMessage: String?
    private let api = APIClient(baseURL: AppEnvironment.live().apiBaseURL)

    private var discountPct: Int { min(100, max(0, Int(discount) ?? 0)) }
    private var gross: Int {
        products.reduce(0) { $0 + ($1.price * (cart[$1.id] ?? 0)) }
    }
    // Формула сервера, одной копией в `POSMoney`. Целочисленный вариант
    // `gross - gross * pct / 100` отбрасывал дробь скидки и завышал чек.
    private var total: Int { POSMoney.total(gross: gross, discountPct: discountPct) }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    scanner
                    if let errorMessage { POSNotice(text: errorMessage, isError: true) }
                    // Три разных состояния, а не одно: грузим — спиннер; загрузилось пусто —
                    // честный empty state с повтором; ошибка — POSNotice выше.
                    if isLoading && products.isEmpty {
                        ProgressView("Загружаем каталог…")
                    } else if products.isEmpty && errorMessage == nil {
                        emptyCatalog
                    }
                    productGrid
                    receiptPanel
                }
                .padding(16)
            }
            .background(POSPalette.ink.ignoresSafeArea())
            // Навбар скрыт, поэтому подложки у статус-бара нет: прокручиваемый
            // контент уезжал под часы и Dynamic Island — карточка сканера
            // сталкивалась со временем. Шапка закреплена в safe area с
            // непрозрачным фоном, и контент уходит под НЕЁ, а не под часы.
            // Для кассы это ещё и правильнее: индикатор смены виден всегда,
            // а не только пока список прокручен вверх.
            .safeAreaInset(edge: .top, spacing: 0) {
                header
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 10)
                    .background(POSPalette.ink)
            }
            .toolbar(.hidden, for: .navigationBar)
            .task { await refresh() }
            .refreshable { await refresh() }
            .sheet(isPresented: $showScanner) {
                POSBarcodeScanner { value in
                    showScanner = false
                    Task { await applyScanner(value) }
                }
                .ignoresSafeArea()
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text("POS · Касса").font(.headline.weight(.bold))
                Text(shift.map { "Смена открыта · \(session.username) · \($0.point)" } ?? "Смена не открыта")
                    .font(.caption).foregroundStyle(POSPalette.muted)
            }
            Spacer()
            Circle().fill(shift == nil ? POSPalette.coral : POSPalette.lime).frame(width: 10, height: 10)
        }
    }

    private var scanner: some View {
        VStack(spacing: 10) {
            HStack {
                Image(systemName: "barcode.viewfinder").foregroundStyle(POSPalette.lime)
                TextField("SKU или IMEI", text: $scannerCode)
                    .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit { Task { await applyScanner(scannerCode) } }
                Button { showScanner = true } label: { Image(systemName: "camera.fill").minTapTarget() }
                    .buttonStyle(.borderedProminent).tint(POSPalette.coral)
                    .accessibilityLabel("Сканировать камерой")
            }
            if let message { Text(message).font(.caption).foregroundStyle(POSPalette.lime).frame(maxWidth: .infinity, alignment: .leading) }
        }
        .posSurface()
    }

    private var productGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 155), spacing: 10)], spacing: 10) {
            ForEach(products) { product in
                VStack(alignment: .leading, spacing: 8) {
                    Text(product.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                    Text(product.sku).font(.caption2).foregroundStyle(POSPalette.muted)
                    HStack {
                        Text(Money.som(product.price)).font(.caption.weight(.bold))
                        Spacer()
                        Text("\(product.availableUnits) шт.").font(.caption2).foregroundStyle(POSPalette.muted)
                    }
                    ForEach(selectedIMEI[product.id] ?? [], id: \.self) { imei in
                        Text("IMEI …\(imei.suffix(6))").font(.caption2).foregroundStyle(POSPalette.lime)
                    }
                    HStack {
                        Button { change(product, by: -1) } label: { Image(systemName: "minus").minTapTarget() }
                            .disabled((cart[product.id] ?? 0) == 0)
                            .accessibilityIdentifier("pos-qty-minus-\(product.id)")
                        Text("\(cart[product.id] ?? 0)").frame(minWidth: 24)
                        Button { change(product, by: 1) } label: { Image(systemName: "plus").minTapTarget() }
                            .disabled((cart[product.id] ?? 0) >= product.availableUnits)
                            .accessibilityIdentifier("pos-qty-plus-\(product.id)")
                    }
                    .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .posSurface()
            }
        }
    }

    private var receiptPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Чек").font(.headline.weight(.bold))
                Spacer()
                Text("\(cart.values.reduce(0, +)) поз.").font(.caption).foregroundStyle(POSPalette.muted)
            }
            if cart.isEmpty {
                Text("Добавьте товар или отсканируйте IMEI").font(.caption).foregroundStyle(POSPalette.muted)
            } else {
                ForEach(products.filter { (cart[$0.id] ?? 0) > 0 }) { product in
                    HStack {
                        Text("\(product.name) × \(cart[product.id] ?? 0)").font(.caption).lineLimit(1)
                        Spacer()
                        Text("\(product.price * (cart[product.id] ?? 0))")
                    }
                }
            }
            TextField("Скидка, %", text: $discount).keyboardType(.numberPad)
                .textFieldStyle(.roundedBorder)
            Picker("Оплата", selection: $paymentMethod) {
                Text("Наличные").tag("cash")
                Text("Карта").tag("card")
                Text("MBank").tag("qr_mbank")
                Text("О!Деньги").tag("qr_odengi")
            }
            .pickerStyle(.segmented)
            TextField("Наличные в split (необязательно)", text: $splitCash)
                .keyboardType(.numberPad).textFieldStyle(.roundedBorder)
            if let approvalId {
                Text("Approval #\(approvalId.suffix(8)). После одобрения повторите оплату.")
                    .font(.caption).foregroundStyle(POSPalette.coral)
            }
            HStack {
                Text("Итого").font(.headline)
                Spacer()
                Text(Money.som(total)).font(.title3.weight(.black)).foregroundStyle(POSPalette.lime)
            }
            if shift == nil {
                Button("Открыть смену", systemImage: "clock.badge.checkmark", action: openShift)
                    .buttonStyle(.bordered).frame(maxWidth: .infinity)
            }
            Button {
                Task { await submit() }
            } label: {
                if isBusy { ProgressView().frame(maxWidth: .infinity) }
                else { Label("Оплатить \(Money.som(total))", systemImage: "creditcard.fill").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.borderedProminent).tint(POSPalette.lime).foregroundStyle(POSPalette.ink)
            .disabled(isBusy || shift == nil || cart.isEmpty || total <= 0)
            .accessibilityIdentifier("pos-sale-submit")
            if let receipt {
                Divider()
                Text("Чек с сервера").font(.subheadline.weight(.bold))
                Text(receipt.markup).font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
                    .accessibilityIdentifier("pos-receipt-markup")
                Button("Печать", systemImage: "printer.fill") { POSReceiptPrinter.print(receipt.markup) }
                    .buttonStyle(.bordered)
                Text("ESC/POS сформирован; устройство требует отдельной сертификации")
                    .font(.caption2).foregroundStyle(POSPalette.muted)
            }
        }
        .posSurface()
    }

    @MainActor private func refresh() async {
        errorMessage = nil
        #if DEBUG
        if UITestBootstrap.startsSignedIn {
            products = Self.uiTestProducts
            shift = Self.uiTestShift
            message = "Каталог синхронизирован · 3 товара"
            return
        }
        #endif
        // Флаг обязателен: без него «ещё грузим» и «загрузилось пусто» неразличимы,
        // и при 200 с нулём товаров касса показывала спиннер бесконечно.
        isLoading = true
        defer { isLoading = false }
        do {
            async let catalog: CatalogResponse = api.get("catalog/products")
            async let currentShift: CashShift? = api.get("shifts/current", token: session.accessToken)
            products = try await catalog.items
            shift = try await currentShift
        } catch { errorMessage = error.localizedDescription }
    }

    @MainActor private func applyScanner(_ raw: String) async {
        let code = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else { return }
        if let product = products.first(where: { $0.sku.caseInsensitiveCompare(code) == .orderedSame }) {
            change(product, by: 1)
            message = "\(product.name) добавлен"
            scannerCode = ""
            return
        }
        do {
            let encoded = code.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? code
            let unit: POSUnit = try await api.get("units/\(encoded)", token: session.accessToken)
            guard unit.status == "in_stock" else { throw POSLocalError.message("IMEI недоступен: \(unit.status)") }
            guard let product = products.first(where: { $0.id == unit.productId }) else { throw POSLocalError.message("Товар IMEI отсутствует в каталоге") }
            var attached = selectedIMEI[product.id] ?? []
            guard !attached.contains(unit.imei) else {
                scannerCode = ""
                message = "IMEI …\(unit.imei.suffix(6)) уже в чеке"
                return
            }
            guard attached.count < product.availableUnits else {
                throw POSLocalError.message("В наличии \(product.availableUnits) шт. — больше единиц не привязать")
            }
            attached.append(unit.imei)
            selectedIMEI[product.id] = attached
            // Количество догоняет число привязанных номеров, а не обнуляется до
            // единицы: раньше второй скан молча возвращал корзину к одной штуке.
            cart[product.id] = max(cart[product.id] ?? 0, attached.count)
            scannerCode = ""
            message = "IMEI …\(unit.imei.suffix(6)) привязан"
        } catch { errorMessage = error.localizedDescription }
    }

    @MainActor private func submit() async {
        guard let shift else { return }
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        let cash = min(total, max(0, Int(splitCash) ?? 0))
        let payments: [POSTender]
        if cash > 0 && cash == total {
            // Раньше эта сумма проваливалась в общую ветку и уходила методом
            // `paymentMethod`: клиент отдал наличные ровно в чек, а продажа
            // записывалась как оплата картой. Касса и выручка расходились.
            payments = [POSTender(method: "cash", amount: total)]
        } else if cash > 0 {
            payments = [POSTender(method: "cash", amount: cash), POSTender(method: paymentMethod == "cash" ? "card" : paymentMethod, amount: total - cash)]
        } else {
            payments = [POSTender(method: paymentMethod, amount: total)]
        }
        let request = POSSaleRequest(
            point: shift.point,
            lines: products.flatMap { product -> [POSLine] in
                guard let qty = cart[product.id], qty > 0 else { return [] }
                // По строке на каждый привязанный номер — сервер всё равно
                // сведёт такую строку к одной единице. Остаток без номеров
                // уходит одной обычной строкой.
                let imeis = (selectedIMEI[product.id] ?? []).prefix(qty)
                let serialized = imeis.map {
                    POSLine(productId: product.id, sku: product.sku, price: product.price, qty: 1, imei: $0)
                }
                let rest = qty - serialized.count
                let bulk = rest > 0
                    ? [POSLine(productId: product.id, sku: product.sku, price: product.price, qty: rest, imei: nil)]
                    : []
                return serialized + bulk
            },
            payments: payments,
            discountPct: discountPct,
            clientSaleId: activeSaleId,
            approvalId: approvalId
        )
        #if DEBUG
        if UITestBootstrap.startsSignedIn {
            message = "POS-4102 · оплачено \(Money.som(total)) · Event Ledger"
            let markup = """
                AliStore POS
                Смена: \(shift.id)
                Товаров: \(request.lines.reduce(0) { $0 + $1.qty })
                Оплата: \(payments.map { "\($0.method)=\($0.amount)" }.joined(separator: ", "))
                Итого: \(Money.som(total))
                """
            receipt = POSReceipt(markup: markup, svg: "", escposBase64: "")
            cart = [:]
            selectedIMEI = [:]
            approvalId = nil
            activeSaleId = UUID().uuidString
            splitCash = ""
            discount = "0"
            return
        }
        #endif
        do {
            let result: POSSaleResult = try await api.post(
                "pos/sale", body: request, token: session.accessToken, idempotencyKey: activeSaleId
            )
            await consume(result)
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            // Офлайн-очередь, живущая только в памяти, до перезапуска выглядит
            // рабочей и теряет всё после него. Принимать в неё деньги нельзя.
            guard !OfflineStore.isEphemeral else {
                errorMessage = OfflineStore.failure ?? "Офлайн-очередь недоступна — проведите продажу при связи"
                return
            }
            do {
                try OfflinePOSQueue.enqueue(request, context: modelContext, owner: session.staffId)
                message = "Продажа сохранена офлайн"
                // Ключ не ротировался, корзина не чистилась — и следующая
                // офлайн-продажа уходила под тем же `clientSaleId`. Очередь
                // считала её повтором, касса писала «сохранено», выручки не было.
                resetSale()
            } catch { errorMessage = error.localizedDescription }
        }
    }

    /// Закрытие продажи: одинаково после успеха и после офлайн-сохранения.
    private func resetSale() {
        cart = [:]
        selectedIMEI = [:]
        approvalId = nil
        activeSaleId = UUID().uuidString
        splitCash = ""
        discount = "0"
    }

    @MainActor private func consume(_ result: POSSaleResult) async {
        switch result {
        case let .approvalRequired(id, reason):
            approvalId = id
            message = "Требуется одобрение: \(reason)"
        case let .completed(orderId, receiptNo, paidTotal, _, _, _):
            message = "\(receiptNo) · оплачено \(Money.som(paidTotal)) · Event Ledger"
            receipt = try? await api.get("receipts/order/\(orderId)", token: session.accessToken)
            // Скидка раньше не сбрасывалась вместе с остальным: следующий
            // покупатель молча получал скидку предыдущего, а при превышении
            // порога — ещё и требование одобрения на пустом месте.
            resetSale()
            await refresh()
        }
    }

    private func change(_ product: Product, by delta: Int) {
        let next = min(product.availableUnits, max(0, (cart[product.id] ?? 0) + delta))
        cart[product.id] = next
        // Привязанных номеров не может быть больше, чем единиц в чеке: иначе
        // лишний IMEI уехал бы в продажу молча, отдельной строкой.
        if next == 0 {
            selectedIMEI[product.id] = nil
        } else if let attached = selectedIMEI[product.id], attached.count > next {
            selectedIMEI[product.id] = Array(attached.prefix(next))
        }
    }

    #if DEBUG
    private static let uiTestProducts: [Product] = [
        Product(id: "iphone-15-128", sku: "IP15-128-BLK", name: "iPhone 15 128 ГБ Black", price: 109900, category: "phones", availableUnits: 4),
        Product(id: "airpods-pro-2", sku: "APP2-USB-C", name: "AirPods Pro 2 USB-C", price: 24900, category: "audio", availableUnits: 7),
        Product(id: "watch-s9", sku: "AWS9-45", name: "Apple Watch Series 9", price: 45900, category: "watch", availableUnits: 2)
    ]

    private static let uiTestShift = CashShift(
        id: "shift-pos-ui",
        staffId: "staff-ui-test",
        point: "AliStore Центр",
        openCash: 12000,
        openedAt: Date(timeIntervalSince1970: 1_784_240_000),
        payments: [],
        expected: 12000
    )
    #endif
}

private enum POSLocalError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(value) = self { return value }; return nil }
}

extension POSSaleView {
    /// Каталог ответил успешно, но товаров нет. Кассиру нужно сказать это прямо и дать
    /// повтор — вместо спиннера, который раньше крутился в этом случае бесконечно.
    var emptyCatalog: some View {
        VStack(spacing: 10) {
            Image(systemName: "shippingbox")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(POSPalette.muted)
            Text("Каталог пуст")
                .font(.headline)
                .foregroundStyle(Design3.textPrimary)
            Text("Сервер ответил, но товаров нет. Проверьте, что каталог заполнен и опубликован.")
                .font(.subheadline)
                .foregroundStyle(POSPalette.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button("Повторить") { Task { await refresh() } }
                .buttonStyle(.borderedProminent)
                .tint(POSPalette.coral)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .accessibilityIdentifier("pos-empty-catalog")
    }
}

struct POSNotice: View {
    let text: String
    let isError: Bool
    var body: some View {
        Label(text, systemImage: isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
            .font(.caption).foregroundStyle(isError ? POSPalette.coral : POSPalette.lime).posSurface()
    }
}

enum POSReceiptPrinter {
    @MainActor static func print(_ text: String) {
        let controller = UIPrintInteractionController.shared
        let formatter = UISimpleTextPrintFormatter(text: text)
        formatter.perPageContentInsets = UIEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        controller.printFormatter = formatter
        controller.present(animated: true)
    }
}

struct POSBarcodeScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    func makeUIViewController(context: Context) -> POSScannerController {
        let controller = POSScannerController()
        controller.onCode = onCode
        return controller
    }
    func updateUIViewController(_ uiViewController: POSScannerController, context: Context) {}
}

final class POSScannerController: UIViewController, @preconcurrency AVCaptureMetadataOutputObjectsDelegate {
    var onCode: ((String) -> Void)?
    private let captureSession = AVCaptureSession()
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device), captureSession.canAddInput(input) else { return }
        captureSession.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard captureSession.canAddOutput(output) else { return }
        captureSession.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.ean8, .ean13, .code128, .qr]
        let preview = AVCaptureVideoPreviewLayer(session: captureSession)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.addSublayer(preview)
        Task.detached { [captureSession] in captureSession.startRunning() }
    }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        captureSession.stopRunning()
        onCode?(value)
    }
}

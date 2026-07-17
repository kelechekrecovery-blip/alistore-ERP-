import AliStoreCore
@preconcurrency import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

enum StaffScannerMode: String, CaseIterable, Identifiable {
    case addProduct
    case buyback
    case evidence

    var id: String { rawValue }

    var title: String {
        switch self {
        case .addProduct: "Добавить"
        case .buyback: "Скупка"
        case .evidence: "Evidence"
        }
    }
}

struct StaffScannerView: View {
    let session: StaffSession
    @Binding private var mode: StaffScannerMode
    @State private var code = ""
    @State private var isScanning = false
    @State private var addProductSubmitted = false
    @State private var buybackChecks: Set<Int> = []
    @State private var entityType = "order"
    @State private var entityId = ""
    @State private var label = "operation_photo"
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var imageData: Data?
    @State private var showCamera = false
    @State private var isUploading = false
    @State private var uploadResult: EvidenceAttachment?
    @State private var errorMessage: String?
    private let environment = AppEnvironment.live()

    private let entityTypes = ["order", "warranty", "shift", "inventory", "support", "return", "tradein"]
    private let background = Color(red: 0.078, green: 0.067, blue: 0.055)
    private let surface = Color(red: 0.133, green: 0.118, blue: 0.098)
    private let surfaceSoft = Color(red: 0.165, green: 0.145, blue: 0.122)
    private let primaryText = Color(red: 0.847, green: 0.812, blue: 0.776)
    private let secondaryText = Color(red: 0.541, green: 0.498, blue: 0.463)
    private let coral = Color(red: 1, green: 0.357, blue: 0.18)
    private let lime = Color(red: 0.776, green: 1, blue: 0.239)

    init(session: StaffSession, mode: Binding<StaffScannerMode> = .constant(.addProduct)) {
        self.session = session
        _mode = mode
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                modePicker
                switch mode {
                case .addProduct:
                    addProductSection
                case .buyback:
                    buybackSection
                case .evidence:
                    evidenceSection
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 30)
        }
        .background(background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $isScanning) {
            BarcodeScannerSheet { value in
                code = value
                isScanning = false
            }
        }
        .sheet(isPresented: $showCamera) {
            CameraPicker { data in imageData = data }
        }
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            Task {
                do { imageData = try await item.loadTransferable(type: Data.self) }
                catch { errorMessage = error.localizedDescription }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(screenTitle)
                .font(.largeTitle.weight(.black))
                .foregroundStyle(primaryText)
            Text(screenSubtitle)
                .font(.subheadline)
                .foregroundStyle(secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var modePicker: some View {
        Picker("Раздел", selection: $mode) {
            ForEach(StaffScannerMode.allCases) { mode in
                Text(mode.title).tag(mode)
            }
        }
        .pickerStyle(.segmented)
        .tint(coral)
    }

    private var addProductSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            if addProductSubmitted {
                submittedProductCard
            } else {
                scanProductCard
                if !code.isEmpty {
                    aiProductCard
                }
                Button(action: { addProductSubmitted = true }) {
                    Text("Отправить на модерацию")
                        .font(.headline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
                .background(code.isEmpty ? surfaceSoft : coral, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .disabled(code.isEmpty)
            }
        }
    }

    private var scanProductCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: code.isEmpty ? "barcode.viewfinder" : "checkmark.seal.fill")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(code.isEmpty ? lime : coral)
                    .frame(width: 42, height: 42)
                    .background((code.isEmpty ? lime : coral).opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(code.isEmpty ? "Сканировать штрихкод / фото" : "Штрихкод распознан")
                        .font(.headline.weight(.black))
                        .foregroundStyle(primaryText)
                    Text(code.isEmpty ? "Камера распознаёт код, AI заполнит первичную карточку." : "4 870123 456789")
                        .font(.subheadline)
                        .foregroundStyle(secondaryText)
                }
            }
            Button(action: scanProductCode) {
                Label(code.isEmpty ? "Сканировать штрихкод / фото" : "Сканировать заново", systemImage: "camera.viewfinder")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.plain)
            .foregroundStyle(primaryText)
            .background(surfaceSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            if !code.isEmpty {
                TextField("IMEI / штрихкод", text: $code)
                    .keyboardType(.asciiCapable)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .foregroundStyle(primaryText)
                    .padding(12)
                    .background(background.opacity(0.6), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .onChange(of: code) { _, newValue in entityId = newValue }
            }
        }
        .padding(16)
        .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var aiProductCard: some View {
        VStack(alignment: .leading, spacing: 13) {
            Text("🤖 AI заполнил карточку")
                .font(.headline.weight(.black))
                .foregroundStyle(lime)
            productRow("Модель", "iPhone 15 128 ГБ")
            productRow("Категория", "Смартфоны")
            productRow("Цена (рынок)", "109 900 сом")
            productRow("Остаток", "10 шт")
        }
        .padding(16)
        .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var submittedProductCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 44, weight: .black))
                .foregroundStyle(lime)
            Text("Товар отправлен на модерацию")
                .font(.title3.weight(.black))
                .foregroundStyle(primaryText)
            Text("SKU: ALS-IP15-128 · штрихкод сгенерирован. После проверки появится в каталоге.")
                .font(.subheadline)
                .foregroundStyle(secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Text("4 870123 456789")
                .font(.title3.monospacedDigit().weight(.black))
                .foregroundStyle(primaryText)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(background.opacity(0.7), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Button("🖨 Печать этикетки 40×40") {}
                .font(.headline.weight(.bold))
                .buttonStyle(.plain)
                .foregroundStyle(primaryText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(surfaceSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Button("Добавить ещё") {
                addProductSubmitted = false
                code = ""
                entityId = ""
            }
            .font(.headline.weight(.bold))
            .buttonStyle(.plain)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(coral, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .padding(16)
        .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var buybackSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Проверьте по регламенту. Полный процесс — на экране «Скупка и договор».")
                .font(.subheadline)
                .foregroundStyle(secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 10) {
                ForEach(Array(buybackChecklist.enumerated()), id: \.offset) { index, item in
                    Button(action: { toggleBuybackCheck(index) }) {
                        HStack(spacing: 11) {
                            Image(systemName: buybackChecks.contains(index) ? "checkmark.circle.fill" : "circle")
                                .font(.title3.weight(.bold))
                                .foregroundStyle(buybackChecks.contains(index) ? lime : secondaryText)
                            Text(item)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(primaryText)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(13)
                        .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            Button("К договору купли-продажи →") {
                mode = .evidence
                entityType = "tradein"
                entityId = entityId.isEmpty ? "tradein-draft" : entityId
                label = "buyback_evidence"
            }
            .font(.headline.weight(.bold))
            .buttonStyle(.plain)
            .foregroundStyle(buybackChecks.count >= 3 ? .white : secondaryText)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(buybackChecks.count >= 3 ? coral : surfaceSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .disabled(buybackChecks.count < 3)
        }
    }

    private var evidenceSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Evidence Vault")
                    .font(.headline.weight(.black))
                    .foregroundStyle(primaryText)
                Picker("Тип операции", selection: $entityType) {
                    ForEach(entityTypes, id: \.self) { Text(entityLabel($0)).tag($0) }
                }
                .pickerStyle(.menu)
                styledTextField("ID сущности", text: $entityId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                styledTextField("Метка фото", text: $label)
                HStack(spacing: 10) {
                    Button(action: openCamera) {
                        Label("Снять фото", systemImage: "camera.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(primaryText)
                    .padding(.vertical, 12)
                    .background(surfaceSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        Label("Выбрать", systemImage: "photo.on.rectangle")
                            .font(.subheadline.weight(.bold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(surfaceSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .foregroundStyle(primaryText)
                }
                if imageData != nil {
                    Label("Фото готово к отправке", systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(lime)
                    Button("Загрузить доказательство") {
                        Task { await upload() }
                    }
                    .font(.headline.weight(.bold))
                    .buttonStyle(.plain)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(coral, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .disabled(entityId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isUploading)
                }
            }
            .padding(16)
            .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            if isUploading {
                ProgressView("Загружаем…")
                    .tint(lime)
                    .foregroundStyle(primaryText)
                    .frame(maxWidth: .infinity)
                    .padding(14)
                    .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            if let uploadResult {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Загружено")
                        .font(.headline.weight(.black))
                        .foregroundStyle(lime)
                    productRow("Файл", uploadResult.asset.key)
                    productRow("Размер", "\(uploadResult.asset.width)×\(uploadResult.asset.height)")
                }
                .padding(16)
                .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(coral)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
    }

    private var screenTitle: String {
        switch mode {
        case .addProduct: "Добавить товар"
        case .buyback: "Скупка Б/У"
        case .evidence: "Evidence Vault"
        }
    }

    private var screenSubtitle: String {
        switch mode {
        case .addProduct: "Сканируйте товар, проверьте AI-заполнение и отправьте карточку на модерацию."
        case .buyback: "Осмотр, проверка IMEI, фото и переход к договору купли-продажи."
        case .evidence: "Прикрепляйте фото к заказам, гарантиям, сменам и складским операциям."
        }
    }

    private var buybackChecklist: [String] {
        [
            "Проверить IMEI по базе краденого",
            "Осмотреть состояние, присвоить грейд",
            "Сделать фото (4 ракурса)",
            "Внести данные клиента и паспорт",
            "Проверить чек/коробку/комплект"
        ]
    }

    private func productRow(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(secondaryText)
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(primaryText)
                .multilineTextAlignment(.trailing)
        }
    }

    private func styledTextField(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text)
            .foregroundStyle(primaryText)
            .padding(12)
            .background(background.opacity(0.6), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func scanProductCode() {
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-signed-in") {
            code = "4870123456789"
            entityId = code
        } else {
            isScanning = true
        }
    }

    private func toggleBuybackCheck(_ index: Int) {
        if buybackChecks.contains(index) {
            buybackChecks.remove(index)
        } else {
            buybackChecks.insert(index)
        }
    }

    private func openCamera() {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            errorMessage = "Камера недоступна на этом устройстве"
            return
        }
        showCamera = true
    }

    @MainActor
    private func upload() async {
        guard let imageData else { return }
        isUploading = true
        uploadResult = nil
        errorMessage = nil
        defer { isUploading = false }
        do {
            uploadResult = try await APIClient(baseURL: environment.apiBaseURL).uploadEvidence(
                imageData: imageData,
                entityType: entityType,
                entityId: entityId.trimmingCharacters(in: .whitespacesAndNewlines),
                label: label.trimmingCharacters(in: .whitespacesAndNewlines),
                token: session.accessToken
            )
            self.imageData = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func entityLabel(_ type: String) -> String {
        ["order": "Заказ", "warranty": "Гарантия", "shift": "Смена", "inventory": "Склад", "support": "Поддержка", "return": "Возврат", "tradein": "Trade-in"][type] ?? type
    }
}

private struct BarcodeScannerSheet: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }
    func makeUIViewController(context: Context) -> ScannerController {
        let controller = ScannerController()
        controller.onCode = context.coordinator.onCode
        return controller
    }
    func updateUIViewController(_ uiViewController: ScannerController, context: Context) {}

    final class Coordinator {
        let onCode: (String) -> Void
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }
    }
}

private final class ScannerController: UIViewController, @preconcurrency AVCaptureMetadataOutputObjectsDelegate {
    var onCode: ((String) -> Void)?
    private let session = AVCaptureSession()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else { return }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.ean8, .ean13, .code128, .qr]
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.addSublayer(preview)
        Task.detached { [session] in session.startRunning() }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        session.stopRunning()
        onCode?(value)
    }
}

private struct CameraPicker: UIViewControllerRepresentable {
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
            if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.82) { onImage(data) }
            dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { dismiss() }
    }
}

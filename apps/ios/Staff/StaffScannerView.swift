import AliStoreCore
@preconcurrency import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

struct StaffScannerView: View {
    let session: StaffSession
    @State private var code = ""
    @State private var isScanning = false
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

    var body: some View {
        Form {
            Section("IMEI / штрихкод") {
                TextField("Введите или отсканируйте", text: $code)
                    .keyboardType(.asciiCapable)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                Button("Сканировать камерой", systemImage: "barcode.viewfinder") { isScanning = true }
                if !code.isEmpty {
                    LabeledContent("Результат", value: code)
                    Button("Использовать как ID", systemImage: "arrow.down.doc") { entityId = code }
                }
            }

            Section("Evidence Vault") {
                Picker("Тип операции", selection: $entityType) {
                    ForEach(entityTypes, id: \.self) { Text(entityLabel($0)).tag($0) }
                }
                TextField("ID сущности", text: $entityId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Метка фото", text: $label)
                Button("Снять фото", systemImage: "camera") {
                    guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                        errorMessage = "Камера недоступна на этом устройстве"
                        return
                    }
                    showCamera = true
                }
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label("Выбрать фото", systemImage: "photo.on.rectangle")
                }
                if imageData != nil {
                    Label("Фото готово к отправке", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Button("Загрузить доказательство", systemImage: "arrow.up.circle.fill") {
                        Task { await upload() }
                    }
                    .disabled(entityId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isUploading)
                }
            }

            if isUploading { Section { ProgressView("Загружаем…") } }
            if let uploadResult {
                Section("Загружено") {
                    LabeledContent("Файл", value: uploadResult.asset.key)
                    LabeledContent("Размер", value: "\(uploadResult.asset.width)×\(uploadResult.asset.height)")
                }
            }
            if let errorMessage {
                Section { Label(errorMessage, systemImage: "exclamationmark.triangle").foregroundStyle(.red) }
            }
        }
        .navigationTitle("Сканер")
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

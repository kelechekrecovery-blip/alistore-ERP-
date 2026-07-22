import AliStoreCore
import PhotosUI
import SwiftUI
import UIKit

enum StaffScannerMode: String, CaseIterable, Identifiable {
    case buyback
    case evidence

    var id: String { rawValue }

    var title: String {
        switch self {
        case .buyback: "Скупка"
        case .evidence: "Evidence"
        }
    }
}

struct StaffScannerView: View {
    let session: StaffSession
    @Binding private var mode: StaffScannerMode
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
    // Метки для скупки — фиксированный словарь, а не свободный текст. Свободное
    // поле по умолчанию слало `buyback_evidence`, которого нет в PII-списке
    // сервера, поэтому паспорт продавца не удалялся никогда. Значения совпадают с
    // серверной классификацией: паспортные метки — PII, `tradein_device` — нет.
    private let tradeinLabels: [(id: String, title: String)] = [
        ("passport_front", "Паспорт — разворот"),
        ("passport_back", "Паспорт — прописка"),
        ("tradein_device", "Фото устройства"),
    ]
    private let background = Design3.screen
    private let surface = Design3.surface
    private let surfaceSoft = Design3.surfaceRaised
    private let primaryText = Design3.textBright
    private let secondaryText = Design3.textMuted
    private let coral = Design3.orange
    private let lime = Design3.lime

    init(session: StaffSession, mode: Binding<StaffScannerMode> = .constant(.buyback)) {
        self.session = session
        _mode = mode
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                modePicker
                switch mode {
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
                        .contentShape(Rectangle())
                        .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("staff-buyback-check-\(index)")
                }
            }
            Button("К договору купли-продажи →") {
                mode = .evidence
                entityType = "tradein"
                entityId = entityId.isEmpty ? "tradein-draft" : entityId
                // Договор скупки начинается с паспорта продавца — метка PII, чтобы
                // фото попало под срок хранения, а не осело в базе навсегда.
                label = "passport_front"
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
                // При переходе на скупку свободная метка вроде `operation_photo`
                // не входит в словарь — иначе Picker остался бы без валидного
                // выбора, а паспорт ушёл бы под нераспознанной меткой.
                .onChange(of: entityType) { _, newValue in
                    if newValue == "tradein", !tradeinLabels.contains(where: { $0.id == label }) {
                        label = tradeinLabels[0].id
                    }
                }
                styledTextField("ID сущности", text: $entityId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                // При скупке метку выбирают из фиксированного словаря: паспорт
                // помечается PII-меткой и удаляется по сроку. Свободный текст,
                // который слал `buyback_evidence`, оставлял паспорт в базе навсегда.
                if entityType == "tradein" {
                    Picker("Что на фото", selection: $label) {
                        ForEach(tradeinLabels, id: \.id) { Text($0.title).tag($0.id) }
                    }
                    .pickerStyle(.segmented)
                } else {
                    styledTextField("Метка фото", text: $label)
                }
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
        case .buyback: "Скупка Б/У"
        case .evidence: "Evidence Vault"
        }
    }

    private var screenSubtitle: String {
        switch mode {
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

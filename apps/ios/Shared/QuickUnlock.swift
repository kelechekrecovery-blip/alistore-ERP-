import CryptoKit
import Foundation
import LocalAuthentication
import Observation
import SwiftUI

public enum QuickUnlockMethod: String, Sendable {
    case biometric
    case pin
}

public struct BiometricAuthenticator: Sendable {
    public init() {}

    public func unlock(reason: String) async -> Bool {
        await withCheckedContinuation { continuation in
            let context = LAContext()
            var error: NSError?
            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
                continuation.resume(returning: false)
                return
            }
            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, _ in
                continuation.resume(returning: success)
            }
        }
    }
}

public struct LocalPINStore: Sendable {
    private let tokens: SecureTokenStore

    public init(service: String) {
        self.tokens = SecureTokenStore(service: service)
    }

    public var isConfigured: Bool {
        (try? tokens.read(account: "quick-unlock-pin")) != nil
    }

    public func save(pin: String) throws {
        guard pin.count == 6, pin.allSatisfy(\.isNumber) else { throw QuickUnlockError.invalidPIN }
        let salt = UUID().uuidString
        let digest = SHA256.hash(data: Data((salt + pin).utf8)).map { String(format: "%02x", $0) }.joined()
        try tokens.save("\(salt):\(digest)", account: "quick-unlock-pin")
    }

    public func matches(pin: String) -> Bool {
        guard let stored = try? tokens.read(account: "quick-unlock-pin"),
              let separator = stored.firstIndex(of: ":") else { return false }
        let salt = String(stored[..<separator])
        let expected = String(stored[stored.index(after: separator)...])
        let actual = SHA256.hash(data: Data((salt + pin).utf8)).map { String(format: "%02x", $0) }.joined()
        return expected == actual
    }

    public func clear() throws {
        try tokens.clear(account: "quick-unlock-pin")
    }
}

public enum QuickUnlockError: LocalizedError, Sendable {
    case invalidPIN

    public var errorDescription: String? {
        switch self { case .invalidPIN: "PIN должен состоять из 6 цифр" }
    }
}

public struct QuickUnlockView: View {
    let title: String
    let username: String
    let pinStore: LocalPINStore
    let onUnlocked: () -> Void
    let onLogout: () -> Void
    @State private var pin = ""
    @State private var message: String?
    @State private var showingSetup = false
    @State private var setupPin = ""
    @State private var confirmPin = ""

    public init(title: String, username: String, pinService: String, onUnlocked: @escaping () -> Void, onLogout: @escaping () -> Void) {
        self.title = title
        self.username = username
        self.pinStore = LocalPINStore(service: pinService)
        self.onUnlocked = onUnlocked
        self.onLogout = onLogout
    }

    public var body: some View {
        ZStack {
            Color(red: 0.055, green: 0.047, blue: 0.039).ignoresSafeArea()
            VStack(spacing: 18) {
                Image(systemName: "faceid").font(.system(size: 48, weight: .bold)).foregroundStyle(.green)
                Text(title).font(.title.weight(.black)).foregroundStyle(.white)
                Text(username).foregroundStyle(.secondary)
                Button { Task { await biometricUnlock() } } label: {
                    Label("Открыть через Face ID", systemImage: "faceid").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).tint(Color(red: 0.776, green: 1, blue: 0.239))
                HStack { Rectangle().fill(.white.opacity(0.14)).frame(height: 1); Text("или").foregroundStyle(.secondary); Rectangle().fill(.white.opacity(0.14)).frame(height: 1) }
                SecureField("6-значный PIN", text: $pin).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                Button("Открыть по PIN") { unlockPIN() }.buttonStyle(.bordered).disabled(pin.count != 6)
                Button("Настроить PIN") { showingSetup = true }.font(.footnote)
                Button("Выйти из аккаунта", role: .destructive, action: onLogout).padding(.top, 8)
                if let message { Text(message).font(.footnote).foregroundStyle(.red) }
            }
            .padding(28)
        }
        .sheet(isPresented: $showingSetup) { pinSetup }
        .task { await biometricUnlock() }
    }

    private var pinSetup: some View {
        NavigationStack {
            Form {
                Section("Локальный доступ") { Text("PIN хранится только на этом устройстве и не заменяет серверную авторизацию.") }
                SecureField("Новый PIN", text: $setupPin).keyboardType(.numberPad)
                SecureField("Повторите PIN", text: $confirmPin).keyboardType(.numberPad)
                Button("Сохранить") {
                    guard setupPin == confirmPin else { message = "PIN-коды не совпадают"; return }
                    do { try pinStore.save(pin: setupPin); showingSetup = false; message = nil } catch { message = error.localizedDescription }
                }
            }.navigationTitle("Быстрый вход")
        }
    }

    private func biometricUnlock() async {
        guard await BiometricAuthenticator().unlock(reason: "Разблокировать рабочее место AliStore") else { return }
        await MainActor.run { onUnlocked() }
    }

    private func unlockPIN() {
        guard pinStore.matches(pin: pin) else { message = "Неверный PIN"; return }
        onUnlocked()
    }
}

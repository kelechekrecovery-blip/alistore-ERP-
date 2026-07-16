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

    public func canEvaluate() -> Bool {
        let context = LAContext()
        var error: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

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

public struct PINAttemptStatus: Sendable, Equatable {
    public let allowed: Bool
    public let retryAfterSeconds: Int
    public let failures: Int
    public let lockedUntilMillis: Int64

    public init(allowed: Bool = true, retryAfterSeconds: Int = 0, failures: Int = 0, lockedUntilMillis: Int64 = 0) {
        self.allowed = allowed
        self.retryAfterSeconds = retryAfterSeconds
        self.failures = failures
        self.lockedUntilMillis = lockedUntilMillis
    }
}

public struct LocalPINStore: Sendable {
    private let tokens: SecureTokenStore
    private static let maximumFailures = 5
    private static let lockoutMillis: Int64 = 30_000
    private static let pinAccount = "quick-unlock-pin"
    private static let attemptsAccount = "quick-unlock-pin-attempts"

    public init(service: String) {
        self.tokens = SecureTokenStore(service: service)
    }

    public var isConfigured: Bool {
        read(account: Self.pinAccount)?.hasPrefix("v1:") == true
    }

    public var attemptStatus: PINAttemptStatus {
        guard let stored = read(account: Self.attemptsAccount) else { return PINAttemptStatus() }
        let parts = stored.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 2, let failures = Int(parts[0]), let lockedUntil = Int64(parts[1]) else {
            return PINAttemptStatus()
        }
        let remaining = max(0, lockedUntil - Self.nowMillis)
        return PINAttemptStatus(
            allowed: remaining == 0,
            retryAfterSeconds: Int((remaining + 999) / 1000),
            failures: failures,
            lockedUntilMillis: lockedUntil,
        )
    }

    public func save(pin: String) throws {
        guard pin.count == 6, pin.allSatisfy(\.isNumber) else { throw QuickUnlockError.invalidPIN }
        let salt = UUID().uuidString
        let digest = SHA256.hash(data: Data((salt + pin).utf8)).map { String(format: "%02x", $0) }.joined()
        try tokens.save("v1:\(salt):\(digest)", account: Self.pinAccount)
        try tokens.clear(account: Self.attemptsAccount)
    }

    public func matches(pin: String) -> Bool {
        guard let stored = read(account: Self.pinAccount), stored.hasPrefix("v1:") else { return false }
        let parts = stored.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 3 else { return false }
        let salt = parts[1]
        let expected = parts[2]
        let actual = SHA256.hash(data: Data((salt + pin).utf8)).map { String(format: "%02x", $0) }.joined()
        return expected == actual
    }

    @discardableResult
    public func registerFailure() -> PINAttemptStatus {
        let current = attemptStatus
        guard current.allowed else { return current }
        let nextFailures = current.failures + 1
        let lockedUntil = nextFailures >= Self.maximumFailures ? Self.nowMillis + Self.lockoutMillis : 0
        try? tokens.save("\(nextFailures >= Self.maximumFailures ? 0 : nextFailures):\(lockedUntil)", account: Self.attemptsAccount)
        return attemptStatus
    }

    public func registerSuccess() {
        try? tokens.clear(account: Self.attemptsAccount)
    }

    public func clear() throws {
        try tokens.clear(account: Self.pinAccount)
        try tokens.clear(account: Self.attemptsAccount)
    }

    private func read(account: String) -> String? { (try? tokens.read(account: account)) ?? nil }
    private static var nowMillis: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
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
    @State private var pinStatus = PINAttemptStatus()
    @State private var biometricAvailable = false
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
                if biometricAvailable {
                    Button { Task { await biometricUnlock() } } label: {
                        Label("Открыть через Face ID", systemImage: "faceid").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(Color(red: 0.776, green: 1, blue: 0.239))
                } else {
                    Text("Биометрия недоступна — используйте PIN")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                HStack { Rectangle().fill(.white.opacity(0.14)).frame(height: 1); Text("или").foregroundStyle(.secondary); Rectangle().fill(.white.opacity(0.14)).frame(height: 1) }
                SecureField("6-значный PIN", text: $pin).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                Button("Открыть по PIN") { unlockPIN() }.buttonStyle(.bordered).disabled(pin.count != 6 || !pinStatus.allowed)
                Button("Настроить PIN") { showingSetup = true }.font(.footnote)
                Button("Выйти из аккаунта", role: .destructive, action: logout).padding(.top, 8)
                if let message { Text(message).font(.footnote).foregroundStyle(.red) }
                if !pinStatus.allowed { Text("Слишком много попыток. Повторите через \(pinStatus.retryAfterSeconds) сек.").font(.footnote).foregroundStyle(.orange) }
            }
            .padding(28)
        }
        .sheet(isPresented: $showingSetup) { pinSetup }
        .task {
            pinStatus = pinStore.attemptStatus
            biometricAvailable = BiometricAuthenticator().canEvaluate()
            if biometricAvailable { await biometricUnlock() }
        }
        .task(id: pinStatus.lockedUntilMillis) {
            while !pinStatus.allowed {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                pinStatus = pinStore.attemptStatus
            }
        }
    }

    private var pinSetup: some View {
        NavigationStack {
            Form {
                Section("Локальный доступ") { Text("PIN хранится только на этом устройстве и не заменяет серверную авторизацию.") }
                SecureField("Новый PIN", text: $setupPin).keyboardType(.numberPad)
                SecureField("Повторите PIN", text: $confirmPin).keyboardType(.numberPad)
                Button("Сохранить") {
                    guard setupPin == confirmPin else { message = "PIN-коды не совпадают"; return }
                    do { try pinStore.save(pin: setupPin); pinStatus = pinStore.attemptStatus; showingSetup = false; message = nil } catch { message = error.localizedDescription }
                }
            }.navigationTitle("Быстрый вход")
        }
    }

    private func biometricUnlock() async {
        guard BiometricAuthenticator().canEvaluate() else { return }
        guard await BiometricAuthenticator().unlock(reason: "Разблокировать рабочее место AliStore") else { return }
        await MainActor.run { onUnlocked() }
    }

    private func unlockPIN() {
        guard pinStatus.allowed else { pinStatus = pinStore.attemptStatus; return }
        guard pinStore.matches(pin: pin) else {
            pinStatus = pinStore.registerFailure()
            message = pinStatus.allowed ? "Неверный PIN" : "Слишком много попыток"
            return
        }
        pinStore.registerSuccess()
        onUnlocked()
    }

    private func logout() {
        try? pinStore.clear()
        onLogout()
    }
}

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
    private static let lime = Color(red: 0.776, green: 1, blue: 0.239)
    private static let card = Color.white.opacity(0.07)
    private static let surface = Color.white.opacity(0.055)
    private static let field = Color.white.opacity(0.09)
    private static let line = Color.white.opacity(0.12)

    public init(title: String, username: String, pinService: String, onUnlocked: @escaping () -> Void, onLogout: @escaping () -> Void) {
        self.title = title
        self.username = username
        self.pinStore = LocalPINStore(service: pinService)
        self.onUnlocked = onUnlocked
        self.onLogout = onLogout
    }

    public var body: some View {
        ZStack {
            quickBackground
            ScrollView {
                VStack(spacing: 18) {
                    VStack(spacing: 12) {
                        Image(systemName: biometricAvailable ? "faceid" : "lock.shield.fill")
                            .font(.system(size: 36, weight: .bold))
                            .foregroundStyle(Self.lime)
                            .frame(width: 72, height: 72)
                            .background(Self.lime.opacity(0.13), in: RoundedRectangle(cornerRadius: 22))
                            .overlay(RoundedRectangle(cornerRadius: 22).stroke(Self.lime.opacity(0.32)))
                        Text(title)
                            .font(.system(size: 30, weight: .black, design: .rounded))
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                        Text(username)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.62))
                            .lineLimit(1)
                    }
                    .padding(.top, 20)

                    VStack(spacing: 14) {
                        if biometricAvailable {
                            Button { Task { await biometricUnlock() } } label: {
                                Label("Открыть через Face ID", systemImage: "faceid")
                                    .font(.headline.weight(.bold))
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 54)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.black)
                            .background(Self.lime, in: RoundedRectangle(cornerRadius: 16))
                            .accessibilityIdentifier("quick-unlock-faceid")
                        } else {
                            statusPanel("Биометрия недоступна", detail: "Используйте локальный PIN-код для быстрого доступа.", symbol: "faceid")
                        }

                        divider

                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("PIN-код")
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(.white)
                                Spacer()
                                Text(pinStore.isConfigured ? "настроен" : "не настроен")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(pinStore.isConfigured ? Self.lime : .orange)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background((pinStore.isConfigured ? Self.lime : Color.orange).opacity(0.14), in: Capsule())
                            }
                            SecureField("6 цифр", text: $pin)
                                .keyboardType(.numberPad)
                                .textContentType(.oneTimeCode)
                                .foregroundStyle(.white)
                                .padding(.horizontal, 14)
                                .frame(height: 50)
                                .background(Self.field, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Self.line))
                                .onChange(of: pin) { _, newValue in pin = Self.normalizedPIN(newValue) }
                                .accessibilityIdentifier("quick-unlock-pin")
                            pinDots(count: pin.count)
                            Button { unlockPIN() } label: {
                                Text("Открыть по PIN")
                                    .font(.headline.weight(.bold))
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 50)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(pin.count == 6 && pinStatus.allowed ? .black : .white.opacity(0.45))
                            .background(pin.count == 6 && pinStatus.allowed ? Self.lime : Self.field, in: RoundedRectangle(cornerRadius: 15))
                            .disabled(pin.count != 6 || !pinStatus.allowed)
                            .accessibilityIdentifier("quick-unlock-pin-submit")
                        }

                        if let message {
                            statusPanel(message, detail: nil, symbol: "exclamationmark.triangle.fill", tint: .red)
                        }
                        if !pinStatus.allowed {
                            statusPanel("Слишком много попыток", detail: "Повторите через \(pinStatus.retryAfterSeconds) сек.", symbol: "clock.fill", tint: .orange)
                        }

                        Button { showingSetup = true } label: {
                            Label(pinStore.isConfigured ? "Изменить PIN" : "Настроить PIN", systemImage: "key.fill")
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .frame(height: 46)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.white)
                        .background(Self.surface, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Self.line))

                        Label("PIN хранится в Keychain этого устройства и не заменяет серверную авторизацию.", systemImage: "shield.checkered")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.55))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(18)
                    .background(Self.card, in: RoundedRectangle(cornerRadius: 24))
                    .overlay(RoundedRectangle(cornerRadius: 24).stroke(Self.line))

                    Button("Выйти из аккаунта", role: .destructive, action: logout)
                        .font(.subheadline.weight(.semibold))
                        .padding(.bottom, 12)
                }
                .padding(22)
            }
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
            ZStack {
                quickBackground
                VStack(alignment: .leading, spacing: 16) {
                    Text("Быстрый вход")
                        .font(.system(size: 28, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                    Text("Создайте 6-значный PIN для этого устройства. Face ID остаётся основным способом, если доступен.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.62))
                    VStack(spacing: 12) {
                        SecureField("Новый PIN", text: $setupPin)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .frame(height: 50)
                            .background(Self.field, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Self.line))
                            .onChange(of: setupPin) { _, newValue in setupPin = Self.normalizedPIN(newValue) }
                        SecureField("Повторите PIN", text: $confirmPin)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .frame(height: 50)
                            .background(Self.field, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Self.line))
                            .onChange(of: confirmPin) { _, newValue in confirmPin = Self.normalizedPIN(newValue) }
                    }
                    Button {
                        guard setupPin == confirmPin else { message = "PIN-коды не совпадают"; return }
                        do {
                            try pinStore.save(pin: setupPin)
                            pinStatus = pinStore.attemptStatus
                            setupPin = ""
                            confirmPin = ""
                            showingSetup = false
                            message = nil
                        } catch {
                            message = error.localizedDescription
                        }
                    } label: {
                        Text("Сохранить PIN")
                            .font(.headline.weight(.bold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(setupPin.count == 6 && confirmPin.count == 6 ? .black : .white.opacity(0.45))
                    .background(setupPin.count == 6 && confirmPin.count == 6 ? Self.lime : Self.field, in: RoundedRectangle(cornerRadius: 15))
                    .disabled(setupPin.count != 6 || confirmPin.count != 6)
                    statusPanel("Локально и безопасно", detail: "PIN хранится только в Keychain и сбрасывается при выходе из аккаунта.", symbol: "lock.fill")
                    Spacer()
                }
                .padding(22)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { showingSetup = false }
                }
            }
        }
    }

    private var quickBackground: some View {
        LinearGradient(
            colors: [Color(red: 0.055, green: 0.047, blue: 0.039), Color(red: 0.02, green: 0.024, blue: 0.022)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private var divider: some View {
        HStack(spacing: 10) {
            Rectangle().fill(Self.line).frame(height: 1)
            Text("или")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white.opacity(0.45))
            Rectangle().fill(Self.line).frame(height: 1)
        }
    }

    private func pinDots(count: Int) -> some View {
        HStack(spacing: 8) {
            ForEach(0..<6, id: \.self) { index in
                Circle()
                    .fill(index < count ? Self.lime : .white.opacity(0.14))
                    .frame(width: 9, height: 9)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    private func statusPanel(_ title: String, detail: String?, symbol: String, tint: Color = Self.lime) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(tint)
                .frame(width: 26, height: 26)
                .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.white)
                if let detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.58))
                }
            }
            Spacer()
        }
        .padding(12)
        .background(Self.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Self.line))
    }

    private static func normalizedPIN(_ value: String) -> String {
        String(value.filter(\.isNumber).prefix(6))
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

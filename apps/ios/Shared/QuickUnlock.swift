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

/// Хранилище секрета быстрого входа. В бою это Keychain (`SecureTokenStore`),
/// в тестах — реализация в памяти: `AliStoreCoreTests` собирается без подписи,
/// а неподписанному бандлу Keychain отвечает `errSecMissingEntitlement`.
public protocol QuickUnlockStorage: Sendable {
    func save(_ value: String, account: String) throws
    func read(account: String) throws -> String?
    func clear(account: String) throws
}

extension SecureTokenStore: QuickUnlockStorage {}

public struct LocalPINStore: Sendable {
    private let tokens: any QuickUnlockStorage
    private static let maximumFailures = 5
    private static let lockoutMillis: Int64 = 30_000
    private static let pinAccount = "quick-unlock-pin"
    private static let attemptsAccount = "quick-unlock-pin-attempts"

    public init(service: String) {
        self.tokens = SecureTokenStore(service: service)
    }

    public init(storage: any QuickUnlockStorage) {
        self.tokens = storage
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
        // Клампим остаток к полному окну лок-аута. Дедлайн хранится в монотонных
        // часах (`systemUptime`), которые пользователь не может отмотать назад,
        // но которые обнуляются при перезагрузке. После ребута сохранённый дедлайн
        // окажется «в будущем» относительно нового аптайма — кламп превращает это
        // в повторное наложение тех же 30 секунд, а не в вечную блокировку.
        // Инвариант: лок-аут нельзя ни обойти сменой часов, ни растянуть сверх окна.
        let remaining = min(Self.lockoutMillis, max(0, lockedUntil - Self.nowMillis))
        return PINAttemptStatus(
            allowed: remaining == 0,
            retryAfterSeconds: Int((remaining + 999) / 1000),
            failures: failures,
            lockedUntilMillis: lockedUntil,
        )
    }

    /// Первичная установка PIN. Отказывает, если секрет уже есть: единственный
    /// законный способ заменить существующий — `changePIN(current:new:)`.
    ///
    /// Раньше здесь был `save(pin:)` без единой проверки, и он же вызывался с
    /// locked-экрана. Человек, взявший разблокированный телефон, ставил свой PIN
    /// и попутно обнулял счётчик попыток. Проверка сделана на уровне API, а не
    /// пряталкой кнопки: спрятанную кнопку вернёт первый же рефакторинг вью.
    public func setInitialPIN(_ pin: String) throws {
        guard !isConfigured else { throw QuickUnlockError.alreadyConfigured }
        try writePIN(pin)
    }

    /// Замена PIN с доказательством знания текущего.
    ///
    /// Промах считается наравне с неудачным входом и упирается в тот же лок-аут —
    /// иначе смена PIN была бы безлимитным оракулом для подбора шестизначного кода.
    public func changePIN(current: String, new: String) throws {
        guard attemptStatus.allowed else { throw QuickUnlockError.locked }
        guard matches(pin: current) else {
            registerFailure()
            throw QuickUnlockError.wrongPIN
        }
        try writePIN(new)
    }

    private func writePIN(_ pin: String) throws {
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

    /// Монотонные часы: секунды с загрузки, а не настенное время. Перевод
    /// системных часов на них не влияет — иначе лок-аут снимался бы установкой
    /// времени вперёд. Обнуление при ребуте обезврежено клампом в `attemptStatus`.
    private static var nowMillis: Int64 { Int64(ProcessInfo.processInfo.systemUptime * 1000) }
}

/// Решение о повторной блокировке при уходе в фон. Вынесено из сторов, потому что
/// сессия в них приватна и заводится только сетевым логином — а само правило
/// («блокировать лишь при активной сессии и настроенном PIN») проверяемо без
/// сети и Keychain.
public enum QuickUnlockGate {
    public static func shouldLock(hasSession: Bool, pinConfigured: Bool) -> Bool {
        hasSession && pinConfigured
    }
}

public enum QuickUnlockError: LocalizedError, Sendable, Equatable {
    case invalidPIN
    case wrongPIN
    case alreadyConfigured
    case locked

    public var errorDescription: String? {
        switch self {
        case .invalidPIN: "PIN должен состоять из 6 цифр"
        case .wrongPIN: "Неверный текущий PIN"
        case .alreadyConfigured: "PIN уже задан. Смените его, введя текущий"
        case .locked: "Слишком много попыток. Подождите и повторите"
        }
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
    /// Текущий PIN — требуется только при замене уже заданного.
    @State private var currentPin = ""
    @State private var confirmPin = ""
    private static let lime = Design3.lime
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
                        if pinStore.isConfigured {
                            SecureField("Текущий PIN", text: $currentPin)
                                .keyboardType(.numberPad)
                                .textContentType(.oneTimeCode)
                                .foregroundStyle(.white)
                                .padding(.horizontal, 14)
                                .frame(height: 50)
                                .background(Self.field, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Self.line))
                                .onChange(of: currentPin) { _, newValue in currentPin = Self.normalizedPIN(newValue) }
                                .accessibilityIdentifier("quick-unlock-current-pin")
                        }
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
                            // Замена существующего PIN требует знания текущего —
                            // иначе экран блокировки сам себя и обходит.
                            if pinStore.isConfigured {
                                try pinStore.changePIN(current: currentPin, new: setupPin)
                            } else {
                                try pinStore.setInitialPIN(setupPin)
                            }
                            currentPin = ""
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
            colors: [Design3.frame, Design3.screen],
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

import Foundation
import Observation

@MainActor
@Observable
public final class CustomerAuthStore {
    public private(set) var session: CustomerSession?
    public private(set) var isRestoring = true
    public private(set) var isLoading = false
    public private(set) var errorMessage: String?
    public private(set) var devCode: String?
    public private(set) var requiresQuickUnlock = false
    public let quickUnlockService: String

    private let api: APIClient
    private let tokens: SecureTokenStore
    private let restoresStoredSession: Bool
    /// См. `StaffAuthStore.isPinConfigured` — та же причина инъекции.
    private let isPinConfigured: () -> Bool

    public init(
        environment: AppEnvironment,
        keychainService: String = "kg.alistore.client.auth",
        restoresStoredSession: Bool = true,
        isPinConfigured: (() -> Bool)? = nil,
        session: URLSession = .shared
    ) {
        self.api = APIClient(baseURL: environment.apiBaseURL, session: session)
        self.tokens = SecureTokenStore(service: keychainService)
        self.quickUnlockService = keychainService
        self.restoresStoredSession = restoresStoredSession
        self.isPinConfigured = isPinConfigured ?? { LocalPINStore(service: keychainService).isConfigured }
        if !restoresStoredSession { isRestoring = false }
    }

    public func restore() async {
        guard restoresStoredSession else { return }
        defer { isRestoring = false }
        guard let stored = try? readSession() else { return }
        do {
            let principal: CustomerPrincipal = try await api.get("auth/me", token: stored.accessToken)
            session = CustomerSession(
                accessToken: stored.accessToken,
                refreshToken: stored.refreshToken,
                customerId: principal.customerId,
                phone: principal.phone ?? stored.phone
            )
            requiresQuickUnlock = true
        } catch {
            await refresh(stored)
        }
    }

    public func requestOTP(phone: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let challenge: OTPChallenge = try await api.post("auth/otp/request", body: OTPRequest(phone: phone))
            devCode = challenge.devCode
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Запрашивает код входа на email.
    ///
    /// Сервер отвечает одинаково и для известного, и для неизвестного адреса —
    /// он не должен подсказывать, есть ли у человека аккаунт. Поэтому `true`
    /// здесь означает «код запрошен», а не «аккаунт существует»: письмо придёт
    /// только владельцу привязанного адреса.
    public func requestEmailOTP(email: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let challenge: OTPChallenge = try await api.post(
                "auth/email/request",
                body: EmailOTPRequest(email: Self.normalizedEmail(email))
            )
            devCode = challenge.devCode
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Проверяет код и открывает сессию. В отличие от телефона аккаунт здесь
    /// никогда не создаётся: адрес без телефона клиентом стать не может.
    public func verifyEmail(email: String, code: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let address = Self.normalizedEmail(email)
            let auth: CustomerAuthTokens = try await api.post(
                "auth/email/verify",
                body: EmailOTPVerification(email: address, code: code)
            )
            let principal: CustomerPrincipal = try await api.get("auth/me", token: auth.accessToken)
            let next = CustomerSession(
                accessToken: auth.accessToken,
                refreshToken: auth.refreshToken,
                customerId: principal.customerId,
                phone: principal.phone ?? ""
            )
            clearQuickUnlock()
            try save(next)
            session = next
            requiresQuickUnlock = false
            devCode = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Отправляет код подтверждения на адрес, который владелец сессии хочет привязать.
    /// Аккаунт при этом не меняется — сначала надо доказать доступ к почтовому ящику.
    public func requestEmailAttach(email: String, token: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let challenge: OTPChallenge = try await api.post(
                "auth/email/attach/request",
                body: EmailOTPRequest(email: Self.normalizedEmail(email)),
                token: token
            )
            devCode = challenge.devCode
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Подтверждает код и привязывает адрес к аккаунту.
    public func confirmEmailAttach(email: String, code: String, token: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await api.postNoContent(
                "auth/email/attach/confirm",
                body: EmailOTPVerification(email: Self.normalizedEmail(email), code: code),
                token: token
            )
            devCode = nil
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Тот же вид адреса, что хранит сервер. Без этого адрес, скопированный с
    /// пробелом на конце или набранный с заглавной, уезжал бы в 400.
    public static func normalizedEmail(_ rawEmail: String) -> String {
        rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    public func verify(phone: String, code: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let auth: CustomerAuthTokens = try await api.post(
                "auth/otp/verify",
                body: OTPVerification(phone: phone, code: code)
            )
            let principal: CustomerPrincipal = try await api.get("auth/me", token: auth.accessToken)
            let next = CustomerSession(
                accessToken: auth.accessToken,
                refreshToken: auth.refreshToken,
                customerId: principal.customerId,
                phone: principal.phone ?? phone
            )
            clearQuickUnlock()
            try save(next)
            session = next
            requiresQuickUnlock = false
            devCode = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func logout() async {
        if let refreshToken = session?.refreshToken {
            try? await api.postNoContent("auth/logout", body: RefreshRequest(refreshToken: refreshToken))
        }
        clearQuickUnlock()
        try? tokens.clear(account: "customer-session")
        session = nil
        requiresQuickUnlock = false
        errorMessage = nil
        devCode = nil
    }

    private func refresh(_ stored: CustomerSession) async {
        do {
            let auth: CustomerAuthTokens = try await api.post(
                "auth/refresh",
                body: RefreshRequest(refreshToken: stored.refreshToken)
            )
            let principal: CustomerPrincipal = try await api.get("auth/me", token: auth.accessToken)
            let next = CustomerSession(
                accessToken: auth.accessToken,
                refreshToken: auth.refreshToken,
                customerId: principal.customerId,
                phone: principal.phone ?? stored.phone
            )
            try save(next)
            session = next
            requiresQuickUnlock = true
        } catch {
            clearQuickUnlock()
            try? tokens.clear(account: "customer-session")
            session = nil
        }
    }

    public func unlock() { requiresQuickUnlock = false }

    /// Повторно закрывает аккаунт при уходе приложения в фон — иначе на общем
    /// устройстве следующий увидит заказы, адреса и историю предыдущего. Только
    /// при активной сессии и настроенном PIN.
    public func lock() {
        guard QuickUnlockGate.shouldLock(hasSession: session != nil, pinConfigured: isPinConfigured()) else { return }
        requiresQuickUnlock = true
    }

    #if DEBUG
    /// Supplies a non-network session for deterministic SwiftUI account screenshots.
    /// The fixture is compiled out of Release and never writes to Keychain.
    public func useUITestSession() {
        session = CustomerSession(
            accessToken: "ui-test-access-token",
            refreshToken: "ui-test-refresh-token",
            customerId: "ui-test-customer",
            phone: "+996 700 00 12 34"
        )
        isRestoring = false
        requiresQuickUnlock = UITestBootstrap.requiresQuickUnlock
        errorMessage = nil
    }
    #endif

    private func clearQuickUnlock() {
        try? tokens.clear(account: "quick-unlock-pin")
        try? tokens.clear(account: "quick-unlock-pin-attempts")
    }

    private func save(_ session: CustomerSession) throws {
        let data = try JSONEncoder().encode(session)
        guard let value = String(data: data, encoding: .utf8) else { throw APIError.invalidResponse }
        try tokens.save(value, account: "customer-session")
    }

    private func readSession() throws -> CustomerSession? {
        guard let value = try tokens.read(account: "customer-session"), let data = value.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(CustomerSession.self, from: data)
    }
}

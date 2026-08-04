import Foundation
import Observation

@MainActor
@Observable
public final class CustomerAuthStore {
    private struct RefreshFlight {
        let id: UUID
        let refreshToken: String
        let generation: UInt64
        let task: Task<CustomerSession, Error>
    }

    public private(set) var session: CustomerSession?
    public private(set) var isRestoring = true
    public private(set) var isLoading = false
    public private(set) var errorMessage: String?
    public private(set) var devCode: String?
    public private(set) var phoneChallengeId: String?
    public private(set) var emailChallengeId: String?
    public private(set) var emailAttachChallengeId: String?
    public private(set) var requiresApplePhoneEnrollment = false
    public private(set) var appleEnrollmentExpiresAt: Date?
    public private(set) var requiresQuickUnlock = false
    public let quickUnlockService: String

    private let api: APIClient
    private let tokens: SecureTokenStore
    private let restoresStoredSession: Bool
    private var refreshFlight: RefreshFlight?
    private var sessionGeneration: UInt64 = 0
    /// Opaque, short-lived bearer secret. Intentionally never encoded or persisted.
    private var appleEnrollmentToken: String?
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
            sessionGeneration &+= 1
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
            phoneChallengeId = challenge.challengeId
            devCode = challenge.devCode
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Показывает ошибку входа, случившуюся до обращения к серверу — например
    /// когда Apple не вернула токен. Иначе экран молчит, и человек не понимает,
    /// нажалась кнопка или нет.
    public func reportSignInFailure(_ message: String) {
        errorMessage = message
    }

    /// Вход через Apple: обменивает identityToken на сессию.
    ///
    /// `nonce` передаётся ровно тем, что было положено в
    /// `ASAuthorizationAppleIDRequest.nonce` — Apple кладёт эту же строку в claim
    /// токена, а сервер сравнивает их напрямую. Любое преобразование здесь даёт
    /// «nonce mismatch», который на устройстве выглядит как молчаливый отказ входа.
    public func signInWithApple(identityToken: String, nonce: String, name: String?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        guard !nonce.isEmpty else {
            errorMessage = "Не удалось подтвердить безопасный вход Apple. Попробуйте ещё раз."
            return
        }
        clearAppleEnrollment()
        do {
            let trimmedName = name?.trimmingCharacters(in: .whitespacesAndNewlines)
            let result: CustomerSocialAuthResult = try await api.post(
                "auth/v2/social/apple",
                body: AppleSocialLogin(
                    identityToken: identityToken,
                    nonce: nonce,
                    // Пустое имя хуже отсутствующего: сервер склеит из него displayName.
                    name: (trimmedName?.isEmpty ?? true) ? nil : trimmedName
                )
            )
            switch result {
            case .authenticated(let auth):
                try await finishAuthentication(auth, fallbackPhone: "")
            case .enrollmentRequired(let enrollmentToken, let expiresIn):
                appleEnrollmentToken = enrollmentToken
                appleEnrollmentExpiresAt = Date().addingTimeInterval(TimeInterval(expiresIn))
                requiresApplePhoneEnrollment = true
                phoneChallengeId = nil
                devCode = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Completes an unknown Apple identity by proving the canonical customer phone.
    /// The enrollment token remains memory-only and survives retryable OTP errors.
    public func completeAppleEnrollment(phone: String, code: String) async {
        guard let enrollmentToken = appleEnrollmentToken else {
            errorMessage = "Сессия регистрации Apple истекла. Начните вход заново."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let result: CustomerSocialAuthResult = try await api.post(
                "auth/v2/social/enrollment/complete",
                body: CompleteSocialEnrollmentRequest(
                    enrollmentToken: enrollmentToken,
                    phone: phone,
                    code: code,
                    challengeId: phoneChallengeId
                )
            )
            guard case .authenticated(let auth) = result else {
                throw APIError.invalidResponse
            }
            try await finishAuthentication(auth, fallbackPhone: phone)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func cancelAppleEnrollment() {
        clearAppleEnrollment()
        errorMessage = nil
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
            emailChallengeId = challenge.challengeId
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
                body: EmailOTPVerification(email: address, code: code, challengeId: emailChallengeId)
            )
            let principal: CustomerPrincipal = try await api.get("auth/me", token: auth.accessToken)
            let next = CustomerSession(
                accessToken: auth.accessToken,
                refreshToken: auth.refreshToken,
                customerId: principal.customerId,
                phone: principal.phone ?? ""
            )
            try activate(next, requiresQuickUnlock: false)
            devCode = nil
            emailChallengeId = nil
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
            emailAttachChallengeId = challenge.challengeId
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
                body: EmailOTPVerification(
                    email: Self.normalizedEmail(email),
                    code: code,
                    challengeId: emailAttachChallengeId
                ),
                token: token
            )
            devCode = nil
            emailAttachChallengeId = nil
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
                body: OTPVerification(phone: phone, code: code, challengeId: phoneChallengeId)
            )
            let principal: CustomerPrincipal = try await api.get("auth/me", token: auth.accessToken)
            let next = CustomerSession(
                accessToken: auth.accessToken,
                refreshToken: auth.refreshToken,
                customerId: principal.customerId,
                phone: principal.phone ?? phone
            )
            try activate(next, requiresQuickUnlock: false)
            devCode = nil
            phoneChallengeId = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func logout() async {
        let refreshToken = session?.refreshToken
        invalidateRefreshFlight()
        clearQuickUnlock()
        try? tokens.clear(account: "customer-session")
        session = nil
        requiresQuickUnlock = false
        errorMessage = nil
        devCode = nil
        phoneChallengeId = nil
        emailChallengeId = nil
        emailAttachChallengeId = nil
        clearAppleEnrollment()
        if let refreshToken {
            try? await api.postNoContent("auth/logout", body: RefreshRequest(refreshToken: refreshToken))
        }
    }

    /// - Parameter requiringUnlock: `true` — обновление на холодном старте, после
    ///   него экран быстрого разблокирования уместен. `false` — тихое обновление
    ///   по 401 посреди работы: требовать PIN в этот момент значит выкинуть
    ///   человека из оформления заказа за то, что истёк токен.
    private func refresh(_ stored: CustomerSession, requiringUnlock: Bool = true) async {
        let generation = sessionGeneration
        let flight: RefreshFlight
        if let current = refreshFlight,
           current.refreshToken == stored.refreshToken,
           current.generation == generation {
            flight = current
        } else {
            let api = self.api
            let task = Task {
                let auth: CustomerAuthTokens = try await api.post(
                    "auth/refresh",
                    body: RefreshRequest(refreshToken: stored.refreshToken)
                )
                let principal: CustomerPrincipal = try await api.get("auth/me", token: auth.accessToken)
                return CustomerSession(
                    accessToken: auth.accessToken,
                    refreshToken: auth.refreshToken,
                    customerId: principal.customerId,
                    phone: principal.phone ?? stored.phone
                )
            }
            flight = RefreshFlight(
                id: UUID(),
                refreshToken: stored.refreshToken,
                generation: generation,
                task: task
            )
            refreshFlight = flight
        }
        do {
            let next = try await flight.task.value
            guard canApplyRefresh(flight, stored: stored) else { return }
            if restoresStoredSession { try save(next) }
            session = next
            sessionGeneration &+= 1
            if requiringUnlock { requiresQuickUnlock = true }
        } catch {
            guard canApplyRefresh(flight, stored: stored) else { return }
            // Сессию гасим только когда сервер сам отверг refresh-токен.
            // Раньше сюда попадал и запуск без сети: пропавший интернет стирал
            // и сохранённую сессию, и PIN быстрого входа — человек в самолёте
            // терял аккаунт и не мог его вернуть до полноценного входа.
            guard case let APIError.rejected(status, _) = error, status == 401 || status == 403 else { return }
            clearQuickUnlock()
            try? tokens.clear(account: "customer-session")
            session = nil
            sessionGeneration &+= 1
        }
        if refreshFlight?.id == flight.id {
            refreshFlight = nil
        }
    }

    /// Refreshes the active customer session while coalescing concurrent callers.
    /// Rotating refresh tokens must be exchanged exactly once.
    @discardableResult
    public func refreshSession() async -> Bool {
        guard let session else { return false }
        await refresh(session)
        return self.session != nil
    }

    /// Ставит в `APIClient` реакцию на 401: обновить доступ и отдать новый токен
    /// для одного повтора. Вызывать один раз при сборке окружения приложения.
    ///
    /// `refreshFlight` уже коалесцирует параллельные вызовы, поэтому пачка
    /// одновременных 401 обменяет ротируемый refresh-токен ровно один раз.
    public func installUnauthorizedHandler() async {
        await UnauthorizedRegistry.shared.set { [weak self] in
            await self?.renewAccessToken()
        }
    }

    /// Тихое обновление для повтора запроса: без требования PIN.
    func renewAccessToken() async -> String? {
        guard let current = session else { return nil }
        await refresh(current, requiringUnlock: false)
        return session?.accessToken
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
    public func useUITestSession(_ fixture: CustomerSession? = nil) {
        let next = fixture ?? CustomerSession(
                accessToken: "ui-test-access-token",
                refreshToken: "ui-test-refresh-token",
                customerId: "ui-test-customer",
                phone: "+996 700 00 12 34"
            )
        try? activate(next, requiresQuickUnlock: UITestBootstrap.requiresQuickUnlock, persists: false)
        isRestoring = false
        errorMessage = nil
    }

    public func useUITestAppleEnrollment() {
        clearAppleEnrollment()
        appleEnrollmentToken = String(repeating: "u", count: 48)
        appleEnrollmentExpiresAt = Date().addingTimeInterval(600)
        requiresApplePhoneEnrollment = true
        isRestoring = false
        errorMessage = nil
    }
    #endif

    private func clearQuickUnlock() {
        try? tokens.clear(account: "quick-unlock-pin")
        try? tokens.clear(account: "quick-unlock-pin-attempts")
    }

    private func invalidateRefreshFlight() {
        sessionGeneration &+= 1
        refreshFlight?.task.cancel()
        refreshFlight = nil
    }

    private func activate(
        _ next: CustomerSession,
        requiresQuickUnlock: Bool,
        persists: Bool? = nil
    ) throws {
        invalidateRefreshFlight()
        clearQuickUnlock()
        if persists ?? restoresStoredSession { try save(next) }
        session = next
        self.requiresQuickUnlock = requiresQuickUnlock
        clearAppleEnrollment()
    }

    private func finishAuthentication(_ auth: CustomerAuthTokens, fallbackPhone: String) async throws {
        let principal: CustomerPrincipal = try await api.get("auth/me", token: auth.accessToken)
        let next = CustomerSession(
            accessToken: auth.accessToken,
            refreshToken: auth.refreshToken,
            customerId: principal.customerId,
            phone: principal.phone ?? fallbackPhone
        )
        try activate(next, requiresQuickUnlock: false)
        devCode = nil
    }

    private func clearAppleEnrollment() {
        appleEnrollmentToken = nil
        appleEnrollmentExpiresAt = nil
        requiresApplePhoneEnrollment = false
        phoneChallengeId = nil
        devCode = nil
    }

    private func canApplyRefresh(_ flight: RefreshFlight, stored: CustomerSession) -> Bool {
        guard sessionGeneration == flight.generation else { return false }
        // During restore `session` is nil and generation is the authority. During
        // an active-session refresh, the initiating rotating token must still be current.
        return session == nil || session?.refreshToken == stored.refreshToken
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

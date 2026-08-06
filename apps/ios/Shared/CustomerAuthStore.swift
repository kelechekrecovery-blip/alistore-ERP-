import CryptoKit
import Foundation
import Observation

private final class SocialDisconnectCompletionGate: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Error?, Never>?

    init(_ continuation: CheckedContinuation<Error?, Never>) {
        self.continuation = continuation
    }

    func resume(returning error: Error?) {
        lock.lock()
        let continuation = self.continuation
        self.continuation = nil
        lock.unlock()
        continuation?.resume(returning: error)
    }
}

/// Pure subject-binding rules shared by durable provider cleanup and tests.
/// Provider grants may only be revoked for an exact, server-authoritative
/// subject; a merely current SDK account is never sufficient evidence.
public enum ProviderSubjectCleanupPolicy {
    public static func fingerprint(subject: String) -> String {
        SHA256.hash(data: Data(subject.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    public static func merging(pending: [String], deletedFingerprints: [String]) -> [String] {
        let validFingerprints = deletedFingerprints.filter {
            $0.range(of: #"^[0-9a-f]{64}$"#, options: .regularExpression) != nil
        }
        return Array(Set(pending).union(validFingerprints)).sorted()
    }

    public static func canDisconnect(currentSubject: String?, pending: [String]) -> Bool {
        guard let currentSubject else { return false }
        return pending.contains(fingerprint(subject: currentSubject))
    }

    public static func remaining(afterDisconnecting subject: String, pending: [String]) -> [String] {
        let completed = fingerprint(subject: subject)
        return pending.filter { $0 != completed }
    }
}

/// Separates ordinary sign-out from deleting an account at an external
/// identity provider. Logout clears only the local SDK session. A confirmed
/// AliStore account deletion additionally disconnects the provider grant.
public enum SocialIdentitySessionCleanup {
    public struct Result<Response> {
        public let response: Response
        public let providerDisconnectError: Error?
    }

    @MainActor
    public static func logout(signOut: () -> Void) {
        signOut()
    }

    @MainActor
    public static func deleteAccount<Response>(
        deleting: () async throws -> Response,
        didDelete: () -> Void = {},
        disconnectAttempts: Int = 2,
        disconnect: (@escaping @Sendable (Error?) -> Void) -> Void
    ) async rethrows -> Result<Response> {
        // Keep the provider session intact while the authoritative server
        // deletion is pending. Once deletion succeeds, await provider
        // revocation so the app can persist a retry marker instead of silently
        // losing a failed callback while dismissing the account screen.
        let response = try await deleting()
        // Persist the durable retry intent synchronously after the server has
        // committed deletion and before starting an external SDK callback. If
        // the process is terminated while Google is revoking the grant, the
        // next launch can still finish that revocation.
        didDelete()
        let providerDisconnectError = await disconnectWithRetry(
            attempts: disconnectAttempts,
            disconnect: disconnect
        )
        return Result(response: response, providerDisconnectError: providerDisconnectError)
    }

    @MainActor
    public static func disconnectWithRetry(
        attempts: Int = 2,
        callbackTimeout: TimeInterval = 10,
        disconnect: (@escaping @Sendable (Error?) -> Void) -> Void
    ) async -> Error? {
        var lastError: Error?
        for _ in 0..<max(1, attempts) {
            let error = await withCheckedContinuation { continuation in
                let gate = SocialDisconnectCompletionGate(continuation)
                DispatchQueue.global(qos: .utility).asyncAfter(
                    deadline: .now() + max(0.1, callbackTimeout)
                ) {
                    gate.resume(returning: URLError(.timedOut))
                }
                disconnect { error in gate.resume(returning: error) }
            }
            if error == nil { return nil }
            lastError = error
        }
        return lastError
    }
}

/// Launches durable provider cleanup outside the authentication/catalog startup
/// critical path. A provider outage must never hold the first usable screen.
@MainActor
public enum BackgroundStartupWork {
    public static func launch(_ operation: @escaping @MainActor @Sendable () async -> Void) {
        Task { await operation() }
    }
}

@MainActor
@Observable
// swiftlint:disable:next type_body_length
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
    public private(set) var recoveryChallengeId: String?
    public private(set) var emailChallengeId: String?
    public private(set) var emailAttachChallengeId: String?
    public private(set) var socialEnrollmentProvider: CustomerSocialProvider?
    public private(set) var socialEnrollmentExpiresAt: Date?
    public private(set) var authMethodsState: CustomerAuthMethodsState = .loading
    public var requiresSocialPhoneEnrollment: Bool { socialEnrollmentProvider != nil }
    /// Compatibility for the existing Apple-only UI while it migrates to the
    /// provider-neutral enrollment state.
    public var requiresApplePhoneEnrollment: Bool { socialEnrollmentProvider == .apple }
    public var appleEnrollmentExpiresAt: Date? {
        socialEnrollmentProvider == .apple ? socialEnrollmentExpiresAt : nil
    }
    public var requiresGooglePhoneEnrollment: Bool { socialEnrollmentProvider == .google }
    public var googleEnrollmentExpiresAt: Date? {
        socialEnrollmentProvider == .google ? socialEnrollmentExpiresAt : nil
    }
    public private(set) var requiresQuickUnlock = false
    public let quickUnlockService: String

    private let api: APIClient
    private let tokens: SecureTokenStore
    private let restoresStoredSession: Bool
    private var refreshFlight: RefreshFlight?
    private var sessionGeneration: UInt64 = 0
    /// Opaque, short-lived bearer secret. Intentionally never encoded or persisted.
    private var socialEnrollmentToken: String?
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

    /// Loads the same production capability view used by the web login screen.
    /// On failure the state becomes `.unavailable`: callers must keep the guest
    /// path open, but must not advertise an authentication method the server has
    /// not confirmed as operational.
    public func loadAuthMethods(force: Bool = false) async {
        if !force, case .available = authMethodsState { return }
        #if DEBUG
        // UI tests intentionally run without an API process. Their explicit
        // signed-out launch mode gets a deterministic capability fixture; a
        // regular Debug or Release build still consumes the live endpoint.
        if UITestBootstrap.disablesSessionRestore {
            useUITestAuthMethods()
            return
        }
        #endif
        authMethodsState = .loading
        do {
            let methods: CustomerAuthMethods = try await api.get("auth/methods")
            authMethodsState = .available(methods)
        } catch {
            authMethodsState = .unavailable
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

    /// Запрашивает отдельный recovery-код только после подтверждения capability
    /// сервером. Ответ API намеренно одинаков для известного и неизвестного
    /// номера, поэтому клиент не делает локальных проверок существования аккаунта.
    public func requestRecoveryOTP(phone: String) async -> Bool {
        guard recoveryCapabilityEnabled else {
            reportRecoveryUnavailable()
            return false
        }
        isLoading = true
        errorMessage = nil
        recoveryChallengeId = nil
        devCode = nil
        defer { isLoading = false }
        do {
            let challenge: OTPChallenge = try await api.post(
                "auth/recovery/request",
                body: OTPRequest(phone: phone)
            )
            recoveryChallengeId = challenge.challengeId
            devCode = challenge.devCode
            return true
        } catch {
            // Recovery is enumeration-sensitive: even an unexpected backend
            // message must not tell the caller whether this phone exists.
            errorMessage = "Не удалось отправить код восстановления. Попробуйте позже."
            return false
        }
    }

    /// Подтверждает recovery-код, затем получает серверный principal через
    /// `/auth/me` и активирует сессию тем же путём, что phone/social login.
    public func verifyRecovery(phone: String, code: String) async {
        guard recoveryCapabilityEnabled else {
            reportRecoveryUnavailable()
            return
        }
        guard let recoveryChallengeId else {
            errorMessage = "Сначала запросите новый код восстановления."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let auth: CustomerAuthTokens = try await api.post(
                "auth/recovery/verify",
                body: OTPVerification(phone: phone, code: code, challengeId: recoveryChallengeId)
            )
            try await finishAuthentication(auth, fallbackPhone: phone)
            self.recoveryChallengeId = nil
        } catch {
            // Keep the challenge for a corrected-code retry. The message comes
            // from the client instead of forwarding `customer_not_found`, so
            // account existence is never exposed by this flow.
            errorMessage = "Не удалось восстановить доступ. Проверьте код и попробуйте снова."
        }
    }

    public func cancelRecovery() {
        recoveryChallengeId = nil
        devCode = nil
        errorMessage = nil
    }

    /// Показывает ошибку входа, случившуюся до обращения к серверу — например
    /// когда Apple не вернула токен. Иначе экран молчит, и человек не понимает,
    /// нажалась кнопка или нет.
    public func reportSignInFailure(_ message: String) {
        errorMessage = message
    }

    /// Вход через Apple: обменивает identityToken и одноразовый authorizationCode
    /// на сессию. Сервер использует код для получения revocable refresh token.
    ///
    /// `nonce` передаётся ровно тем, что было положено в
    /// `ASAuthorizationAppleIDRequest.nonce` — Apple кладёт эту же строку в claim
    /// токена, а сервер сравнивает их напрямую. Любое преобразование здесь даёт
    /// «nonce mismatch», который на устройстве выглядит как молчаливый отказ входа.
    public func signInWithApple(
        identityToken: String,
        authorizationCode: String,
        nonce: String,
        name: String?
    ) async {
        guard validSocialCredentials(identityToken: identityToken, nonce: nonce) else {
            errorMessage = "Не удалось подтвердить безопасный вход Apple. Попробуйте ещё раз."
            return
        }
        guard !authorizationCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Apple не вернула код авторизации. Попробуйте ещё раз."
            return
        }
        beginSocialRequest()
        defer { isLoading = false }
        clearSocialEnrollment()
        do {
            let trimmedName = name?.trimmingCharacters(in: .whitespacesAndNewlines)
            let result: CustomerSocialAuthResult = try await api.post(
                "auth/v2/social/apple",
                body: AppleSocialLogin(
                    identityToken: identityToken,
                    authorizationCode: authorizationCode,
                    nonce: nonce,
                    // Пустое имя хуже отсутствующего: сервер склеит из него displayName.
                    name: (trimmedName?.isEmpty ?? true) ? nil : trimmedName
                )
            )
            try await handleSocialAuthResult(result, provider: .apple)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Вход через Google. `nonce` — исходная одноразовая строка, переданная
    /// Google SDK при выпуске ID token; сервер сравнивает её с claim токена.
    /// The API-advertised Google audience must exactly match the Web client ID
    /// embedded as `GIDServerClientID`. A syntactically valid but different ID
    /// would produce an ID token for an audience the server did not advertise,
    /// so both the UI and this invocation boundary fail closed.
    public func isGoogleSignInEnabled(serverClientID: String?) -> Bool {
        guard
            let serverClientID,
            !serverClientID.isEmpty,
            case .available(let methods) = authMethodsState,
            methods.google.enabled,
            methods.google.clientId == serverClientID
        else { return false }
        return true
    }

    public func signInWithGoogle(
        identityToken: String,
        nonce: String,
        serverClientID: String?
    ) async {
        guard isGoogleSignInEnabled(serverClientID: serverClientID) else {
            errorMessage = "Вход через Google пока недоступен. Обновите способы входа и попробуйте снова."
            return
        }
        guard validSocialCredentials(identityToken: identityToken, nonce: nonce) else {
            errorMessage = "Не удалось подтвердить безопасный вход Google. Попробуйте ещё раз."
            return
        }
        beginSocialRequest()
        defer { isLoading = false }
        clearSocialEnrollment()
        do {
            let result: CustomerSocialAuthResult = try await api.post(
                "auth/v2/social/google",
                body: GoogleSocialLogin(identityToken: identityToken, nonce: nonce)
            )
            try await handleSocialAuthResult(result, provider: .google)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Completes an unknown Apple identity by proving the canonical customer phone.
    /// The enrollment token remains memory-only and survives retryable OTP errors.
    public func completeSocialEnrollment(phone: String, code: String) async {
        guard let enrollmentToken = socialEnrollmentToken,
              socialEnrollmentProvider != nil else {
            errorMessage = "Сессия регистрации истекла. Начните вход заново."
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

    public func cancelSocialEnrollment() {
        clearSocialEnrollment()
        errorMessage = nil
    }

    /// Compatibility wrappers for existing Apple enrollment screens/tests.
    public func completeAppleEnrollment(phone: String, code: String) async {
        await completeSocialEnrollment(phone: phone, code: code)
    }

    public func cancelAppleEnrollment() {
        cancelSocialEnrollment()
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
        recoveryChallengeId = nil
        emailChallengeId = nil
        emailAttachChallengeId = nil
        clearSocialEnrollment()
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
        await UnauthorizedRegistry.shared.set { [weak self] _ in
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
        useUITestSocialEnrollment(provider: .apple)
    }

    public func useUITestSocialEnrollment(provider: CustomerSocialProvider) {
        clearSocialEnrollment()
        socialEnrollmentToken = String(repeating: "u", count: 48)
        socialEnrollmentExpiresAt = Date().addingTimeInterval(600)
        socialEnrollmentProvider = provider
        isRestoring = false
        errorMessage = nil
    }

    public func useUITestAuthMethods() {
        authMethodsState = .available(CustomerAuthMethods(
            phone: CustomerAuthMethodAvailability(enabled: true, registers: true),
            email: CustomerAuthMethodAvailability(enabled: true, registers: false),
            telegram: CustomerAuthMethods.Telegram(enabled: false, registers: false, botUsername: nil),
            apple: CustomerSocialAuthMethodAvailability(enabled: true, registers: true),
            google: CustomerSocialAuthMethodAvailability(enabled: false, registers: false),
            recovery: CustomerAuthMethods.Recovery(enabled: true),
            anyLoginAvailable: true,
            registrationAvailable: true
        ))
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
        clearSocialEnrollment()
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

    private func beginSocialRequest() {
        isLoading = true
        errorMessage = nil
    }

    private var recoveryCapabilityEnabled: Bool {
        guard case .available(let methods) = authMethodsState else { return false }
        return methods.recovery.enabled
    }

    private func reportRecoveryUnavailable() {
        recoveryChallengeId = nil
        devCode = nil
        errorMessage = "Восстановление доступа сейчас недоступно. Попробуйте позже."
    }

    private func validSocialCredentials(identityToken: String, nonce: String) -> Bool {
        !identityToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !nonce.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func handleSocialAuthResult(
        _ result: CustomerSocialAuthResult,
        provider: CustomerSocialProvider
    ) async throws {
        switch result {
        case .authenticated(let auth):
            try await finishAuthentication(auth, fallbackPhone: "")
        case .enrollmentRequired(let enrollmentToken, let expiresIn):
            if case .available(let methods) = authMethodsState {
                let canRegister = provider == .apple ? methods.apple.registers : methods.google.registers
                guard canRegister else {
                    throw CustomerSocialEnrollmentUnavailable(provider: provider)
                }
            }
            socialEnrollmentToken = enrollmentToken
            socialEnrollmentExpiresAt = Date().addingTimeInterval(TimeInterval(expiresIn))
            socialEnrollmentProvider = provider
            phoneChallengeId = nil
            devCode = nil
        }
    }

    private func clearSocialEnrollment() {
        socialEnrollmentToken = nil
        socialEnrollmentExpiresAt = nil
        socialEnrollmentProvider = nil
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

private struct CustomerSocialEnrollmentUnavailable: LocalizedError {
    let provider: CustomerSocialProvider

    var errorDescription: String? {
        let name = provider == .apple ? "Apple" : "Google"
        return "Этот аккаунт \(name) ещё не связан с AliStore. Регистрация сейчас недоступна — продолжите как гость или попробуйте позже."
    }
}

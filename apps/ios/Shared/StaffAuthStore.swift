import Foundation
import Observation

@MainActor
@Observable
public final class StaffAuthStore {
    private struct RefreshFlight {
        let id: UUID
        let refreshToken: String
        let generation: UInt64
        let task: Task<StaffSession, Error>
    }

    public private(set) var session: StaffSession?
    public private(set) var isRestoring = true
    public private(set) var requiresQuickUnlock = false
    public private(set) var isLoading = false
    public private(set) var errorMessage: String?

    private let api: APIClient
    private let tokens: SecureTokenStore
    private let restoresStoredSession: Bool
    private var refreshFlight: RefreshFlight?
    private var sessionGeneration: UInt64 = 0
    public let quickUnlockService: String
    /// Настроен ли PIN. Инъектируется, потому что `AliStoreCoreTests` — hostless
    /// бандл с `CODE_SIGNING_ALLOWED=NO`, где Keychain недоступен: без подмены
    /// тест проверял бы окружение, а не логику блокировки.
    private let isPinConfigured: () -> Bool

    public init(
        environment: AppEnvironment,
        keychainService: String,
        restoresStoredSession: Bool = true,
        isPinConfigured: (() -> Bool)? = nil,
        session: URLSession = .shared
    ) {
        self.api = APIClient(baseURL: environment.apiBaseURL, session: session)
        self.tokens = SecureTokenStore(service: keychainService)
        self.restoresStoredSession = restoresStoredSession
        self.quickUnlockService = keychainService
        self.isPinConfigured = isPinConfigured ?? { LocalPINStore(service: keychainService).isConfigured }
        #if DEBUG
        if UITestBootstrap.startsSignedIn {
            self.session = StaffSession(accessToken: "ui-test-staff-token", staffId: "staff-ui-test", username: "azizbek", role: UITestBootstrap.staffRole)
            sessionGeneration &+= 1
            requiresQuickUnlock = UITestBootstrap.requiresQuickUnlock
            isRestoring = false
            return
        }
        #endif
        if restoresStoredSession {
            Task { await self.restore() }
        } else {
            isRestoring = false
        }
    }

    public func restore() async {
        defer { isRestoring = false }
        guard let token = try? tokens.read() else { return }
        let storedRefresh = try? tokens.read(account: Self.refreshAccount)
        do {
            let principal: StaffPrincipal = try await api.get("staff-auth/me", token: token)
            session = StaffSession(
                accessToken: token,
                refreshToken: storedRefresh,
                staffId: principal.id,
                username: principal.username,
                role: principal.role,
                point: principal.point,
                totpEnabled: principal.totpEnabled,
                capabilities: principal.capabilities
            )
            sessionGeneration &+= 1
            requiresQuickUnlock = true
        } catch {
            // Протухший доступ — не повод выкидывать смену: сначала пробуем обменять
            // refresh-токен, и только его отказ означает, что входить надо заново.
            if case let APIError.rejected(status, _) = error, status == 401 || status == 403,
               let refreshToken = storedRefresh {
                let generation = sessionGeneration
                if await renew(using: refreshToken, failedAccessToken: token, requiringUnlock: true) != nil {
                    return
                }
                // Terminal rejection clears through `renew` and advances the
                // generation. A timeout/5xx leaves durable credentials intact.
                if sessionGeneration == generation { return }
                return
            }
            // Всё остальное — сеть, 5xx, разобранный ответ — оставляет сессию на месте.
            // Раньше любой такой отказ стирал и токен, и PIN: холодный старт без
            // интернета разлогинивал кассира и требовал полноценного входа.
            guard case let APIError.rejected(status, _) = error, status == 401 || status == 403 else { return }
            try? tokens.clear()
            try? tokens.clear(account: Self.refreshAccount)
            clearQuickUnlock()
        }
    }

    static let refreshAccount = "staff-refresh-token"

    /// Singleflight rotation: every concurrent 401 for one access token awaits
    /// the same task; generation prevents a late response from reviving logout.
    private func renew(
        using refreshToken: String,
        failedAccessToken: String,
        requiringUnlock: Bool
    ) async -> String? {
        if let current = session, current.accessToken != failedAccessToken {
            return current.accessToken
        }
        let generation = sessionGeneration
        let flight: RefreshFlight
        if let current = refreshFlight,
           current.refreshToken == refreshToken,
           current.generation == generation {
            flight = current
        } else {
            let api = self.api
            let task = Task {
                try await api.post(
                    "staff-auth/refresh",
                    body: RefreshRequest(refreshToken: refreshToken),
                    as: StaffSession.self
                )
            }
            flight = RefreshFlight(
                id: UUID(),
                refreshToken: refreshToken,
                generation: generation,
                task: task
            )
            refreshFlight = flight
        }
        do {
            let next = try await flight.task.value
            guard canApply(flight) else { return session?.accessToken }
            guard next.refreshToken != nil else {
                if refreshFlight?.id == flight.id { refreshFlight = nil }
                return nil
            }
            if restoresStoredSession { try? tokens.save(next.accessToken) }
            if let rotated = next.refreshToken {
                if restoresStoredSession { try? tokens.save(rotated, account: Self.refreshAccount) }
            }
            session = next
            sessionGeneration &+= 1
            if requiringUnlock { requiresQuickUnlock = true }
            if refreshFlight?.id == flight.id { refreshFlight = nil }
            return next.accessToken
        } catch {
            guard canApply(flight) else { return session?.accessToken }
            if refreshFlight?.id == flight.id { refreshFlight = nil }
            guard case let APIError.rejected(status, _) = error,
                  status == 401 || status == 403 else { return nil }
            clearLocalSession()
            return nil
        }
    }

    /// Тихое обновление по 401 — без требования PIN посреди работы кассира.
    public func renewAccessToken(failedAccessToken: String) async -> String? {
        if let current = session, current.accessToken != failedAccessToken { return current.accessToken }
        guard let refreshToken = session?.refreshToken ?? (try? tokens.read(account: Self.refreshAccount)) else { return nil }
        return await renew(
            using: refreshToken,
            failedAccessToken: failedAccessToken,
            requiringUnlock: false
        )
    }

    /// Ставит общий на приложение обработчик 401. Вызывать один раз при старте.
    public func installUnauthorizedHandler() async {
        await UnauthorizedRegistry.shared.set { [weak self] failedAccessToken in
            await self?.renewAccessToken(failedAccessToken: failedAccessToken)
        }
    }

    public func login(username: String, password: String, totp: String? = nil) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let session: StaffSession = try await api.post(
                "staff-auth/login",
                body: StaffLogin(
                    username: username,
                    password: password,
                    totp: totp?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                )
            )
            guard session.refreshToken != nil else {
                throw APIError.decoding("Staff login response has no refresh token")
            }
            invalidateRefreshFlight()
            clearQuickUnlock()
            if restoresStoredSession { try tokens.save(session.accessToken) }
            if let refreshToken = session.refreshToken {
                if restoresStoredSession { try? tokens.save(refreshToken, account: Self.refreshAccount) }
            }
            self.session = session
            requiresQuickUnlock = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func logout() async {
        let refreshToken = session?.refreshToken ?? (try? tokens.read(account: Self.refreshAccount))
        clearLocalSession()
        if let refreshToken {
            try? await api.postNoContent(
                "staff-auth/logout",
                body: RefreshRequest(refreshToken: refreshToken)
            )
        }
    }

    public func unlock() { requiresQuickUnlock = false }

    /// Повторно закрывает рабочее пространство при уходе приложения в фон.
    ///
    /// Без этого сессия оставалась открытой между запусками: кто угодно, взявший
    /// разблокированный телефон кассира, видел смену, выручку и Customer 360.
    /// Блокируем только при активной сессии и настроенном PIN — гейт без второго
    /// фактора не защищает, а лишь запирал бы человека при каждом сворачивании.
    public func lock() {
        guard QuickUnlockGate.shouldLock(hasSession: session != nil, pinConfigured: isPinConfigured()) else { return }
        requiresQuickUnlock = true
    }

    private func clearQuickUnlock() {
        try? tokens.clear(account: "quick-unlock-pin")
        try? tokens.clear(account: "quick-unlock-pin-attempts")
    }

    private func canApply(_ flight: RefreshFlight) -> Bool {
        refreshFlight?.id == flight.id && sessionGeneration == flight.generation
    }

    private func invalidateRefreshFlight() {
        sessionGeneration &+= 1
        refreshFlight?.task.cancel()
        refreshFlight = nil
    }

    private func clearLocalSession() {
        invalidateRefreshFlight()
        clearQuickUnlock()
        if restoresStoredSession {
            try? tokens.clear()
            try? tokens.clear(account: Self.refreshAccount)
        }
        session = nil
        requiresQuickUnlock = false
        errorMessage = nil
    }

    #if DEBUG
    public func useTestSession(_ fixture: StaffSession) {
        invalidateRefreshFlight()
        session = fixture
        isRestoring = false
        errorMessage = nil
    }

    public func restoreTestSession(_ fixture: StaffSession) async {
        useTestSession(fixture)
        do {
            let _: StaffPrincipal = try await api.get("staff-auth/me", token: fixture.accessToken)
        } catch {
            guard case let APIError.rejected(status, _) = error,
                  status == 401 || status == 403,
                  let refreshToken = fixture.refreshToken else { return }
            _ = await renew(
                using: refreshToken,
                failedAccessToken: fixture.accessToken,
                requiringUnlock: true
            )
        }
    }
    #endif
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

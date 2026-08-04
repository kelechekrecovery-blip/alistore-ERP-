import Foundation
import Observation

@MainActor
@Observable
public final class StaffAuthStore {
    public private(set) var session: StaffSession?
    public private(set) var isRestoring = true
    public private(set) var requiresQuickUnlock = false
    public private(set) var isLoading = false
    public private(set) var errorMessage: String?

    private let api: APIClient
    private let tokens: SecureTokenStore
    public let quickUnlockService: String
    /// Настроен ли PIN. Инъектируется, потому что `AliStoreCoreTests` — hostless
    /// бандл с `CODE_SIGNING_ALLOWED=NO`, где Keychain недоступен: без подмены
    /// тест проверял бы окружение, а не логику блокировки.
    private let isPinConfigured: () -> Bool

    public init(
        environment: AppEnvironment,
        keychainService: String,
        restoresStoredSession: Bool = true,
        isPinConfigured: (() -> Bool)? = nil
    ) {
        self.api = APIClient(baseURL: environment.apiBaseURL)
        self.tokens = SecureTokenStore(service: keychainService)
        self.quickUnlockService = keychainService
        self.isPinConfigured = isPinConfigured ?? { LocalPINStore(service: keychainService).isConfigured }
        #if DEBUG
        if UITestBootstrap.startsSignedIn {
            session = StaffSession(accessToken: "ui-test-staff-token", staffId: "staff-ui-test", username: "azizbek", role: UITestBootstrap.staffRole)
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
            requiresQuickUnlock = true
        } catch {
            // Протухший доступ — не повод выкидывать смену: сначала пробуем обменять
            // refresh-токен, и только его отказ означает, что входить надо заново.
            if case let APIError.rejected(status, _) = error, status == 401 || status == 403,
               let refreshToken = storedRefresh,
               await renew(using: refreshToken, requiringUnlock: true) {
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

    /// Обменивает refresh-токен на новую пару и сохраняет её.
    @discardableResult
    private func renew(using refreshToken: String, requiringUnlock: Bool) async -> Bool {
        do {
            let next: StaffSession = try await api.post(
                "staff-auth/refresh",
                body: RefreshRequest(refreshToken: refreshToken)
            )
            try? tokens.save(next.accessToken)
            if let rotated = next.refreshToken {
                try? tokens.save(rotated, account: Self.refreshAccount)
            }
            session = next
            if requiringUnlock { requiresQuickUnlock = true }
            return true
        } catch {
            return false
        }
    }

    /// Тихое обновление по 401 — без требования PIN посреди работы кассира.
    func renewAccessToken() async -> String? {
        guard let refreshToken = session?.refreshToken ?? (try? tokens.read(account: Self.refreshAccount)) else { return nil }
        guard await renew(using: refreshToken, requiringUnlock: false) else { return nil }
        return session?.accessToken
    }

    /// Ставит общий на приложение обработчик 401. Вызывать один раз при старте.
    public func installUnauthorizedHandler() async {
        await UnauthorizedRegistry.shared.set { [weak self] in
            await self?.renewAccessToken()
        }
    }

    public func login(username: String, password: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let session: StaffSession = try await api.post(
                "staff-auth/login",
                body: StaffLogin(username: username, password: password)
            )
            clearQuickUnlock()
            try tokens.save(session.accessToken)
            if let refreshToken = session.refreshToken {
                try? tokens.save(refreshToken, account: Self.refreshAccount)
            }
            self.session = session
            requiresQuickUnlock = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func logout() {
        do {
            clearQuickUnlock()
            try tokens.clear()
            try? tokens.clear(account: Self.refreshAccount)
            session = nil
            requiresQuickUnlock = false
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
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
}

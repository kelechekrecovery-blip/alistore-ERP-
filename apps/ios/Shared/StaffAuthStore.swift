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

    public init(environment: AppEnvironment, keychainService: String) {
        self.api = APIClient(baseURL: environment.apiBaseURL)
        self.tokens = SecureTokenStore(service: keychainService)
        self.quickUnlockService = keychainService
        Task { await self.restore() }
    }

    public func restore() async {
        defer { isRestoring = false }
        guard let token = try? tokens.read() else { return }
        do {
            let principal: StaffPrincipal = try await api.get("staff-auth/me", token: token)
            session = StaffSession(accessToken: token, staffId: principal.id, username: principal.username, role: principal.role)
            requiresQuickUnlock = true
        } catch {
            try? tokens.clear()
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
            try tokens.save(session.accessToken)
            self.session = session
            requiresQuickUnlock = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func logout() {
        do {
            try tokens.clear()
            session = nil
            requiresQuickUnlock = false
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func unlock() { requiresQuickUnlock = false }
}

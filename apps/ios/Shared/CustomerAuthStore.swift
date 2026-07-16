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

    public init(
        environment: AppEnvironment,
        keychainService: String = "kg.alistore.client.auth",
        restoresStoredSession: Bool = true
    ) {
        self.api = APIClient(baseURL: environment.apiBaseURL)
        self.tokens = SecureTokenStore(service: keychainService)
        self.quickUnlockService = keychainService
        self.restoresStoredSession = restoresStoredSession
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
            try? tokens.clear(account: "customer-session")
            session = nil
        }
    }

    public func unlock() { requiresQuickUnlock = false }

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

import Foundation
import Security

public struct SecureTokenStore: Sendable {
    private let service: String

    public init(service: String) {
        self.service = service
    }

    // Доступность токена: `AfterFirstUnlockThisDeviceOnly`. Устройство-только
    // (не уезжает в бэкап и на другой телефон) и читается лишь после первой
    // разблокировки за загрузку.
    //
    // Намеренно НЕ `.biometryCurrentSet`: токен читается только в `restore()` на
    // холодном старте, до экрана quick-unlock и в фоновой Task без UI-контекста.
    // Биометрия на этом чтении сработала бы раньше гейта, конфликтовала бы с ним
    // (quick-unlock уже спрашивает Face ID/PIN сам) и требовала бы `LAContext`
    // на старте. Защиту «взяли разблокированный телефон» даёт связка
    // «токен device-only + quick-unlock, в том числе при уходе в фон», а не
    // биометрия на каждом чтении Keychain.
    public func save(_ token: String, account: String = "access-token") throws {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var insert = query
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(insert as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    public func read(account: String = "access-token") throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw KeychainError(status: status) }
        return String(data: data, encoding: .utf8)
    }

    public func clear(account: String = "access-token") throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
    }
}

public struct KeychainError: LocalizedError, Sendable {
    public let status: OSStatus

    public init(status: OSStatus) {
        self.status = status
    }

    // Раньше пользователь и разработчик видели «error 1» вместо кода ошибки:
    // `KeychainError` не давал ни `OSStatus`, ни расшифровки. Теперь несёт и код,
    // и системный текст (`errSecMissingEntitlement` и т.п.) — это ровно то, что
    // маскировало настоящую причину при отладке входа.
    public var errorDescription: String? {
        let message = SecCopyErrorMessageString(status, nil) as String?
        return "Ошибка Keychain \(status): \(message ?? "неизвестная")"
    }
}

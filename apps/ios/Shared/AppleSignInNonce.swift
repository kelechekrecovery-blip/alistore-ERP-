import CryptoKit
import Foundation

/// Nonce для Sign in with Apple.
///
/// Схема Apple: приложение генерирует случайную строку, кладёт в
/// `ASAuthorizationAppleIDRequest.nonce` её **SHA-256**, и это же значение Apple
/// помещает в claim `nonce` выданного identityToken. Сервер сравнивает claim с
/// тем, что прислал клиент (`social-login.ts` → «nonce mismatch»), поэтому на
/// сервер уходит хэш, а не исходная строка. Сырой nonce наружу не покидает
/// устройство вообще — он нужен только чтобы хэш был непредсказуем.
public enum AppleSignInNonce {
    /// Случайная строка из безопасного алфавита. Длина по умолчанию — 32 символа,
    /// как в примере Apple.
    public static func random(length: Int = 32) -> String {
        precondition(length > 0, "nonce length must be positive")
        // Точки и дефисы допустимы в nonce и не требуют экранирования нигде по пути.
        // Ровно 64 символа: 256 делится на 64 нацело, поэтому `% count` не даёт
        // смещения — каждый символ равновероятен.
        let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        let status = bytes.withUnsafeMutableBytes { buffer -> OSStatus in
            guard let baseAddress = buffer.baseAddress else { return errSecParam }
            return SecRandomCopyBytes(kSecRandomDefault, length, baseAddress)
        }
        // Молчаливый провал здесь опаснее краша: при не-успехе байты остались бы
        // нулями и nonce стал бы предсказуемым — сломав анти-replay Sign in with
        // Apple. Крашим, как в референс-примере Apple (в проде SecRandomCopyBytes
        // фактически не падает).
        guard status == errSecSuccess else {
            fatalError("SecRandomCopyBytes failed with OSStatus \(status)")
        }
        return String(bytes.map { alphabet[Int($0) % alphabet.count] })
    }

    /// SHA-256 в нижнем регистре hex — ровно та форма, которую ждёт Apple.
    public static func hashed(_ raw: String) -> String {
        SHA256.hash(data: Data(raw.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

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
        let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        result.reserveCapacity(length)
        for _ in 0..<length {
            var byte: UInt8 = 0
            _ = withUnsafeMutableBytes(of: &byte) { SecRandomCopyBytes(kSecRandomDefault, 1, $0.baseAddress!) }
            result.append(alphabet[Int(byte) % alphabet.count])
        }
        return result
    }

    /// SHA-256 в нижнем регистре hex — ровно та форма, которую ждёт Apple.
    public static func hashed(_ raw: String) -> String {
        SHA256.hash(data: Data(raw.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

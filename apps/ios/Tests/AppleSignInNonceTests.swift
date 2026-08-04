import AliStoreCore
import XCTest

/// Nonce — единственное место в Sign in with Apple, где клиент считает сам.
/// Ошибка здесь не падает, а тихо превращается в «nonce mismatch» на сервере.
final class AppleSignInNonceTests: XCTestCase {
    func testHashIsSha256HexLowercase() {
        // Эталон посчитан вне кода (`shasum -a 256`), поэтому тест ловит и смену
        // алгоритма, и смену регистра, и переход на base64. Сравнивать функцию
        // саму с собой бессмысленно — первая версия этого теста именно это и делала.
        let digest = AppleSignInNonce.hashed("alistore")
        XCTAssertEqual(digest, "45c4521b5947e1541a0133d03a9337cecfbdeccadeb7ce23db9f8b262975ae7c")
        XCTAssertEqual(digest.count, 64)
        XCTAssertEqual(digest, digest.lowercased())
        XCTAssertTrue(digest.allSatisfy { $0.isHexDigit })
    }

    func testHashIsStable() {
        XCTAssertEqual(AppleSignInNonce.hashed("одна и та же строка"),
                       AppleSignInNonce.hashed("одна и та же строка"))
        XCTAssertNotEqual(AppleSignInNonce.hashed("a"), AppleSignInNonce.hashed("b"))
    }

    func testRandomNonceLengthAndAlphabet() {
        let nonce = AppleSignInNonce.random()
        XCTAssertEqual(nonce.count, 32)
        // Алфавит выбран так, чтобы значение не требовало экранирования нигде по
        // пути: приложение → Apple → JWT-claim → JSON-тело запроса.
        let allowed = CharacterSet(charactersIn: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        XCTAssertTrue(nonce.unicodeScalars.allSatisfy { allowed.contains($0) })
    }

    func testRandomNonceIsNotConstant() {
        let values = Set((0..<32).map { _ in AppleSignInNonce.random(length: 16) })
        // Предсказуемый nonce обесценивает всю защиту от повтора токена.
        XCTAssertGreaterThan(values.count, 30)
    }
}

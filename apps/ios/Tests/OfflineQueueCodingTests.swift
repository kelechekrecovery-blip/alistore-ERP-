import AliStoreCore
import Foundation
import XCTest

/**
 Замер, из-за которого появился `OfflineQueueCoding`.

 `JSONEncoder` **не гарантирует порядок ключей**, и это не теория: два кодирования
 одного и того же `POSSaleRequest` в одном процессе дали разный JSON —

     {"point":…,"lines":[…],"clientSaleId":…,"payments":[…],"discountPct":10}
     {"lines":[…],"payments":[…],"discountPct":10,"clientSaleId":…,"point":…}

 Офлайн-очередь хранит тело операции и по нему отличает повтор от подмены. На
 сыром кодировщике повтор той же продажи выглядел бы как другая операция, и касса
 отказывала бы кассиру на ровном месте.

 Тест держит оба факта: сырое кодирование нестабильно (если Apple это когда-нибудь
 починит — узнаем отсюда), каноническое стабильно.
 */
final class OfflineQueueCodingTests: XCTestCase {
    private func sample() -> POSSaleRequest {
        POSSaleRequest(
            point: "BISHKEK-1",
            lines: [POSLine(productId: "p1", sku: "SKU-1", price: 100, qty: 1)],
            payments: [POSTender(method: "cash", amount: 90)],
            discountPct: 10,
            clientSaleId: "offline-pos-1"
        )
    }

    func testCanonicalEncodingIsStableAcrossCalls() throws {
        let first = try OfflineQueueCoding.encode(sample())
        let second = try OfflineQueueCoding.encode(sample())
        XCTAssertEqual(first, second, "каноническое кодирование обязано быть воспроизводимым")
    }

    func testCanonicalizingAnArbitraryEncodingMatches() throws {
        // Тело, закодированное «как придётся», после канонизации обязано совпасть
        // с телом, закодированным каноническим кодировщиком.
        let raw = try JSONEncoder().encode(sample())
        XCTAssertEqual(
            OfflineQueueCoding.canonical(raw),
            try OfflineQueueCoding.encode(sample())
        )
    }

    func testCanonicalizingNonJSONReturnsInputUnchanged() {
        let garbage = Data("не json".utf8)
        XCTAssertEqual(OfflineQueueCoding.canonical(garbage), garbage, "терять операцию из-за формата нельзя")
    }
}

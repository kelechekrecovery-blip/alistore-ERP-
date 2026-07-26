import AliStoreCore
import XCTest

/**
 Регрессия COURIER-205: исправленная сумма COD молча не доезжала.

 Ключ сдачи наличных собирался как `courier-handover-<runId>` — то есть был
 привязан к рейсу, а не к операции. Курьер, отправивший 5000 и исправивший на
 7000, получал от сервера результат первой попытки: ключ узнан, тело не смотрят.
 В леджере оставалось 5000, курьер был уверен, что сдал 7000, а разница 2000
 превращалась в его недостачу.
 */
final class IdempotencyKeysTests: XCTestCase {
    private func handover(_ amount: Int, reason: String? = nil) -> CourierHandoverRequest {
        CourierHandoverRequest(runId: "run-1", amount: amount, reason: reason)
    }

    /// Повторная отправка той же сдачи обязана остаться одной операцией.
    func testSameHandoverKeepsTheSameKey() throws {
        let first = try IdempotencyKeys.courierHandover(runId: "run-1", request: handover(5000))
        let second = try IdempotencyKeys.courierHandover(runId: "run-1", request: handover(5000))
        XCTAssertEqual(first, second, "повтор той же сдачи обязан быть идемпотентным")
    }

    /// Исправленная сумма — другая операция, и сервер обязан её увидеть.
    func testCorrectedAmountProducesADifferentKey() throws {
        let wrong = try IdempotencyKeys.courierHandover(runId: "run-1", request: handover(5000))
        let corrected = try IdempotencyKeys.courierHandover(runId: "run-1", request: handover(7000))
        XCTAssertNotEqual(wrong, corrected, "исправленная сумма не должна глушиться прежним ключом")
    }

    /// Причина тоже часть операции: сдача с комментарием и без — не одно и то же.
    func testReasonIsPartOfTheOperation() throws {
        let plain = try IdempotencyKeys.courierHandover(runId: "run-1", request: handover(5000))
        let explained = try IdempotencyKeys.courierHandover(runId: "run-1", request: handover(5000, reason: "разменял"))
        XCTAssertNotEqual(plain, explained)
    }

    /// Разные рейсы не смешиваются, даже если сумма совпала.
    func testDifferentRunsDoNotCollide() throws {
        let first = try IdempotencyKeys.courierHandover(runId: "run-1", request: handover(5000))
        let second = try IdempotencyKeys.courierHandover(
            runId: "run-2",
            request: CourierHandoverRequest(runId: "run-2", amount: 5000)
        )
        XCTAssertNotEqual(first, second)
    }

    /// Ключ обязан оставаться пригодным как HTTP-заголовок: без пробелов и мусора.
    func testKeyIsTransportSafe() throws {
        let key = try IdempotencyKeys.courierHandover(runId: "run-1", request: handover(5000))
        XCTAssertTrue(key.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" }, "недопустимые символы в ключе: \(key)")
    }
}

/// The write-off key is content-derived so a double tap dedupes. Content alone
/// is not enough: two genuinely separate write-offs of the same item, quantity
/// and reason would fingerprint identically, and the server now refuses a key
/// whose approval was already decided — which would block real work. The key is
/// therefore scoped to the day, and prefixed, because Approval.idempotencyKey is
/// unique across ALL actions and a bare digest could collide with another one.
final class InventoryWriteOffKeyTests: XCTestCase {
    /// Форма совпадает с приватным `InventoryWriteOffRequest`: проверяем контракт
    /// ключа (namespace + день + чувствительность к содержимому), а не сам DTO.
    private struct WriteOffBody: Encodable {
        let productId: String
        let qty: Int
        let type = "write_off"
        let location: String
        let reason: String
    }

    private func request(qty: Int) -> WriteOffBody {
        WriteOffBody(productId: "p-1", qty: qty, location: "BISHKEK-1", reason: "бой")
    }

    private func day(_ iso: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: iso)!
    }

    func testSameWriteOffOnTheSameDayIsTheSameKey() throws {
        let a = try IdempotencyKeys.inventoryWriteOff(request(qty: 2), on: day("2026-07-26T09:00:00Z"))
        let b = try IdempotencyKeys.inventoryWriteOff(request(qty: 2), on: day("2026-07-26T18:30:00Z"))
        XCTAssertEqual(a, b)
    }

    func testTheSameWriteOffOnAnotherDayIsANewOperation() throws {
        let today = try IdempotencyKeys.inventoryWriteOff(request(qty: 2), on: day("2026-07-26T09:00:00Z"))
        let later = try IdempotencyKeys.inventoryWriteOff(request(qty: 2), on: day("2026-08-02T09:00:00Z"))
        XCTAssertNotEqual(today, later, "новое списание через неделю не должно упереться в старую заявку")
    }

    func testDifferentQuantityIsADifferentKey() throws {
        let two = try IdempotencyKeys.inventoryWriteOff(request(qty: 2), on: day("2026-07-26T09:00:00Z"))
        let three = try IdempotencyKeys.inventoryWriteOff(request(qty: 3), on: day("2026-07-26T09:00:00Z"))
        XCTAssertNotEqual(two, three)
    }

    func testKeyIsNamespacedSoItCannotCollideWithAnotherAction() throws {
        let key = try IdempotencyKeys.inventoryWriteOff(request(qty: 2), on: day("2026-07-26T09:00:00Z"))
        XCTAssertTrue(key.hasPrefix("inventory-write-off-"), "получено: \(key)")
        XCTAssertNotEqual(key, try IdempotencyKeys.fingerprint(request(qty: 2)))
    }
}

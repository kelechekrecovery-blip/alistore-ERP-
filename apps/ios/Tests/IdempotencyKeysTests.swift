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

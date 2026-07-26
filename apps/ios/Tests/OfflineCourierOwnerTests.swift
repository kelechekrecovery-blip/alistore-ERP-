import AliStoreCore
import Foundation
import XCTest

/// Курьерская офлайн-очередь на общем устройстве: после пересменки курьер не должен
/// видеть и переотправлять чужие команды. Сервер чужую команду и так отклонит 403
/// (`assertAssignedCourier`), но без фильтра она падала бы в `failed` и висела
/// невидимой для сверки, а собранный чужой COD — потерянным из виду. `owned`
/// оставляет только свои и legacy-записи без владельца.
final class OfflineCourierOwnerTests: XCTestCase {
    private func mutation(owner: String?, state: String = "queued") -> PendingMutation {
        let m = PendingMutation(endpoint: "courier/orders/o-1/deliver", method: "POST", body: Data("{}".utf8), owner: owner)
        m.state = state
        return m
    }

    func testOwnedShowsOnlyOwnAndLegacyCommands() {
        let all = [
            mutation(owner: "courier-a"),
            mutation(owner: "courier-b"),
            mutation(owner: nil), // до появления поля владельца
        ]

        let forB = OfflineCourierQueue.owned(all, by: "courier-b")

        XCTAssertEqual(forB.count, 2, "B видит только свою и legacy, но не команду A")
        XCTAssertFalse(forB.contains { $0.owner == "courier-a" })
        XCTAssertTrue(forB.contains { $0.owner == "courier-b" })
        XCTAssertTrue(forB.contains { $0.owner == nil })
    }

    func testOwnedKeepsFailedForTheOwner() {
        // Фильтр по владельцу не сужает по состоянию: свою упавшую команду курьер
        // обязан видеть и переотправлять.
        let all = [mutation(owner: "courier-a", state: "failed")]
        XCTAssertEqual(OfflineCourierQueue.owned(all, by: "courier-a").count, 1)
        XCTAssertTrue(OfflineCourierQueue.owned(all, by: "courier-b").isEmpty)
    }
}

/// COURIER-IDEMPOTENCY-002, UI half. The key fix stopped a double tap creating
/// two records, but a courier who edits an amount while an earlier command for
/// the same order is still queued still loses the edit: the server resolves the
/// order status by CAS, the first (possibly stale) amount wins, and the later
/// correct one dies as a conflict the courier never sees. The delivery card has
/// to say a command is already pending before they send another.
final class CourierPendingCommandTests: XCTestCase {
    private func mutation(endpoint: String, state: String = "queued", owner: String? = "courier-1") -> PendingMutation {
        let m = PendingMutation(endpoint: endpoint, method: "POST", body: Data("{}".utf8), idempotencyKey: endpoint, owner: owner)
        m.state = state
        return m
    }

    func testFindsAQueuedCommandForTheOrder() {
        let pending = [mutation(endpoint: "courier/orders/order-1/deliver")]
        XCTAssertTrue(OfflineCourierQueue.hasPendingCommand(forOrder: "order-1", in: pending))
    }

    /// A substring match would flag the wrong card: ids that share a prefix are
    /// ordinary, and telling a courier the wrong order is blocked is its own bug.
    func testDoesNotMatchOnSubstringsOfOtherIds() {
        let pending = [mutation(endpoint: "courier/orders/order-10/deliver")]
        XCTAssertFalse(OfflineCourierQueue.hasPendingCommand(forOrder: "order-1", in: pending))
    }

    func testMatchesEveryCourierEndpointShape() {
        for endpoint in ["courier/orders/order-1/start", "courier/orders/order-1/deliver", "deliveries/order-1/fail"] {
            XCTAssertTrue(
                OfflineCourierQueue.hasPendingCommand(forOrder: "order-1", in: [mutation(endpoint: endpoint)]),
                "не распознан endpoint \(endpoint)"
            )
        }
    }

    /// Anything not yet applied counts — a failed or conflicted command is
    /// exactly the case where a courier is about to send a contradicting edit.
    func testCountsUnappliedStatesNotJustQueued() {
        for state in ["queued", "syncing", "failed", "conflict"] {
            XCTAssertTrue(
                OfflineCourierQueue.hasPendingCommand(
                    forOrder: "order-1",
                    in: [mutation(endpoint: "courier/orders/order-1/deliver", state: state)]
                ),
                "состояние \(state) должно считаться незавершённым"
            )
        }
    }

    func testIgnoresOrdersWithNothingQueued() {
        let pending = [mutation(endpoint: "courier/orders/order-2/deliver")]
        XCTAssertFalse(OfflineCourierQueue.hasPendingCommand(forOrder: "order-1", in: pending))
    }
}

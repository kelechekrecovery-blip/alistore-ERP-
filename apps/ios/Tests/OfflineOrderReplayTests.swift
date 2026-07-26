import AliStoreCore
import Foundation
import SwiftData
import XCTest

/// Регрессия потери заказа: покупательская офлайн-очередь переигрывала только
/// `queued`/`failed`. `replay` пишет `state = "syncing"` на диск ДО сети, поэтому
/// заказ, на котором приложение убили посреди отправки, застревал в `syncing`
/// навсегда — авто-повтор пропускал, заказ терялся молча. `replayable` обязана
/// включать `syncing` (как уже сделано в POS-очереди).
final class OfflineOrderReplayTests: XCTestCase {
    private func mutation(state: String, endpoint: String = "orders/mine") -> PendingMutation {
        let m = PendingMutation(endpoint: endpoint, method: "POST", body: Data("{}".utf8))
        m.state = state
        return m
    }

    func testReplayableIncludesSyncingSoKilledMidSendOrdersRecover() {
        let all = [
            mutation(state: "queued"),
            mutation(state: "failed"),
            mutation(state: "syncing"),
            mutation(state: "conflict"),
        ]

        let states = Set(OfflineOrderQueue.replayable(all).map(\.state))

        XCTAssertTrue(states.contains("syncing"), "застрявший в syncing заказ обязан переигрываться")
        XCTAssertTrue(states.contains("queued"))
        XCTAssertTrue(states.contains("failed"))
        XCTAssertFalse(states.contains("conflict"), "конфликт разбирает человек, не авто-повтор")
    }

    func testReplayableIgnoresOtherEndpoints() {
        let all = [
            mutation(state: "syncing", endpoint: "orders/mine"),
            mutation(state: "syncing", endpoint: "pos/sale"),
        ]

        XCTAssertEqual(OfflineOrderQueue.replayable(all).count, 1)
    }
}

/// OFFLINE-ORDER-DEDUP-003. The POS and courier queues both refuse a reused key
/// with a different body and treat an exact repeat as a no-op. The customer
/// order queue inserted unconditionally, so it was the one queue where a reused
/// key silently produced two orders — the failure mode is a duplicate purchase.
final class OfflineOrderQueueDedupTests: XCTestCase {
    private func makeContext() throws -> ModelContext {
        let schema = Schema(versionedSchema: OfflineSchemaV1.self)
        let container = try ModelContainer(
            for: schema,
            configurations: ModelConfiguration(
                "order-dedup-\(UUID().uuidString)",
                schema: schema,
                isStoredInMemoryOnly: true
            )
        )
        return ModelContext(container)
    }

    private func order(total: Int) -> CreateOrderRequest {
        CreateOrderRequest(
            customerId: "cust-1",
            fulfillmentType: "delivery",
            storePointId: nil,
            deliveryAddress: "Бишкек",
            total: total,
            items: []
        )
    }

    private func queued(_ context: ModelContext) throws -> [PendingMutation] {
        try context.fetch(FetchDescriptor<PendingMutation>())
    }

    @MainActor
    func testRepeatingTheSameOrderStaysIdempotent() throws {
        let context = try makeContext()
        try OfflineOrderQueue.enqueue(order(total: 1000), idempotencyKey: "order-1", context: context)
        try OfflineOrderQueue.enqueue(order(total: 1000), idempotencyKey: "order-1", context: context)

        XCTAssertEqual(try queued(context).count, 1)
    }

    @MainActor
    func testDifferentOrderUnderTheSameKeyIsRefusedLoudly() throws {
        let context = try makeContext()
        try OfflineOrderQueue.enqueue(order(total: 1000), idempotencyKey: "order-1", context: context)

        XCTAssertThrowsError(
            try OfflineOrderQueue.enqueue(order(total: 2000), idempotencyKey: "order-1", context: context)
        ) { error in
            XCTAssertTrue(error is OfflineQueueError, "ожидалась доменная ошибка очереди, получено \(type(of: error))")
        }
        XCTAssertEqual(try queued(context).count, 1)
    }

    @MainActor
    func testDistinctOrdersAccumulate() throws {
        let context = try makeContext()
        try OfflineOrderQueue.enqueue(order(total: 1000), idempotencyKey: "order-1", context: context)
        try OfflineOrderQueue.enqueue(order(total: 2000), idempotencyKey: "order-2", context: context)

        XCTAssertEqual(try queued(context).count, 2)
    }
}

import AliStoreCore
import Foundation
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

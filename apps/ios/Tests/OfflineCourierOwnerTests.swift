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

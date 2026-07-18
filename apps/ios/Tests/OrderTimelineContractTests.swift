import AliStoreCore
import Foundation
import XCTest

final class OrderTimelineContractTests: XCTestCase {
    func testDecodesOrderLedgerEvents() async throws {
        let session = makeSession(status: 200, body: """
        [
          {"id":"evt-2","type":"payment.received","actor":"customer-1","ts":"2026-07-18T05:10:01.500Z","payload":{"amount":24900},"refs":["order-1"]},
          {"id":"evt-1","type":"order.created","actor":"customer-1","ts":"2026-07-18T05:09:40Z","payload":{},"refs":["order-1"]}
        ]
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let events: [OrderLedgerEvent] = try await client.get("orders/order-1/ledger", token: "access-1")

        XCTAssertEqual(events.count, 2)
        XCTAssertEqual(events[0].id, "evt-2")
        XCTAssertEqual(events[0].type, "payment.received")
        XCTAssertEqual(events[0].actor, "customer-1")
        XCTAssertEqual(events[0].ts.timeIntervalSince1970, 1_784_351_401.5, accuracy: 0.001)
        XCTAssertEqual(events[1].type, "order.created")
        XCTAssertEqual(events[1].ts.timeIntervalSince1970, 1_784_351_380, accuracy: 0.001)
        XCTAssertEqual(OrderTimelineMockURLProtocol.lastRequest?.url?.path, "/api/orders/order-1/ledger")
        XCTAssertEqual(OrderTimelineMockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer access-1")
    }

    func testBuildsTimelineFromLedgerEvents() {
        let created = Date(timeIntervalSince1970: 1_784_351_380)
        let paid = Date(timeIntervalSince1970: 1_784_351_401)
        // Ledger arrives newest-first; the builder must not depend on input order.
        let events = [
            OrderLedgerEvent(id: "evt-2", type: "payment.received", actor: "customer-1", ts: paid),
            OrderLedgerEvent(id: "evt-1", type: "order.created", actor: "customer-1", ts: created)
        ]

        let steps = OrderTimelineBuilder.build(events: events)

        XCTAssertEqual(steps.map(\.title), ["Заказ создан", "Оплата подтверждена", "Собираем заказ", "Готов к выдаче или в пути", "Получен"])
        XCTAssertEqual(steps.map(\.isDone), [true, true, false, false, false])
        XCTAssertEqual(steps.map(\.isCurrent), [false, false, true, false, false])
        XCTAssertEqual(steps[0].time, created)
        XCTAssertEqual(steps[1].time, paid)
        XCTAssertNil(steps[2].time)
        XCTAssertNil(steps[3].time)
        XCTAssertNil(steps[4].time)
    }

    func testEmptyLedgerMarksFirstStepCurrentWithoutTimes() {
        let steps = OrderTimelineBuilder.build(events: [])

        XCTAssertEqual(steps.count, 5)
        XCTAssertEqual(steps.map(\.isDone), [false, false, false, false, false])
        XCTAssertEqual(steps.map(\.isCurrent), [true, false, false, false, false])
        XCTAssertTrue(steps.allSatisfy { $0.time == nil })
    }

    func testCompletedOrderMarksEveryStepDone() {
        let base = Date(timeIntervalSince1970: 1_784_351_380)
        let events = [
            OrderLedgerEvent(id: "evt-1", type: "order.created", actor: "customer-1", ts: base),
            OrderLedgerEvent(id: "evt-2", type: "order.paid", actor: "customer-1", ts: base.addingTimeInterval(60)),
            OrderLedgerEvent(id: "evt-3", type: "order.reserved", actor: "staff-1", ts: base.addingTimeInterval(120)),
            OrderLedgerEvent(id: "evt-4", type: "order.ready_for_pickup", actor: "staff-1", ts: base.addingTimeInterval(180)),
            OrderLedgerEvent(id: "evt-5", type: "order.completed", actor: "staff-1", ts: base.addingTimeInterval(240))
        ]

        let steps = OrderTimelineBuilder.build(events: events)

        XCTAssertEqual(steps.map(\.isDone), [true, true, true, true, true])
        XCTAssertTrue(steps.allSatisfy { !$0.isCurrent })
    }

    private func makeSession(status: Int, body: String) -> URLSession {
        OrderTimelineMockURLProtocol.status = status
        OrderTimelineMockURLProtocol.body = Data(body.utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [OrderTimelineMockURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private final class OrderTimelineMockURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var status = 200
    nonisolated(unsafe) static var body = Data()
    nonisolated(unsafe) static var lastRequest: URLRequest?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastRequest = request
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

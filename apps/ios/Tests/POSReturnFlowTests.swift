import AliStoreCore
import Foundation
import XCTest

final class POSReturnFlowTests: XCTestCase {
    func testNextStatusesMatchApiTransitions() {
        XCTAssertEqual(POSReturnFlow.nextStatuses(for: "requested"), ["under_review", "rejected"])
        XCTAssertEqual(POSReturnFlow.nextStatuses(for: "under_review"), ["approved", "rejected"])
        XCTAssertEqual(POSReturnFlow.nextStatuses(for: "approved"), ["processing", "rejected"])
        XCTAssertEqual(POSReturnFlow.nextStatuses(for: "processing"), [])
        XCTAssertEqual(POSReturnFlow.nextStatuses(for: "paid"), ["reconciled"])
        XCTAssertEqual(POSReturnFlow.nextStatuses(for: "rejected"), [])
        XCTAssertEqual(POSReturnFlow.nextStatuses(for: "reconciled"), [])
        XCTAssertEqual(POSReturnFlow.nextStatuses(for: "received"), [])
    }

    func testActionLabelsMirrorAndroidPos() {
        XCTAssertEqual(POSReturnFlow.actionLabel(for: "under_review"), "Проверка")
        XCTAssertEqual(POSReturnFlow.actionLabel(for: "approved"), "Одобрить")
        XCTAssertEqual(POSReturnFlow.actionLabel(for: "rejected"), "Отклонить")
        XCTAssertEqual(POSReturnFlow.actionLabel(for: "processing"), "Принять")
        XCTAssertEqual(POSReturnFlow.actionLabel(for: "reconciled"), "Сверить")
        XCTAssertEqual(POSReturnFlow.actionLabel(for: "paid"), "paid")
    }

    func testTransitionsReturnWithFirstStepStatus() async throws {
        let session = makeSession(status: 200, body: """
        {"id":"return-1","orderId":"order-1","reason":"Не подошёл","status":"under_review","createdAt":"2026-07-14T05:30:12.345Z"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let updated: POSReturn = try await client.patch(
            "returns/return-1",
            body: POSReturnTransitionRequest(status: "under_review"),
            token: "cashier-token"
        )

        XCTAssertEqual(updated.status, "under_review")
        XCTAssertEqual(POSReturnFlowMockURLProtocol.lastRequest?.httpMethod, "PATCH")
        XCTAssertEqual(POSReturnFlowMockURLProtocol.lastRequest?.url?.path, "/api/returns/return-1")
        XCTAssertEqual(POSReturnFlowMockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer cashier-token")
        let body = try JSONEncoder().encode(POSReturnTransitionRequest(status: "under_review"))
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(payload["status"] as? String, "under_review")
        XCTAssertNil(payload["location"])
    }

    func testReconciledTransitionSendsRestockLocation() async throws {
        let session = makeSession(status: 200, body: """
        {"id":"return-1","orderId":"order-1","reason":"Не подошёл","status":"reconciled","createdAt":"2026-07-14T05:30:12.345Z"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let updated: POSReturn = try await client.patch(
            "returns/return-1",
            body: POSReturnTransitionRequest(status: "reconciled", location: "RETURNS-BISHKEK"),
            token: "cashier-token"
        )

        XCTAssertEqual(updated.status, "reconciled")
        let body = try JSONEncoder().encode(POSReturnTransitionRequest(status: "reconciled", location: "RETURNS-BISHKEK"))
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(payload["status"] as? String, "reconciled")
        XCTAssertEqual(payload["location"] as? String, "RETURNS-BISHKEK")
    }

    func testSurfacesServerTransitionRejection() async throws {
        let session = makeSession(status: 409, body: "{\"message\":\"Переход возврата requested → received запрещён\"}")
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        do {
            let _: POSReturn = try await client.patch(
                "returns/return-1",
                body: POSReturnTransitionRequest(status: "received"),
                token: "cashier-token"
            )
            XCTFail("Expected API rejection")
        } catch let error as APIError {
            XCTAssertEqual(error.errorDescription, "Переход возврата requested → received запрещён")
        }
    }

    private func makeSession(status: Int, body: String) -> URLSession {
        POSReturnFlowMockURLProtocol.status = status
        POSReturnFlowMockURLProtocol.body = Data(body.utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [POSReturnFlowMockURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private final class POSReturnFlowMockURLProtocol: URLProtocol, @unchecked Sendable {
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

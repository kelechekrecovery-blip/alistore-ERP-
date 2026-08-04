import AliStoreCore
import Foundation
import XCTest

/// Контракт инвентаризации со стороны Staff-приложения.
///
/// Проверяем отправленный запрос и разбор ответа, а не UI: расхождение между
/// пересчётом и учётом — это деньги, и оно должно доходить до кассира ровно тем
/// числом, что вернул сервер, без клиентских «поправок».
@MainActor
final class StaffInventoryCountTests: XCTestCase {
    override func setUp() {
        super.setUp()
        InventoryMockURLProtocol.reset()
    }

    func testCountPostsProductLocationAndCountedUnderToken() async {
        InventoryMockURLProtocol.stub(path: "/api/inventory/count", status: 201, body: """
        {"productId":"p-1","location":"BISHKEK-1","expected":7,"counted":5,"diff":-2,"movementId":"m-1"}
        """)
        let store = makeStore(token: "staff-token")

        let result = await store.count(productId: "p-1", location: "BISHKEK-1", counted: 5)

        let request = InventoryMockURLProtocol.request(for: "/api/inventory/count")
        XCTAssertEqual(request?.httpMethod, "POST")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Authorization"), "Bearer staff-token")
        XCTAssertFalse(request?.value(forHTTPHeaderField: "Idempotency-Key")?.isEmpty ?? true)
        let body = InventoryMockURLProtocol.jsonBody(for: "/api/inventory/count")
        XCTAssertEqual(body?["productId"] as? String, "p-1")
        XCTAssertEqual(body?["location"] as? String, "BISHKEK-1")
        XCTAssertEqual(body?["counted"] as? Int, 5)

        // Расхождение приходит с сервера и не пересчитывается на клиенте.
        XCTAssertEqual(result?.expected, 7)
        XCTAssertEqual(result?.counted, 5)
        XCTAssertEqual(result?.diff, -2)
        XCTAssertNil(store.errorMessage)
    }

    func testCountKeepsServerError() async {
        InventoryMockURLProtocol.stub(path: "/api/inventory/count", status: 404, body: """
        {"message":"Товар p-x не найден"}
        """)
        let store = makeStore(token: "staff-token")

        let result = await store.count(productId: "p-x", location: "BISHKEK-1", counted: 3)

        XCTAssertNil(result)
        XCTAssertNotNil(store.errorMessage)
    }

    func testCountReusesKeyForRetryAndRotatesItWhenPayloadChanges() async {
        InventoryMockURLProtocol.stub(path: "/api/inventory/count", status: 503, body: """
        {"message":"Временно недоступно"}
        """)
        let store = makeStore(token: "staff-token")

        await store.count(productId: "p-1", location: "BISHKEK-1", counted: 5)
        let first = InventoryMockURLProtocol.request(for: "/api/inventory/count")?
            .value(forHTTPHeaderField: "Idempotency-Key")

        await store.count(productId: "p-1", location: "BISHKEK-1", counted: 5)
        let retry = InventoryMockURLProtocol.request(for: "/api/inventory/count")?
            .value(forHTTPHeaderField: "Idempotency-Key")
        XCTAssertEqual(retry, first)

        await store.count(productId: "p-1", location: "BISHKEK-1", counted: 6)
        let changed = InventoryMockURLProtocol.request(for: "/api/inventory/count")?
            .value(forHTTPHeaderField: "Idempotency-Key")
        XCTAssertNotEqual(changed, first)
    }

    func testWriteOffPostsQuantityLocationReasonAndSurfacesApproval() async {
        // Списание всегда идёт через одобрение: сервер отвечает 202 { approvalId,
        // status: requested }, а не «списано». UI обязан показать «на одобрении».
        InventoryMockURLProtocol.stub(path: "/api/inventory/movements", status: 202, body: """
        {"approvalId":"appr-1","status":"requested"}
        """)
        let store = makeStore(token: "staff-token")

        let approval = await store.writeOff(
            productId: "p-1",
            location: "BISHKEK-1",
            qty: 3,
            reason: "бой при транспортировке"
        )

        let request = InventoryMockURLProtocol.request(for: "/api/inventory/movements")
        XCTAssertEqual(request?.httpMethod, "POST")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Authorization"), "Bearer staff-token")
        let body = InventoryMockURLProtocol.jsonBody(for: "/api/inventory/movements")
        XCTAssertEqual(body?["productId"] as? String, "p-1")
        XCTAssertEqual(body?["qty"] as? Int, 3)
        XCTAssertEqual(body?["type"] as? String, "write_off")
        XCTAssertEqual(body?["location"] as? String, "BISHKEK-1")
        XCTAssertEqual(body?["reason"] as? String, "бой при транспортировке")

        XCTAssertEqual(approval?.approvalId, "appr-1")
        XCTAssertEqual(approval?.status, "requested")
        XCTAssertNil(store.errorMessage)
    }

    /// INV-WRITEOFF-IDEMPOTENCY-001: a write-off is approval-gated, so a repeat
    /// does not move stock by itself — it parks a second approval for one physical
    /// event, and approving both deducts twice. The key is derived from the
    /// content, so the same write-off retried is the same key.
    func testWriteOffSendsContentDerivedIdempotencyKey() async {
        InventoryMockURLProtocol.stub(path: "/api/inventory/movements", status: 202, body: """
        {"approvalId":"appr-1","status":"requested"}
        """)
        let store = makeStore(token: "staff-token")

        await store.writeOff(productId: "p-1", location: "BISHKEK-1", qty: 3, reason: "бой")
        let first = InventoryMockURLProtocol.request(for: "/api/inventory/movements")?
            .value(forHTTPHeaderField: "Idempotency-Key")
        XCTAssertNotNil(first)
        XCTAssertFalse(first?.isEmpty ?? true)

        await store.writeOff(productId: "p-1", location: "BISHKEK-1", qty: 3, reason: "бой")
        let repeated = InventoryMockURLProtocol.request(for: "/api/inventory/movements")?
            .value(forHTTPHeaderField: "Idempotency-Key")
        XCTAssertEqual(repeated, first, "the same write-off must reuse its key")

        await store.writeOff(productId: "p-1", location: "BISHKEK-1", qty: 4, reason: "бой")
        let different = InventoryMockURLProtocol.request(for: "/api/inventory/movements")?
            .value(forHTTPHeaderField: "Idempotency-Key")
        XCTAssertNotEqual(different, first, "a different quantity is a different write-off")
    }

    func testWriteOffKeepsServerError() async {
        InventoryMockURLProtocol.stub(path: "/api/inventory/movements", status: 422, body: """
        {"message":"Для серийного товара укажите конкретный IMEI"}
        """)
        let store = makeStore(token: "staff-token")

        let approval = await store.writeOff(productId: "p-serial", location: "BISHKEK-1", qty: 1, reason: "тест")

        XCTAssertNil(approval)
        XCTAssertNotNil(store.errorMessage)
    }

    private func makeStore(token: String) -> StaffInventoryStore {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [InventoryMockURLProtocol.self]
        return StaffInventoryStore(
            environment: AppEnvironment(apiBaseURL: URL(string: "https://api.example.test/api")!),
            token: token,
            session: URLSession(configuration: configuration)
        )
    }
}

private final class InventoryMockURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var responses: [String: (status: Int, body: Data)] = [:]
    nonisolated(unsafe) static var requests: [String: URLRequest] = [:]
    nonisolated(unsafe) static var bodies: [String: Data] = [:]

    static func reset() {
        responses = [:]
        requests = [:]
        bodies = [:]
    }

    static func stub(path: String, status: Int, body: String) {
        responses[path] = (status, Data(body.utf8))
    }

    static func request(for path: String) -> URLRequest? { requests[path] }

    static func jsonBody(for path: String) -> [String: Any]? {
        guard let data = bodies[path] else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        Self.requests[path] = request
        if let stream = request.httpBodyStream {
            stream.open()
            var payload = Data()
            let size = 4096
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: size)
                if read <= 0 { break }
                payload.append(buffer, count: read)
            }
            buffer.deallocate()
            stream.close()
            Self.bodies[path] = payload
        } else if let body = request.httpBody {
            Self.bodies[path] = body
        }

        let stub = Self.responses[path] ?? (status: 404, body: Data("{}".utf8))
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: stub.status,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

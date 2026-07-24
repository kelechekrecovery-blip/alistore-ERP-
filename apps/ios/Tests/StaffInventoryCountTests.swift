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

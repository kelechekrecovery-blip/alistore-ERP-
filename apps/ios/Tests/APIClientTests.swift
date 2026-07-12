import AliStoreCore
import Foundation
import XCTest

final class APIClientTests: XCTestCase {
    func testDecodesCatalogContract() async throws {
        let session = makeSession(status: 200, body: """
        {"items":[{"id":"p1","sku":"IP-1","name":"iPhone","price":100000,"category":"phones","availableUnits":2}],"total":1}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let response: CatalogResponse = try await client.get("catalog/products")

        XCTAssertEqual(response.total, 1)
        XCTAssertEqual(response.items.first?.sku, "IP-1")
        XCTAssertEqual(response.items.first?.availableUnits, 2)
    }

    func testSurfacesServerMessage() async throws {
        let session = makeSession(status: 409, body: "{\"message\":\"IMEI уже продан\"}")
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        do {
            let _: CatalogResponse = try await client.get("catalog/products")
            XCTFail("Expected API rejection")
        } catch let error as APIError {
            XCTAssertEqual(error.errorDescription, "IMEI уже продан")
        }
    }

    private func makeSession(status: Int, body: String) -> URLSession {
        MockURLProtocol.status = status
        MockURLProtocol.body = Data(body.utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var status = 200
    nonisolated(unsafe) static var body = Data()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

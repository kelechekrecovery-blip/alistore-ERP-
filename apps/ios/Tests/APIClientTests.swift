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

    func testCustomerOTPContract() async throws {
        let session = makeSession(status: 200, body: """
        {"accessToken":"access-1","refreshToken":"refresh-1","tokenType":"Bearer","expiresIn":"15m"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let tokens: CustomerAuthTokens = try await client.post(
            "auth/otp/verify",
            body: OTPVerification(phone: "+996555000000", code: "123456")
        )

        XCTAssertEqual(tokens.accessToken, "access-1")
        XCTAssertEqual(tokens.refreshToken, "refresh-1")
        XCTAssertEqual(MockURLProtocol.lastRequest?.httpMethod, "POST")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/auth/otp/verify")
    }

    func testDecodesCustomerOrderHistory() async throws {
        let session = makeSession(status: 200, body: """
        [{"id":"o1","channel":"mobile","fulfillmentType":"pickup","pickupPoint":"BISHKEK-1","deliveryAddress":null,"deliverySlot":null,"pickupCode":"4281","status":"paid","total":109900,"createdAt":"2026-07-12T12:00:00Z","items":[{"sku":"IP-1","qty":1,"price":109900,"imei":"123456789012345"}]}]
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let orders: [CustomerOrder] = try await client.get("orders/mine", token: "access-1")

        XCTAssertEqual(orders.first?.status, "paid")
        XCTAssertEqual(orders.first?.items.first?.imei, "123456789012345")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer access-1")
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

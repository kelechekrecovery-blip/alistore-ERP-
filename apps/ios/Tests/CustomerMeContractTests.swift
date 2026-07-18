import AliStoreCore
import Foundation
import XCTest

final class CustomerMeContractTests: XCTestCase {
    func testDecodesCustomerSettingsWithProfileName() async throws {
        let session = makeSession(status: 200, body: """
        {"id":"customer-1","phone":"+996555000000","name":"Айгерим","consent":true,"push":true,"whatsapp":false,"service":true,"promos":false}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let settings: CustomerSettings = try await client.get("customers/me/settings", token: "access-1")

        XCTAssertEqual(settings.id, "customer-1")
        XCTAssertEqual(settings.name, "Айгерим")
        XCTAssertEqual(settings.phone, "+996555000000")
        XCTAssertTrue(settings.consent)
        XCTAssertFalse(settings.whatsapp)
        XCTAssertEqual(CustomerMeMockURLProtocol.lastRequest?.url?.path, "/api/customers/me/settings")
        XCTAssertEqual(CustomerMeMockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer access-1")
    }

    func testDecodesProductWithDescriptionAttribute() async throws {
        let session = makeSession(status: 200, body: """
        {"product":{"id":"product-1","sku":"IP-15","barcode":null,"variantGroup":null,"name":"iPhone 15","price":89900,"category":"phones","trackingMode":"serialized","attrs":{"description":"Оригинал с гарантией","highlights":["A16"]},"bundleComponents":[],"availableUnits":3,"reviewCount":0,"avgRating":null,"updatedAt":"2026-07-18T05:00:00.000Z"},"variants":[],"related":[]}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let detail: CatalogProductDetail = try await client.get("catalog/products/product-1")

        XCTAssertEqual(detail.product.id, "product-1")
        XCTAssertEqual(detail.product.attrs?.description, "Оригинал с гарантией")
    }

    func testDecodesProductWithoutAttrs() throws {
        let body = Data("""
        {"id":"product-2","sku":"IP-14","name":"iPhone 14","price":69900,"category":"phones","availableUnits":2}
        """.utf8)

        let product = try JSONDecoder().decode(Product.self, from: body)

        XCTAssertEqual(product.id, "product-2")
        XCTAssertNil(product.attrs)
        XCTAssertNil(product.attrs?.description)
    }

    func testDecodesProductToleratingNonObjectAttrs() throws {
        let body = Data("""
        {"id":"product-3","sku":"IP-13","name":"iPhone 13","price":49900,"category":"phones","availableUnits":1,"attrs":"legacy"}
        """.utf8)

        let product = try JSONDecoder().decode(Product.self, from: body)

        XCTAssertEqual(product.id, "product-3")
        XCTAssertNil(product.attrs?.description)
    }

    func testDecodesProductIgnoringNonStringDescription() throws {
        let body = Data("""
        {"id":"product-4","sku":"IP-12","name":"iPhone 12","price":39900,"category":"phones","availableUnits":1,"attrs":{"description":42}}
        """.utf8)

        let product = try JSONDecoder().decode(Product.self, from: body)

        XCTAssertEqual(product.id, "product-4")
        XCTAssertNil(product.attrs?.description)
    }

    private func makeSession(status: Int, body: String) -> URLSession {
        CustomerMeMockURLProtocol.status = status
        CustomerMeMockURLProtocol.body = Data(body.utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CustomerMeMockURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private final class CustomerMeMockURLProtocol: URLProtocol, @unchecked Sendable {
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

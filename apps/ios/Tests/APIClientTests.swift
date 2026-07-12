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

    func testCreatesIdempotentNativeOrder() async throws {
        let session = makeSession(status: 201, body: """
        {"id":"o2","channel":"mobile","fulfillmentType":"pickup","pickupPoint":"BISHKEK-1","deliveryAddress":null,"deliverySlot":null,"pickupCode":null,"status":"created","total":109900,"createdAt":"2026-07-12T12:00:00Z","items":[{"sku":"IP-1","qty":1,"price":109900,"imei":null}]}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let input = CreateOrderRequest(
            customerId: "customer-1",
            fulfillmentType: "pickup",
            pickupPoint: "BISHKEK-1",
            deliveryAddress: nil,
            total: 109900,
            items: [CreateOrderItem(sku: "IP-1", qty: 1, price: 109900)]
        )

        let order: CustomerOrder = try await client.post(
            "orders/mine",
            body: input,
            token: "access-1",
            idempotencyKey: "native-order-1"
        )

        XCTAssertEqual(order.id, "o2")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/orders/mine")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Idempotency-Key"), "native-order-1")
    }

    func testCreatesCustomerOwnedPaymentIntent() async throws {
        let session = makeSession(status: 201, body: """
        {"intentId":"PI-O2-1","provider":"mbank","orderId":"o2","orderStatus":"awaiting_payment","method":"qr_mbank","amount":109900,"txnId":"txn-1","status":"requires_action","expiresAt":"2026-07-12T12:15:00Z","paymentUrl":"/sandbox/payments/mbank/PI-O2-1","qrPayload":"MBANK|o2|109900"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let request = CreatePaymentIntentRequest(
            orderId: "o2",
            method: .qrMBank,
            amount: 109900,
            returnUrl: "alistore://payment-return?orderId=o2"
        )
        let intent: PaymentIntent = try await client.post(
            "payments/intents/mine",
            body: request,
            token: "access-1",
            idempotencyKey: "native-payment-1"
        )

        XCTAssertEqual(intent.status, "requires_action")
        XCTAssertEqual(intent.qrPayload, "MBANK|o2|109900")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/payments/intents/mine")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer access-1")
        let body = try JSONEncoder().encode(request)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(payload["returnUrl"] as? String, "alistore://payment-return?orderId=o2")
    }

    func testDecodesCustomerDevices() async throws {
        let session = makeSession(status: 200, body: """
        [{"imei":"123456789012345","product":"iPhone 15","status":"sold","warrantyUntil":"2027-07-12T00:00:00.000Z","daysLeft":365,"warranty":null}]
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let devices: [CustomerDevice] = try await client.get("customers/me/devices", token: "access-1")

        XCTAssertEqual(devices.first?.product, "iPhone 15")
        XCTAssertEqual(devices.first?.daysLeft, 365)
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer access-1")
    }

    func testOpensCustomerWarrantyCase() async throws {
        let session = makeSession(status: 201, body: """
        {"id":"w1","imei":"123456789012345","customerId":"customer-1","problem":"Не включается","status":"created","sla":"2026-07-15T12:00:00Z"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let warranty: WarrantyCase = try await client.post(
            "warranty",
            body: OpenWarrantyRequest(imei: "123456789012345", customerId: "customer-1", problem: "Не включается"),
            token: "access-1",
            idempotencyKey: "warranty-1"
        )

        XCTAssertEqual(warranty.status, "created")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/warranty")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Idempotency-Key"), "warranty-1")
    }

    func testRegistersNativeAPNsTokenForCustomer() async throws {
        let token = String(repeating: "ab", count: 32)
        let session = makeSession(status: 201, body: """
        {"id":"push-1","token":"\(token)","platform":"ios","deviceId":"ios-install-1","scope":"customer","customerId":"customer-1","enabled":true,"lastSeenAt":"2026-07-12T12:00:00Z"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let registered: RegisteredPushToken = try await client.post(
            "notifications/push-tokens",
            body: RegisterPushTokenRequest(token: token, deviceId: "ios-install-1"),
            token: "access-1"
        )

        XCTAssertTrue(registered.enabled)
        XCTAssertEqual(registered.scope, "customer")
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

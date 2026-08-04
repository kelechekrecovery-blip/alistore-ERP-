import AliStoreCore
import Foundation
import XCTest

/// Контракт оплаты подарочной картой со стороны клиентского приложения.
///
/// Деньги: проверяем ровно то тело и заголовки, что уходят на сервер, и что
/// отказ сервера превращается в брошенную ошибку, а не в «оплачено». Баланс и
/// факт списания считает сервер — клиент их не пересчитывает.
@MainActor
final class GiftCardPaymentTests: XCTestCase {
    override func setUp() {
        super.setUp()
        GiftMockURLProtocol.reset()
    }

    func testLookupReadsBalanceByCode() async throws {
        GiftMockURLProtocol.stub(path: "/api/giftcards/GC-100", status: 200, body: """
        {"code":"GC-100","balance":150000,"currency":"KGS","status":"active","redeemable":true,"expiresAt":null}
        """)
        let checkout = makeCheckout()

        let card = try await checkout.lookup(code: "  GC-100 ")

        // Пробелы вокруг кода не должны рождать другой маршрут.
        XCTAssertEqual(GiftMockURLProtocol.request(for: "/api/giftcards/GC-100")?.httpMethod, "GET")
        XCTAssertEqual(card.code, "GC-100")
        XCTAssertEqual(card.balance, 150000)
        XCTAssertTrue(card.redeemable)
    }

    func testPayPostsGiftCardTenderUnderCustomerToken() async throws {
        GiftMockURLProtocol.stub(path: "/api/payments", status: 201, body: """
        {"paymentId":"pay-1","status":"captured"}
        """)
        let checkout = makeCheckout()

        try await checkout.pay(orderId: "o-1", amount: 150000, code: "GC-100", token: "cust-token")

        let request = GiftMockURLProtocol.request(for: "/api/payments")
        XCTAssertEqual(request?.httpMethod, "POST")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Authorization"), "Bearer cust-token")
        let body = GiftMockURLProtocol.jsonBody(for: "/api/payments")
        XCTAssertEqual(body?["orderId"] as? String, "o-1")
        XCTAssertEqual(body?["method"] as? String, "gift_card")
        XCTAssertEqual(body?["amount"] as? Int, 150000)
        XCTAssertEqual(body?["giftCardCode"] as? String, "GC-100")
    }

    func testPayThrowsOnServerRejection() async {
        // Нехватка баланса / неверный код → сервер отвечает не-2xx. Оплата обязана
        // бросить, чтобы заказ остался неоплаченным и не показал ложный успех.
        GiftMockURLProtocol.stub(path: "/api/payments", status: 422, body: """
        {"message":"Недостаточно средств на карте"}
        """)
        let checkout = makeCheckout()

        do {
            try await checkout.pay(orderId: "o-1", amount: 150000, code: "GC-100", token: "cust-token")
            XCTFail("оплата с нехваткой баланса должна была бросить")
        } catch {
            // ожидаемо
        }
    }

    private func makeCheckout() -> GiftCardCheckout {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [GiftMockURLProtocol.self]
        return GiftCardCheckout(
            environment: AppEnvironment(apiBaseURL: URL(string: "https://api.example.test/api")!),
            session: URLSession(configuration: configuration)
        )
    }
}

private final class GiftMockURLProtocol: URLProtocol, @unchecked Sendable {
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

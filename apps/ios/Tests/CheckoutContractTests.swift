// JSON wire fixtures stay inline so the asserted contract is visible beside each test.
// swiftlint:disable line_length
import AliStoreCore
import Foundation
import XCTest

final class CheckoutContractTests: XCTestCase {
    func testEncodesCreateOrderRequestWithCheckoutParityFields() throws {
        let request = CreateOrderRequest(
            customerId: "customer-1",
            fulfillmentType: "courier",
            storePointId: nil,
            deliveryAddress: "Бишкек, Киевская 77",
            total: 95000,
            items: [CreateOrderItem(sku: "IP-1", qty: 1, price: 95000)],
            paymentMode: "cod",
            promoCode: "SALE5000",
            loyaltyPoints: 500,
            deliveryZoneId: "zone-1",
            deliverySlotId: "slot-1",
            deliverySlot: "12:00–14:00"
        )

        let body = try JSONEncoder().encode(request)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])

        XCTAssertEqual(payload["paymentMode"] as? String, "cod")
        XCTAssertEqual(payload["promoCode"] as? String, "SALE5000")
        XCTAssertEqual(payload["loyaltyPoints"] as? Int, 500)
        XCTAssertEqual(payload["deliveryZoneId"] as? String, "zone-1")
        XCTAssertEqual(payload["deliverySlotId"] as? String, "slot-1")
        XCTAssertEqual(payload["deliverySlot"] as? String, "12:00–14:00")
    }

    func testDecodesLegacyQueuedOrderWithoutParityFields() throws {
        let legacy = Data("""
        {"customerId":"customer-1","channel":"mobile","fulfillmentType":"pickup","storePointId":"alistore-bishkek-1","deliveryAddress":null,"total":100,"items":[{"sku":"OFFLINE-1","qty":1,"price":100}]}
        """.utf8)

        let request = try JSONDecoder().decode(CreateOrderRequest.self, from: legacy)

        XCTAssertEqual(request.fulfillmentType, "pickup")
        XCTAssertNil(request.paymentMode)
        XCTAssertNil(request.promoCode)
        XCTAssertNil(request.loyaltyPoints)
        XCTAssertNil(request.deliveryZoneId)
        XCTAssertNil(request.deliverySlotId)
        XCTAssertNil(request.deliverySlot)
    }

    func testOmitsParityFieldsWhenNotProvided() throws {
        let request = CreateOrderRequest(
            customerId: "customer-1",
            fulfillmentType: "pickup",
            storePointId: "alistore-bishkek-1",
            deliveryAddress: nil,
            total: 100,
            items: [CreateOrderItem(sku: "OFFLINE-1", qty: 1, price: 100)]
        )

        let body = try JSONEncoder().encode(request)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])

        XCTAssertNil(payload["paymentMode"])
        XCTAssertNil(payload["promoCode"])
        XCTAssertNil(payload["loyaltyPoints"])
        XCTAssertNil(payload["deliveryZoneId"])
        XCTAssertNil(payload["deliverySlotId"])
        XCTAssertNil(payload["deliverySlot"])
    }

    func testDecodesCheckoutOptionsWithDeliveryZones() async throws {
        let session = makeSession(status: 200, body: """
        {"pickupPoints":[{"id":"point-1","code":"center","name":"AliStore Центр","address":"Киевская 95","inventoryLocation":"bishkek-1","hours":"09:00–21:00","pickupInstructions":null,"sortOrder":1}],"deliveryZones":[{"id":"zone-1","code":"bishkek-center","name":"Центр","fee":200,"etaMinMinutes":60,"etaMaxMinutes":120,"active":true,"slots":[{"id":"slot-1","zoneId":"zone-1","startsAt":"2026-07-18T06:00:00.000Z","endsAt":"2026-07-18T08:00:00.000Z","capacity":5,"reserved":2,"remaining":3,"available":true},{"id":"slot-2","zoneId":"zone-1","startsAt":"2026-07-18T08:00:00.000Z","endsAt":"2026-07-18T10:00:00.000Z","capacity":1,"reserved":1,"remaining":0,"available":false}]}]}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let options: CheckoutOptions = try await client.get("logistics/checkout-options")

        XCTAssertEqual(options.pickupPoints.first?.id, "point-1")
        XCTAssertEqual(options.deliveryZones.count, 1)
        let zone = try XCTUnwrap(options.deliveryZones.first)
        XCTAssertEqual(zone.fee, 200)
        XCTAssertEqual(zone.slots.count, 2)
        XCTAssertTrue(zone.slots[0].available)
        XCTAssertEqual(zone.slots[0].remaining, 3)
        XCTAssertFalse(zone.slots[1].available)
        XCTAssertEqual(zone.slots[0].startsAt.timeIntervalSince1970, 1_784_354_400)
    }

    func testQuotesPromotionCodeForCartItems() async throws {
        let session = makeSession(status: 200, body: """
        {"id":"promo-1","code":"SALE5000","name":"Летняя распродажа","subtotal":109900,"eligibleSubtotal":109900,"discount":5000,"customerLimitVerified":true,"validUntil":null}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let request = PromotionQuoteRequest(
            code: "SALE5000",
            items: [PromotionQuoteItem(sku: "IP-1", qty: 1)]
        )

        let quote: PromotionQuote = try await client.post(
            "promotions/quote",
            body: request,
            token: "access-1"
        )

        XCTAssertEqual(quote.code, "SALE5000")
        XCTAssertEqual(quote.discount, 5000)
        XCTAssertEqual(CheckoutMockURLProtocol.lastRequest?.url?.path, "/api/promotions/quote")
        XCTAssertEqual(CheckoutMockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer access-1")
        let body = try JSONEncoder().encode(request)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(payload["code"] as? String, "SALE5000")
        let items = try XCTUnwrap(payload["items"] as? [[String: Any]])
        XCTAssertEqual(items.first?["sku"] as? String, "IP-1")
        XCTAssertEqual(items.first?["qty"] as? Int, 1)
        XCTAssertNil(items.first?["price"])
    }

    func testSupplyPolicyRequiresServerCapabilityTotpAndAuthoritativePoint() {
        let owner = StaffSession(
            accessToken: "token",
            staffId: "owner-1",
            username: "owner",
            role: "owner",
            point: "MANAS-1",
            totpEnabled: true
        )
        XCTAssertTrue(NativeSupplyPolicy.canResolveOwnerCancellation(session: owner, serverCapability: true))
        XCTAssertTrue(NativeSupplyPolicy.canUsePointBoundOperations(session: owner))
        XCTAssertFalse(NativeSupplyPolicy.canResolveOwnerCancellation(
            session: StaffSession(accessToken: "t", staffId: "admin", username: "admin", role: "admin"),
            serverCapability: true
        ))
        XCTAssertFalse(NativeSupplyPolicy.canUsePointBoundOperations(
            session: StaffSession(accessToken: "t", staffId: "seller", username: "seller", role: "seller")
        ))
    }

    func testCourierGateRequiresEveryLineAndReceivableReady() {
        let ready = CustomerOrderItem(
            sku: "TO-1",
            qty: 1,
            price: 100,
            imei: nil,
            id: "line-1",
            supplyModeSnapshot: "to_order",
            fulfillmentStatus: "ready"
        )
        let waiting = CustomerOrderItem(
            sku: "TO-2",
            qty: 1,
            price: 100,
            imei: nil,
            id: "line-2",
            supplyModeSnapshot: "to_order",
            fulfillmentStatus: "in_transit"
        )
        let settled = OrderReceivable(
            id: "r-1",
            orderItemId: "line-1",
            kind: "supply_balance",
            amount: 100,
            settledAmount: 100,
            status: "settled",
            dueAt: nil
        )
        let order = CustomerOrder(
            id: "o-1",
            channel: "app",
            fulfillmentType: "courier",
            pickupPoint: nil,
            deliveryAddress: "Манас",
            deliverySlot: nil,
            pickupCode: nil,
            status: "confirmed",
            total: 200,
            createdAt: Date(),
            items: [ready, waiting],
            paymentSchedule: [settled]
        )
        XCTAssertFalse(NativeSupplyPolicy.allLinesReadyForCourier(order))
    }

    func testDecodesCancellationPreviewAndRefundStatusAdditively() throws {
        let preview = try JSONDecoder().decode(OrderCancellationPreview.self, from: Data("""
        {"orderId":"o-1","canCancel":true,"blockedReason":null,"policy":"owner_resolution","purchaseOrderSent":true,"depositPaid":2000,"estimatedRefundAmount":2000,"supplierExpenseDeduction":0,"ownerReviewRequired":true,"note":"Проверка","requestEnabled":true}
        """.utf8))
        XCTAssertTrue(preview.requestEnabled == true)
        XCTAssertTrue(preview.ownerReviewRequired)
        XCTAssertEqual(preview.estimatedRefundAmount, 2000)
    }

    private func makeSession(status: Int, body: String) -> URLSession {
        CheckoutMockURLProtocol.status = status
        CheckoutMockURLProtocol.body = Data(body.utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CheckoutMockURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private final class CheckoutMockURLProtocol: URLProtocol, @unchecked Sendable {
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

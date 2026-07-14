import AliStoreCore
import Foundation
import SwiftData
import XCTest

final class APIClientTests: XCTestCase {
    func testUploadsAuthenticatedStaffEvidenceMultipart() async throws {
        let session = makeSession(status: 201, body: """
        {"entityType":"order","entityId":"order-1","asset":{"key":"evidence/order/order-1/photo.webp","url":"/media/photo.webp","width":1200,"height":900,"bytes":42000,"format":"webp"},"label":"handover"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let attachment = try await client.uploadEvidence(
            imageData: Data([0xff, 0xd8, 0xff, 0xd9]),
            entityType: "order",
            entityId: "order-1",
            label: "handover",
            token: "staff-token"
        )

        XCTAssertEqual(attachment.asset.format, "webp")
        XCTAssertEqual(MockURLProtocol.lastRequest?.httpMethod, "POST")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/evidence/images")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer staff-token")
        XCTAssertTrue(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
        let multipart = EvidenceMultipart.build(
            imageData: Data([0xff, 0xd8, 0xff, 0xd9]),
            entityType: "order",
            entityId: "order-1",
            label: "handover",
            boundary: "test-boundary"
        )
        let text = String(decoding: multipart.body, as: UTF8.self)
        XCTAssertTrue(text.contains("name=\"entityType\"\r\n\r\norder"))
        XCTAssertTrue(text.contains("name=\"entityId\"\r\n\r\norder-1"))
        XCTAssertTrue(text.contains("name=\"file\"; filename=\"evidence.jpg\""))
    }

    func testDecodesStaffCustomer360AndMaskedPII() async throws {
        let session = makeSession(status: 200, body: """
        {"customer":{"id":"customer-1","name":"Тест","phone":"+996******00","consent":true,"segments":["vip"],"ltv":150000,"createdAt":"2026-07-12T12:00:00Z"},"orders":{"total":1,"spent":109900,"recent":[{"id":"order-1","status":"paid","total":109900,"createdAt":"2026-07-12T12:00:00Z"}]},"debts":{"count":1,"openBalance":40100,"items":[{"id":"debt-1","balance":40100,"status":"open","dueDate":"2026-08-12T12:00:00Z"}]},"warranties":{"open":1,"items":[{"id":"warranty-1","imei":"123456789012345","status":"created","sla":"2026-07-26T12:00:00Z"}]},"tickets":{"open":1,"items":[{"id":"ticket-1","subject":"Доставка","status":"new","priority":"high","sla":"2026-07-13T12:00:00Z"}]}}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let overview: Customer360 = try await client.get("customers/customer-1/overview", token: "staff-token")

        XCTAssertEqual(overview.customer.phone, "+996******00")
        XCTAssertEqual(overview.orders.spent, 109900)
        XCTAssertEqual(overview.warranties.items.first?.status, "created")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer staff-token")
    }

    func testPatchesStaffWarrantyTransition() async throws {
        let session = makeSession(status: 200, body: """
        {"id":"warranty-1","imei":"123456789012345","customerId":"customer-1","problem":"Не включается","status":"received","sla":"2026-07-26T12:00:00Z"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let warranty: WarrantyCase = try await client.patch(
            "warranty/warranty-1",
            body: WarrantyStatusRequest(status: "received"),
            token: "staff-token"
        )

        XCTAssertEqual(warranty.status, "received")
        XCTAssertEqual(MockURLProtocol.lastRequest?.httpMethod, "PATCH")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/warranty/warranty-1")
    }

    func testDecodesStaffOrderQueue() async throws {
        let session = makeSession(status: 200, body: """
        [{"id":"order-1","channel":"web","fulfillmentType":"pickup","pickupPoint":"BISHKEK-1","deliveryAddress":null,"deliverySlot":null,"pickupCode":"PU-123","status":"created","total":109900,"createdAt":"2026-07-12T12:00:00Z","items":[{"sku":"IP-1","qty":1,"price":109900,"imei":null}],"customer":{"phone":"+996555000000","name":"Тест"}}]
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let orders: [CustomerOrder] = try await client.get("orders?status=created", token: "staff-token")

        XCTAssertEqual(orders.first?.status, "created")
        XCTAssertEqual(orders.first?.items.first?.sku, "IP-1")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.query, "status=created")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer staff-token")
    }

    func testDecodesStaffFulfillmentAndTransitionContracts() async throws {
        var session = makeSession(status: 200, body: """
        {"order":{"id":"order-1","status":"reserved"},"assigned":["123456789012345"]}
        """)
        var client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let fulfilled: FulfillOrderResponse = try await client.post(
            "orders/order-1/fulfill",
            body: EmptyRequest(),
            token: "staff-token"
        )
        XCTAssertEqual(fulfilled.order.status, "reserved")
        XCTAssertEqual(fulfilled.assigned, ["123456789012345"])

        session = makeSession(status: 200, body: "{\"id\":\"order-1\",\"status\":\"picking\"}")
        client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let transitioned: OrderStatusMutation = try await client.post(
            "orders/order-1/transition",
            body: OrderTransitionRequest(to: "picking"),
            token: "staff-token"
        )
        XCTAssertEqual(transitioned.status, "picking")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/orders/order-1/transition")
    }

    func testDecodesStaffShiftWithDrawerReconciliation() async throws {
        let session = makeSession(status: 200, body: """
        {"id":"shift-1","staffId":"staff-1","point":"BISHKEK-1","openCash":5000,"closeCash":null,"diff":null,"openedAt":"2026-07-12T12:00:00Z","closedAt":null,"payments":[{"id":"pay-1","amount":1200,"method":"cash","status":"received"},{"id":"pay-2","amount":3000,"method":"card","status":"received"}]}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let shift: CashShift = try await client.get("shifts/shift-1", token: "staff-token")

        XCTAssertEqual(shift.expectedCash, 6200)
        XCTAssertEqual(shift.payments?.count, 2)
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer staff-token")
    }

    func testEncodesStaffShiftOpenAndCloseContracts() throws {
        let open = try JSONEncoder().encode(OpenShiftRequest(staffId: "spoof-ignored", point: "BISHKEK-1", openCash: 5000))
        let openPayload = try XCTUnwrap(JSONSerialization.jsonObject(with: open) as? [String: Any])
        XCTAssertEqual(openPayload["point"] as? String, "BISHKEK-1")
        XCTAssertEqual(openPayload["openCash"] as? Int, 5000)

        let close = try JSONEncoder().encode(CloseShiftRequest(closeCash: 6100, reason: "Недостача"))
        let closePayload = try XCTUnwrap(JSONSerialization.jsonObject(with: close) as? [String: Any])
        XCTAssertEqual(closePayload["closeCash"] as? Int, 6100)
        XCTAssertEqual(closePayload["reason"] as? String, "Недостача")
    }

    @MainActor
    func testQueuesNativeOrderWithStableIdempotencyKey() throws {
        let container = try ModelContainer(
            for: PendingMutation.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let request = CreateOrderRequest(
            customerId: "customer-1",
            fulfillmentType: "pickup",
            pickupPoint: "BISHKEK-1",
            deliveryAddress: nil,
            total: 100,
            items: [CreateOrderItem(sku: "OFFLINE-1", qty: 1, price: 100)]
        )

        try OfflineOrderQueue.enqueue(
            request,
            idempotencyKey: "offline-order-1",
            context: container.mainContext
        )

        let queued = try container.mainContext.fetch(FetchDescriptor<PendingMutation>())
        XCTAssertEqual(queued.count, 1)
        XCTAssertEqual(queued.first?.state, "queued")
        XCTAssertEqual(queued.first?.idempotencyKey, "offline-order-1")
    }

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

    func testLoadsAndTransitionsOwnedStaffTask() async throws {
        let session = makeSession(status: 200, body: """
        [{"id":"task-1","title":"Проверить витрину","description":"Фото после открытия","status":"open","priority":"high","assigneeId":"staff-1","dueAt":"2026-07-14T12:00:00Z","relatedType":"shift","relatedId":"shift-1","createdAt":"2026-07-14T08:00:00Z","updatedAt":"2026-07-14T08:00:00Z","completedAt":null}]
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let tasks: [StaffTask] = try await client.get("staff-tasks/mine", token: "staff-access")

        XCTAssertEqual(tasks.first?.id, "task-1")
        XCTAssertEqual(tasks.first?.priority, "high")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/staff-tasks/mine")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer staff-access")

        MockURLProtocol.body = Data("""
        {"id":"task-1","title":"Проверить витрину","description":"Фото после открытия","status":"in_progress","priority":"high","assigneeId":"staff-1","dueAt":"2026-07-14T12:00:00Z","relatedType":"shift","relatedId":"shift-1","createdAt":"2026-07-14T08:00:00Z","updatedAt":"2026-07-14T08:05:00Z","completedAt":null}
        """.utf8)
        let updated: StaffTask = try await client.patch(
            "staff-tasks/mine/task-1",
            body: UpdateStaffTaskRequest(status: "in_progress"),
            token: "staff-access"
        )

        XCTAssertEqual(updated.status, "in_progress")
        XCTAssertEqual(MockURLProtocol.lastRequest?.httpMethod, "PATCH")
    }

    func testTransitionsSupportTicketWithStaffSession() async throws {
        let session = makeSession(status: 200, body: """
        {"id":"ticket-1","customerId":"customer-1","channel":"app","subject":"Не пришёл чек","body":"После оплаты","priority":"high","sla":"2026-07-14T12:00:00Z","status":"in_progress","assignee":"staff-1","createdAt":"2026-07-14T08:00:00Z"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let ticket: StaffSupportTicket = try await client.patch(
            "support/tickets/ticket-1/transition",
            body: SupportTransitionRequest(to: "in_progress", assignee: "staff-1"),
            token: "staff-access"
        )

        XCTAssertEqual(ticket.assignee, "staff-1")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/support/tickets/ticket-1/transition")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer staff-access")
    }

    func testRegistersNativeAPNsTokenForStaff() async throws {
        let token = String(repeating: "cd", count: 32)
        let session = makeSession(status: 201, body: """
        {"id":"push-staff-1","token":"\(token)","platform":"ios","deviceId":"ios-staff-install-1","scope":"staff","customerId":null,"staffId":"staff-1","enabled":true,"lastSeenAt":"2026-07-14T12:00:00Z"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let registered: RegisteredPushToken = try await client.post(
            "notifications/push-tokens",
            body: RegisterPushTokenRequest(token: token, deviceId: "ios-staff-install-1", scope: "staff"),
            token: "staff-access"
        )

        XCTAssertEqual(registered.scope, "staff")
        XCTAssertEqual(registered.staffId, "staff-1")
        let body = try JSONEncoder().encode(RegisterPushTokenRequest(token: token, deviceId: "ios-staff-install-1", scope: "staff"))
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(payload["scope"] as? String, "staff")
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

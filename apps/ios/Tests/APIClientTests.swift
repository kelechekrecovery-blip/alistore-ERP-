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

    func testLoadsOwnedHrWeekAndMarksAttendanceWithStableKey() async throws {
        var session = makeSession(status: 200, body: """
        {"weekStart":"2026-07-13T00:00:00.000Z","weekEnd":"2026-07-19T00:00:00.000Z","point":null,"staff":[{"id":"staff-1","username":"seller","role":"seller","active":true}],"schedules":[{"id":"schedule-1","staffId":"staff-1","point":"BISHKEK-1","shiftDate":"2026-07-14T00:00:00.000Z","startsAt":"2026-07-14T03:00:00.000Z","endsAt":"2026-07-14T12:00:00.000Z","cancelledAt":null,"attendance":null}],"absences":[],"timesheet":[]}
        """)
        var client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let week: StaffHrWeek = try await client.get("hr/me/week?weekStart=2026-07-13", token: "staff-token")

        XCTAssertEqual(week.schedules.first?.id, "schedule-1")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.query, "weekStart=2026-07-13")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer staff-token")

        session = makeSession(status: 201, body: """
        {"id":"attendance-1","scheduleId":"schedule-1","staffId":"staff-1","point":"BISHKEK-1","checkedInAt":"2026-07-14T03:02:00.000Z","checkedOutAt":null}
        """)
        client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let attendance: StaffHrAttendance = try await client.post(
            "hr/me/attendance/open",
            body: StaffAttendanceRequest(scheduleId: "schedule-1"),
            token: "staff-token",
            idempotencyKey: "staff-attendance-open-1"
        )

        XCTAssertEqual(attendance.scheduleId, "schedule-1")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/hr/me/attendance/open")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Idempotency-Key"), "staff-attendance-open-1")
    }

    @MainActor
    func testQueuesStaffAttendanceWithStableIdempotencyKey() throws {
        let container = try ModelContainer(
            for: PendingMutation.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )

        try OfflineCourierQueue.enqueue(
            endpoint: "hr/me/attendance/open",
            body: StaffAttendanceRequest(scheduleId: "schedule-1"),
            idempotencyKey: "staff-attendance-offline-1",
            context: container.mainContext
        )

        let queued = try container.mainContext.fetch(FetchDescriptor<PendingMutation>())
        XCTAssertEqual(queued.count, 1)
        XCTAssertEqual(queued.first?.endpoint, "hr/me/attendance/open")
        XCTAssertEqual(queued.first?.idempotencyKey, "staff-attendance-offline-1")
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
            storePointId: "alistore-bishkek-1",
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
            storePointId: "alistore-bishkek-1",
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

    func testLoadsCustomerSupportTickets() async throws {
        let session = makeSession(status: 200, body: """
        [{"id":"ticket-1","customerId":"customer-1","channel":"app","subject":"Не пришёл чек","body":"После оплаты","priority":"high","sla":"2026-07-15T12:00:00Z","status":"new","assignee":null,"createdAt":"2026-07-14T08:00:00Z"}]
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let tickets: [CustomerSupportTicket] = try await client.get("support/tickets/mine", token: "access-1")

        XCTAssertEqual(tickets.first?.subject, "Не пришёл чек")
        XCTAssertEqual(tickets.first?.priority, "high")
        XCTAssertEqual(MockURLProtocol.lastRequest?.httpMethod, "GET")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/api/support/tickets/mine")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer access-1")
    }

    func testOpensIdempotentCustomerSupportTicket() async throws {
        let session = makeSession(status: 201, body: """
        {"id":"ticket-2","customerId":"customer-1","channel":"app","subject":"Вопрос по доставке","body":"Когда приедет курьер?","priority":"normal","sla":"2026-07-16T12:00:00Z","status":"new","assignee":null,"createdAt":"2026-07-15T08:00:00Z"}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let request = OpenCustomerSupportTicketRequest(
            subject: "Вопрос по доставке",
            body: "Когда приедет курьер?"
        )

        let ticket: CustomerSupportTicket = try await client.post(
            "support/tickets/mine",
            body: request,
            token: "access-1",
            idempotencyKey: "ios-support-ticket-1"
        )

        XCTAssertEqual(ticket.status, "new")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Idempotency-Key"), "ios-support-ticket-1")
        let body = try JSONEncoder().encode(request)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(payload["channel"] as? String, "app")
        XCTAssertEqual(payload["subject"] as? String, "Вопрос по доставке")
        XCTAssertEqual(payload["body"] as? String, "Когда приедет курьер?")
        XCTAssertEqual(payload["priority"] as? String, "normal")
        XCTAssertNil(payload["customerId"])
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

    func testDecodesCourierRouteAndOutstandingCOD() async throws {
        let session = makeSession(status: 200, body: """
        [{"id":"order-1","status":"courier_assigned","total":109900,"deliveryAddress":"Бишкек, Киевская 77","deliverySlot":"12:00–14:00","customer":{"name":"Айжан","phone":"+996555000000"},"items":[{"sku":"IP-1","qty":1,"price":109900,"imei":"123456789012345"}],"payments":[{"amount":50000,"status":"received"},{"amount":1000,"status":"pending"}],"courierRun":{"id":"run-1","codTotal":59900,"collectedTotal":0,"handedOver":false}}]
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let deliveries: [CourierDelivery] = try await client.get("courier/me/deliveries", token: "courier-access")

        XCTAssertEqual(deliveries.first?.customer.name, "Айжан")
        XCTAssertEqual(deliveries.first?.outstandingCOD, 59900)
        XCTAssertEqual(deliveries.first?.courierRun?.id, "run-1")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer courier-access")
    }

    func testSendsCourierDeliveryAndHandoverWithStableKeys() async throws {
        var session = makeSession(status: 201, body: "{\"id\":\"order-1\",\"status\":\"out_for_delivery\"}")
        var client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let started: CourierCommandResponse = try await client.post(
            "courier/orders/order-1/start",
            body: EmptyMutationRequest(),
            token: "courier-access",
            idempotencyKey: "courier-start-1"
        )
        XCTAssertEqual(started.status, "out_for_delivery")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Idempotency-Key"), "courier-start-1")

        session = makeSession(status: 201, body: "{\"id\":\"run-1\",\"codTotal\":59900,\"collectedTotal\":59900,\"handedOver\":true}")
        client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let run: CourierRunSummary = try await client.post(
            "courier/handover",
            body: CourierHandoverRequest(runId: "run-1", amount: 59900),
            token: "courier-access",
            idempotencyKey: "courier-handover-run-1"
        )
        XCTAssertTrue(run.handedOver)
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Idempotency-Key"), "courier-handover-run-1")
        let encoded = try JSONEncoder().encode(CompleteCourierDeliveryRequest(codAmount: 59900))
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual(payload["codAmount"] as? Int, 59900)
    }

    @MainActor
    func testReplaysQueuedCourierCommandWithOriginalIdempotencyKey() async throws {
        let container = try ModelContainer(
            for: PendingMutation.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        try OfflineCourierQueue.enqueue(
            endpoint: "courier/orders/order-1/start",
            body: EmptyMutationRequest(),
            idempotencyKey: "offline-courier-start-1",
            context: container.mainContext
        )
        let queued = try XCTUnwrap(container.mainContext.fetch(FetchDescriptor<PendingMutation>()).first)
        let session = makeSession(status: 201, body: "{\"id\":\"order-1\",\"status\":\"out_for_delivery\"}")
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        await OfflineCourierQueue.replay(queued, api: client, token: "courier-access", context: container.mainContext)

        XCTAssertTrue(try container.mainContext.fetch(FetchDescriptor<PendingMutation>()).isEmpty)
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Idempotency-Key"), "offline-courier-start-1")
    }

    func testCompletesPOSSaleWithStableClientSaleId() async throws {
        let session = makeSession(status: 201, body: """
        {"pendingApproval":false,"orderId":"order-pos-1","receiptNo":"POS-000001","total":95000,"status":"paid","shiftId":"shift-1","imeis":["123456789012345"]}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let request = POSSaleRequest(
            point: "BISHKEK-1",
            lines: [POSLine(productId: "product-1", sku: "IP-1", price: 100000, qty: 1, imei: "123456789012345")],
            payments: [POSTender(method: "cash", amount: 50000), POSTender(method: "card", amount: 45000)],
            discountPct: 5,
            clientSaleId: "ios-pos-sale-1"
        )

        let result: POSSaleResult = try await client.post(
            "pos/sale", body: request, token: "cashier-token", idempotencyKey: request.clientSaleId
        )

        guard case let .completed(orderId, receiptNo, total, status, shiftId, imeis) = result else {
            return XCTFail("Expected completed sale")
        }
        XCTAssertEqual(orderId, "order-pos-1")
        XCTAssertEqual(receiptNo, "POS-000001")
        XCTAssertEqual(total, 95000)
        XCTAssertEqual(status, "paid")
        XCTAssertEqual(shiftId, "shift-1")
        XCTAssertEqual(imeis, ["123456789012345"])
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer cashier-token")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Idempotency-Key"), "ios-pos-sale-1")
        let body = try JSONEncoder().encode(request)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(payload["clientSaleId"] as? String, "ios-pos-sale-1")
        XCTAssertEqual((payload["payments"] as? [[String: Any]])?.count, 2)
    }

    func testDecodesPOSApprovalWithoutChangingSaleIdentity() throws {
        let data = Data("""
        {"pendingApproval":true,"approvalId":"approval-1","reason":"margin_and_discount"}
        """.utf8)
        let result = try JSONDecoder().decode(POSSaleResult.self, from: data)
        guard case let .approvalRequired(approvalId, reason) = result else {
            return XCTFail("Expected approval")
        }
        XCTAssertEqual(approvalId, "approval-1")
        XCTAssertEqual(reason, "margin_and_discount")

        let request = POSSaleRequest(
            point: "BISHKEK-1",
            lines: [POSLine(productId: "p1", sku: "SKU-1", price: 100, qty: 1)],
            payments: [POSTender(method: "cash", amount: 90)],
            discountPct: 10,
            clientSaleId: "stable-sale"
        ).approved(with: approvalId)
        XCTAssertEqual(request.clientSaleId, "stable-sale")
        XCTAssertEqual(request.approvalId, "approval-1")
    }

    @MainActor
    func testPOSOfflineQueueDeduplicatesAndRetainsApproval() throws {
        let container = try ModelContainer(
            for: PendingMutation.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let request = POSSaleRequest(
            point: "BISHKEK-1",
            lines: [POSLine(productId: "p1", sku: "SKU-1", price: 100, qty: 1)],
            payments: [POSTender(method: "cash", amount: 90)],
            discountPct: 10,
            clientSaleId: "offline-pos-1"
        )
        try OfflinePOSQueue.enqueue(request, context: container.mainContext)
        try OfflinePOSQueue.enqueue(request, context: container.mainContext)
        let mutation = try XCTUnwrap(container.mainContext.fetch(FetchDescriptor<PendingMutation>()).first)
        XCTAssertEqual(try container.mainContext.fetch(FetchDescriptor<PendingMutation>()).count, 1)
        mutation.lastError = "approval:approval-1|discount"
        mutation.state = "conflict"
        try OfflinePOSQueue.attachApproval(mutation, context: container.mainContext)
        let approved = try JSONDecoder().decode(POSSaleRequest.self, from: mutation.body)
        XCTAssertEqual(approved.approvalId, "approval-1")
        XCTAssertEqual(approved.clientSaleId, "offline-pos-1")
        XCTAssertEqual(mutation.state, "queued")
    }

    @MainActor
    func testReplaysPOSSaleWithOriginalIdempotencyKey() async throws {
        let container = try ModelContainer(
            for: PendingMutation.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let request = POSSaleRequest(
            point: "BISHKEK-1",
            lines: [POSLine(productId: "p1", sku: "SKU-1", price: 100, qty: 1)],
            payments: [POSTender(method: "cash", amount: 100)],
            discountPct: 0,
            clientSaleId: "offline-pos-replay-1"
        )
        try OfflinePOSQueue.enqueue(request, context: container.mainContext)
        let mutation = try XCTUnwrap(container.mainContext.fetch(FetchDescriptor<PendingMutation>()).first)
        let session = makeSession(status: 201, body: """
        {"pendingApproval":false,"orderId":"order-1","receiptNo":"POS-000001","total":100,"status":"paid","shiftId":"shift-1","imeis":[]}
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        await OfflinePOSQueue.replay(mutation, api: client, token: "cashier-token", context: container.mainContext)

        XCTAssertTrue(try container.mainContext.fetch(FetchDescriptor<PendingMutation>()).isEmpty)
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Idempotency-Key"), "offline-pos-replay-1")
    }

    func testPOSRefundAndExchangeUseStaffAuthorization() async throws {
        var session = makeSession(status: 201, body: "{\"approvalId\":\"approval-refund-1\"}")
        var client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let approval: POSRefundApproval = try await client.post(
            "payments/payment-1/refund",
            body: POSRefundRequest(amount: 5000, reason: "Возврат товара"),
            token: "cashier-token"
        )
        XCTAssertEqual(approval.approvalId, "approval-refund-1")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer cashier-token")

        session = makeSession(status: 201, body: """
        {"exchangeOrderId":"exchange-1","returnId":"return-1","surcharge":10000,"oldImei":"111111111111111","newImei":"222222222222222"}
        """)
        client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)
        let result: POSExchangeResult = try await client.post(
            "exchanges",
            body: POSExchangeRequest(originalOrderId: "order-1", oldImei: "111111111111111", newProductId: "product-2", method: "card"),
            token: "cashier-token",
            idempotencyKey: "exchange-key-1"
        )
        XCTAssertEqual(result.newImei, "222222222222222")
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Idempotency-Key"), "exchange-key-1")
    }

    func testDecodesPOSReturnWithFractionalServerDate() async throws {
        let session = makeSession(status: 200, body: """
        [{"id":"return-1","orderId":"order-1","reason":"Не подошёл","status":"requested","createdAt":"2026-07-14T05:30:12.345Z"}]
        """)
        let client = APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: session)

        let returns: [POSReturn] = try await client.get("returns", token: "cashier-token")

        XCTAssertEqual(returns.first?.status, "requested")
        XCTAssertNotNil(returns.first?.createdAt)
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

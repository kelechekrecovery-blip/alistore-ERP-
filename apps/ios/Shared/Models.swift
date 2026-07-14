import Foundation

public struct CatalogResponse: Decodable, Sendable {
    public let items: [Product]
    public let total: Int
}

public struct Product: Decodable, Identifiable, Sendable {
    public let id: String
    public let sku: String
    public let name: String
    public let price: Int
    public let category: String
    public let availableUnits: Int
}

public struct StaffSession: Codable, Sendable {
    public let accessToken: String
    public let staffId: String
    public let username: String
    public let role: String
}

public struct StaffLogin: Encodable, Sendable {
    public let username: String
    public let password: String

    public init(username: String, password: String) {
        self.username = username
        self.password = password
    }
}

public struct ShiftPayment: Decodable, Identifiable, Sendable {
    public let id: String
    public let amount: Int
    public let method: String
    public let status: String
}

public struct CashShift: Decodable, Identifiable, Sendable {
    public let id: String
    public let staffId: String
    public let point: String
    public let openCash: Int
    public let closeCash: Int?
    public let diff: Int?
    public let openedAt: Date
    public let closedAt: Date?
    public let payments: [ShiftPayment]?
    public let expected: Int?

    public var expectedCash: Int {
        expected ?? openCash + (payments ?? [])
            .filter { $0.method == "cash" && $0.status == "received" }
            .reduce(0) { $0 + $1.amount }
    }
}

public struct OpenShiftRequest: Encodable, Sendable {
    public let staffId: String
    public let point: String
    public let openCash: Int

    public init(staffId: String, point: String, openCash: Int) {
        self.staffId = staffId
        self.point = point
        self.openCash = openCash
    }
}

public struct CloseShiftRequest: Encodable, Sendable {
    public let closeCash: Int
    public let reason: String?

    public init(closeCash: Int, reason: String?) {
        self.closeCash = closeCash
        self.reason = reason
    }
}

public struct OTPRequest: Encodable, Sendable {
    public let phone: String

    public init(phone: String) { self.phone = phone }
}

public struct OTPVerification: Encodable, Sendable {
    public let phone: String
    public let code: String

    public init(phone: String, code: String) {
        self.phone = phone
        self.code = code
    }
}

public struct OTPChallenge: Decodable, Sendable {
    public let expiresIn: Int
    public let devCode: String?
}

public struct CustomerAuthTokens: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let tokenType: String
    public let expiresIn: String
}

public struct CustomerPrincipal: Decodable, Sendable {
    public let customerId: String
    public let phone: String?
    public let typ: String
}

public struct CustomerSession: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let customerId: String
    public let phone: String
}

public struct RefreshRequest: Encodable, Sendable {
    public let refreshToken: String

    public init(refreshToken: String) { self.refreshToken = refreshToken }
}

public struct CustomerOrderItem: Decodable, Sendable {
    public let sku: String
    public let qty: Int
    public let price: Int
    public let imei: String?
}

public struct CustomerOrder: Decodable, Identifiable, Sendable {
    public let id: String
    public let channel: String
    public let fulfillmentType: String?
    public let pickupPoint: String?
    public let deliveryAddress: String?
    public let deliverySlot: String?
    public let pickupCode: String?
    public let status: String
    public let total: Int
    public let createdAt: Date
    public let items: [CustomerOrderItem]
}

public struct OrderStatusMutation: Decodable, Sendable {
    public let id: String
    public let status: String
}

public struct FulfillOrderResponse: Decodable, Sendable {
    public let order: OrderStatusMutation
    public let assigned: [String]
}

public struct OrderTransitionRequest: Encodable, Sendable {
    public let to: String

    public init(to: String) { self.to = to }
}

public struct EmptyRequest: Encodable, Sendable {
    public init() {}
}

public struct Customer360: Decodable, Sendable {
    public let customer: Customer360Profile
    public let orders: Customer360Orders
    public let debts: Customer360Debts
    public let warranties: Customer360Warranties
    public let tickets: Customer360Tickets
}

public struct Customer360Profile: Decodable, Sendable {
    public let id: String
    public let name: String
    public let phone: String
    public let consent: Bool
    public let segments: [String]
    public let ltv: Int
    public let createdAt: Date
}

public struct Customer360Order: Decodable, Identifiable, Sendable {
    public let id: String
    public let status: String
    public let total: Int
    public let createdAt: Date
}

public struct Customer360Orders: Decodable, Sendable {
    public let total: Int
    public let spent: Int
    public let recent: [Customer360Order]
}

public struct Customer360Debt: Decodable, Identifiable, Sendable {
    public let id: String
    public let balance: Int
    public let status: String
    public let dueDate: Date
}

public struct Customer360Debts: Decodable, Sendable {
    public let count: Int
    public let openBalance: Int
    public let items: [Customer360Debt]
}

public struct Customer360Warranty: Decodable, Identifiable, Sendable {
    public let id: String
    public let imei: String
    public let status: String
    public let sla: Date
}

public struct Customer360Warranties: Decodable, Sendable {
    public let open: Int
    public let items: [Customer360Warranty]
}

public struct Customer360Ticket: Decodable, Identifiable, Sendable {
    public let id: String
    public let subject: String
    public let status: String
    public let priority: String
    public let sla: Date
}

public struct Customer360Tickets: Decodable, Sendable {
    public let open: Int
    public let items: [Customer360Ticket]
}

public struct WarrantyStatusRequest: Encodable, Sendable {
    public let status: String

    public init(status: String) { self.status = status }
}

public struct EvidenceAsset: Decodable, Sendable {
    public let key: String
    public let url: String
    public let width: Int
    public let height: Int
    public let bytes: Int
    public let format: String
}

public struct EvidenceAttachment: Decodable, Sendable {
    public let entityType: String
    public let entityId: String
    public let asset: EvidenceAsset
    public let label: String?
}

public struct CreateOrderItem: Codable, Sendable {
    public let sku: String
    public let qty: Int
    public let price: Int

    public init(sku: String, qty: Int, price: Int) {
        self.sku = sku
        self.qty = qty
        self.price = price
    }
}

public struct CreateOrderRequest: Codable, Sendable {
    public let customerId: String
    public let channel: String
    public let fulfillmentType: String
    public let pickupPoint: String?
    public let deliveryAddress: String?
    public let total: Int
    public let items: [CreateOrderItem]

    public init(
        customerId: String,
        fulfillmentType: String,
        pickupPoint: String?,
        deliveryAddress: String?,
        total: Int,
        items: [CreateOrderItem]
    ) {
        self.customerId = customerId
        self.channel = "mobile"
        self.fulfillmentType = fulfillmentType
        self.pickupPoint = pickupPoint
        self.deliveryAddress = deliveryAddress
        self.total = total
        self.items = items
    }
}

public enum OnlinePaymentMethod: String, CaseIterable, Identifiable, Sendable {
    case card
    case qrMBank = "qr_mbank"
    case qrODengi = "qr_odengi"
    case installment

    public var id: String { rawValue }
}

public struct CreatePaymentIntentRequest: Encodable, Sendable {
    public let orderId: String
    public let method: String
    public let amount: Int
    public let returnUrl: String?

    public init(orderId: String, method: OnlinePaymentMethod, amount: Int, returnUrl: String? = nil) {
        self.orderId = orderId
        self.method = method.rawValue
        self.amount = amount
        self.returnUrl = returnUrl
    }
}

public struct PaymentIntent: Decodable, Sendable {
    public let intentId: String
    public let provider: String
    public let orderId: String
    public let orderStatus: String
    public let method: String
    public let amount: Int
    public let txnId: String
    public let status: String
    public let expiresAt: Date
    public let paymentUrl: String
    public let qrPayload: String?
}

public struct DeviceWarrantySummary: Decodable, Sendable {
    public let id: String
    public let status: String
    public let sla: Date
}

public struct CustomerDevice: Decodable, Identifiable, Sendable {
    public var id: String { imei }
    public let imei: String
    public let product: String
    public let status: String
    public let warrantyUntil: String?
    public let daysLeft: Int?
    public let warranty: DeviceWarrantySummary?
}

public struct OpenWarrantyRequest: Encodable, Sendable {
    public let imei: String
    public let customerId: String
    public let problem: String

    public init(imei: String, customerId: String, problem: String) {
        self.imei = imei
        self.customerId = customerId
        self.problem = problem
    }
}

public struct WarrantyCase: Decodable, Identifiable, Sendable {
    public let id: String
    public let imei: String
    public let customerId: String
    public let problem: String
    public let status: String
    public let sla: Date
}

public struct RegisterPushTokenRequest: Encodable, Sendable {
    public let token: String
    public let platform: String
    public let deviceId: String
    public let scope: String

    public init(token: String, deviceId: String, scope: String = "customer") {
        self.token = token
        self.platform = "ios"
        self.deviceId = deviceId
        self.scope = scope
    }
}

public struct RegisteredPushToken: Decodable, Sendable {
    public let id: String
    public let token: String
    public let platform: String
    public let deviceId: String
    public let scope: String
    public let customerId: String?
    public let staffId: String?
    public let enabled: Bool
    public let lastSeenAt: Date
}

public struct StaffTask: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let description: String?
    public let status: String
    public let priority: String
    public let assigneeId: String
    public let dueAt: Date?
    public let relatedType: String?
    public let relatedId: String?
    public let createdAt: Date
    public let updatedAt: Date
    public let completedAt: Date?
}

public struct UpdateStaffTaskRequest: Encodable, Sendable {
    public let status: String

    public init(status: String) { self.status = status }
}

public struct StaffSupportTicket: Decodable, Identifiable, Sendable {
    public let id: String
    public let customerId: String
    public let channel: String
    public let subject: String
    public let body: String?
    public let priority: String
    public let sla: Date
    public let status: String
    public let assignee: String?
    public let createdAt: Date
}

public struct SupportTransitionRequest: Encodable, Sendable {
    public let to: String
    public let assignee: String?

    public init(to: String, assignee: String? = nil) {
        self.to = to
        self.assignee = assignee
    }
}

public struct EmptyMutationRequest: Encodable, Sendable {
    public init() {}
}

public struct CourierCustomer: Decodable, Sendable {
    public let name: String
    public let phone: String
}

public struct CourierPayment: Decodable, Sendable {
    public let amount: Int
    public let status: String
}

public struct CourierRunSummary: Decodable, Identifiable, Sendable {
    public let id: String
    public let codTotal: Int
    public let collectedTotal: Int
    public let handedOver: Bool
}

public struct CourierDelivery: Decodable, Identifiable, Sendable {
    public let id: String
    public let status: String
    public let total: Int
    public let deliveryAddress: String?
    public let deliverySlot: String?
    public let customer: CourierCustomer
    public let items: [CustomerOrderItem]
    public let payments: [CourierPayment]
    public let courierRun: CourierRunSummary?

    public var outstandingCOD: Int {
        let settled = payments
            .filter { $0.status == "received" || $0.status == "reconciled" }
            .reduce(0) { $0 + max(0, $1.amount) }
        return max(0, total - settled)
    }
}

public struct CompleteCourierDeliveryRequest: Codable, Sendable {
    public let codAmount: Int
    public init(codAmount: Int) { self.codAmount = codAmount }
}

public struct FailCourierDeliveryRequest: Codable, Sendable {
    public let reason: String
    public init(reason: String) { self.reason = reason }
}

public struct CourierCommandResponse: Decodable, Sendable {
    public let id: String?
    public let orderId: String?
    public let status: String
    public let recorded: Bool?
}

public struct CourierHandoverRequest: Encodable, Sendable {
    public let runId: String
    public let amount: Int
    public let reason: String?

    public init(runId: String, amount: Int, reason: String? = nil) {
        self.runId = runId
        self.amount = amount
        self.reason = reason
    }
}

public struct POSLine: Codable, Sendable {
    public let productId: String
    public let sku: String
    public let price: Int
    public let qty: Int
    public let imei: String?

    public init(productId: String, sku: String, price: Int, qty: Int, imei: String? = nil) {
        self.productId = productId
        self.sku = sku
        self.price = price
        self.qty = qty
        self.imei = imei
    }
}

public struct POSTender: Codable, Sendable {
    public let method: String
    public let amount: Int

    public init(method: String, amount: Int) {
        self.method = method
        self.amount = amount
    }
}

public struct POSSaleRequest: Codable, Sendable {
    public let point: String
    public let lines: [POSLine]
    public let payments: [POSTender]
    public let discountPct: Int
    public let clientSaleId: String
    public let approvalId: String?
    public let reason: String?

    public init(
        point: String,
        lines: [POSLine],
        payments: [POSTender],
        discountPct: Int,
        clientSaleId: String,
        approvalId: String? = nil,
        reason: String? = nil
    ) {
        self.point = point
        self.lines = lines
        self.payments = payments
        self.discountPct = discountPct
        self.clientSaleId = clientSaleId
        self.approvalId = approvalId
        self.reason = reason
    }

    public func approved(with approvalId: String) -> POSSaleRequest {
        POSSaleRequest(
            point: point,
            lines: lines,
            payments: payments,
            discountPct: discountPct,
            clientSaleId: clientSaleId,
            approvalId: approvalId,
            reason: reason
        )
    }
}

public enum POSSaleResult: Decodable, Sendable {
    case completed(orderId: String, receiptNo: String, total: Int, status: String, shiftId: String, imeis: [String])
    case approvalRequired(approvalId: String, reason: String)

    private enum CodingKeys: String, CodingKey {
        case pendingApproval, approvalId, reason, orderId, receiptNo, total, status, shiftId, imeis
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        if try values.decodeIfPresent(Bool.self, forKey: .pendingApproval) == true {
            self = .approvalRequired(
                approvalId: try values.decode(String.self, forKey: .approvalId),
                reason: try values.decodeIfPresent(String.self, forKey: .reason) ?? "discount"
            )
            return
        }
        self = .completed(
            orderId: try values.decode(String.self, forKey: .orderId),
            receiptNo: try values.decode(String.self, forKey: .receiptNo),
            total: try values.decode(Int.self, forKey: .total),
            status: try values.decode(String.self, forKey: .status),
            shiftId: try values.decode(String.self, forKey: .shiftId),
            imeis: try values.decodeIfPresent([String].self, forKey: .imeis) ?? []
        )
    }
}

public struct POSUnit: Decodable, Sendable {
    public let imei: String
    public let productId: String
    public let status: String
    public let sku: String
    public let product: String
    public let price: Int
}

public struct POSReceipt: Decodable, Sendable {
    public let markup: String
    public let svg: String
    public let escposBase64: String
}

public struct POSPayment: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderId: String?
    public let amount: Int
    public let method: String
    public let status: String
}

public struct POSReturn: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderId: String
    public let reason: String
    public let status: String
    public let createdAt: Date
}

public struct POSReturnTransitionRequest: Encodable, Sendable {
    public let status: String
    public init(status: String) { self.status = status }
}

public struct POSRefundRequest: Encodable, Sendable {
    public let amount: Int
    public let reason: String

    public init(amount: Int, reason: String) {
        self.amount = amount
        self.reason = reason
    }
}

public struct POSRefundApproval: Decodable, Sendable {
    public let approvalId: String
}

public struct POSExchangeRequest: Encodable, Sendable {
    public let originalOrderId: String
    public let oldImei: String
    public let newProductId: String
    public let method: String

    public init(originalOrderId: String, oldImei: String, newProductId: String, method: String) {
        self.originalOrderId = originalOrderId
        self.oldImei = oldImei
        self.newProductId = newProductId
        self.method = method
    }
}

public struct POSExchangeResult: Decodable, Sendable {
    public let exchangeOrderId: String
    public let returnId: String
    public let surcharge: Int
    public let oldImei: String
    public let newImei: String
}

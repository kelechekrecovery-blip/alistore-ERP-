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

    public init(token: String, deviceId: String) {
        self.token = token
        self.platform = "ios"
        self.deviceId = deviceId
        self.scope = "customer"
    }
}

public struct RegisteredPushToken: Decodable, Sendable {
    public let id: String
    public let token: String
    public let platform: String
    public let deviceId: String
    public let scope: String
    public let customerId: String?
    public let enabled: Bool
    public let lastSeenAt: Date
}

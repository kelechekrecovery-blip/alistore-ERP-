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

    public init(id: String, sku: String, name: String, price: Int, category: String, availableUnits: Int) {
        self.id = id
        self.sku = sku
        self.name = name
        self.price = price
        self.category = category
        self.availableUnits = availableUnits
    }
}

public struct StorePoint: Decodable, Identifiable, Sendable {
    public let id: String
    public let code: String
    public let name: String
    public let address: String
    public let inventoryLocation: String
    public let hours: String
    public let pickupInstructions: String?
    public let sortOrder: Int
}

public struct CheckoutOptions: Decodable, Sendable {
    public let pickupPoints: [StorePoint]
}

public struct StaffSession: Codable, Sendable {
    public let accessToken: String
    public let staffId: String
    public let username: String
    public let role: String
}

public struct StaffPrincipal: Decodable, Sendable {
    public let id: String
    public let username: String
    public let role: String
    public let active: Bool
    public let totpEnabled: Bool
    public let typ: String
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

public struct StaffHrWeek: Decodable, Sendable {
    public let weekStart: Date
    public let weekEnd: Date
    public let point: String?
    public let schedules: [StaffHrSchedule]
}

public struct StaffHrSchedule: Decodable, Identifiable, Sendable {
    public let id: String
    public let staffId: String
    public let point: String
    public let shiftDate: Date
    public let startsAt: Date
    public let endsAt: Date
    public let cancelledAt: Date?
    public let attendance: StaffHrAttendance?
}

public struct StaffHrAttendance: Decodable, Identifiable, Sendable {
    public let id: String
    public let scheduleId: String
    public let staffId: String
    public let point: String
    public let checkedInAt: Date
    public let checkedOutAt: Date?
}

public struct StaffAttendanceRequest: Codable, Sendable {
    public let scheduleId: String

    public init(scheduleId: String) { self.scheduleId = scheduleId }
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

public struct CustomerNotification: Decodable, Identifiable, Sendable {
    public let id: String
    public let template: String
    public let title: String
    public let detail: String
    public let symbol: String
    public let route: String
    public let referenceId: String?
    public let createdAt: Date
    public let readAt: Date?

    public init(id: String, template: String, title: String, detail: String, symbol: String, route: String, referenceId: String?, createdAt: Date, readAt: Date?) {
        self.id = id
        self.template = template
        self.title = title
        self.detail = detail
        self.symbol = symbol
        self.route = route
        self.referenceId = referenceId
        self.createdAt = createdAt
        self.readAt = readAt
    }
}

public struct CustomerSession: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let customerId: String
    public let phone: String
}

public struct CustomerLoyalty: Decodable, Sendable {
    public let balance: Int
    public let conversion: Int
    public let level: String
    public let nextLevelSpend: Int
    public let coupons: [CustomerCoupon]
    public let history: [LoyaltyHistoryEntry]

    public init(balance: Int, conversion: Int, level: String, nextLevelSpend: Int, coupons: [CustomerCoupon], history: [LoyaltyHistoryEntry]) {
        self.balance = balance
        self.conversion = conversion
        self.level = level
        self.nextLevelSpend = nextLevelSpend
        self.coupons = coupons
        self.history = history
    }
}

public struct CustomerCoupon: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let code: String
    public let valueLabel: String
    public let expiresAt: Date?
    public let active: Bool

    public init(id: String, title: String, code: String, valueLabel: String, expiresAt: Date?, active: Bool) {
        self.id = id
        self.title = title
        self.code = code
        self.valueLabel = valueLabel
        self.expiresAt = expiresAt
        self.active = active
    }
}

public struct LoyaltyHistoryEntry: Decodable, Identifiable, Sendable {
    public let id: String
    public let kind: String
    public let label: String
    public let amount: Int
    public let expiresAt: Date?
    public let createdAt: Date

    public init(id: String, kind: String, label: String, amount: Int, expiresAt: Date?, createdAt: Date) {
        self.id = id
        self.kind = kind
        self.label = label
        self.amount = amount
        self.expiresAt = expiresAt
        self.createdAt = createdAt
    }
}

public struct CustomerAddress: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let text: String
    public let comment: String?
    public let isPrimary: Bool
    public let createdAt: Date
    public let updatedAt: Date

    public init(id: String, title: String, text: String, comment: String?, isPrimary: Bool, createdAt: Date, updatedAt: Date) {
        self.id = id
        self.title = title
        self.text = text
        self.comment = comment
        self.isPrimary = isPrimary
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct CreateCustomerAddressRequest: Encodable, Sendable {
    public let title: String
    public let text: String
    public let comment: String?
    public let isPrimary: Bool

    public init(title: String, text: String, comment: String?, isPrimary: Bool) {
        self.title = title
        self.text = text
        self.comment = comment
        self.isPrimary = isPrimary
    }
}

public struct UpdateCustomerAddressRequest: Encodable, Sendable {
    public let title: String
    public let text: String
    public let comment: String?
    public let isPrimary: Bool

    public init(title: String, text: String, comment: String?, isPrimary: Bool) {
        self.title = title
        self.text = text
        self.comment = comment
        self.isPrimary = isPrimary
    }
}

public struct CustomerSettings: Decodable, Sendable {
    public let id: String
    public let phone: String
    public let name: String
    public let consent: Bool
    public let push: Bool
    public let whatsapp: Bool
    public let service: Bool
    public let promos: Bool

    public init(id: String, phone: String, name: String, consent: Bool, push: Bool, whatsapp: Bool, service: Bool, promos: Bool) {
        self.id = id
        self.phone = phone
        self.name = name
        self.consent = consent
        self.push = push
        self.whatsapp = whatsapp
        self.service = service
        self.promos = promos
    }
}

public struct UpdateCustomerSettingsRequest: Encodable, Sendable {
    public let name: String
    public let consent: Bool
    public let push: Bool
    public let whatsapp: Bool
    public let service: Bool
    public let promos: Bool

    public init(name: String, consent: Bool, push: Bool, whatsapp: Bool, service: Bool, promos: Bool) {
        self.name = name
        self.consent = consent
        self.push = push
        self.whatsapp = whatsapp
        self.service = service
        self.promos = promos
    }
}

public struct CustomerReturn: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderId: String
    public let reason: String
    public let status: String
    public let refundId: String?
    public let refundAmount: Int
    public let isFullOrder: Bool
    public let createdAt: Date
    public let items: [CustomerReturnItem]
    public let order: CustomerReturnOrder?

    public init(id: String, orderId: String, reason: String, status: String, refundId: String?, refundAmount: Int, isFullOrder: Bool, createdAt: Date, items: [CustomerReturnItem], order: CustomerReturnOrder?) {
        self.id = id
        self.orderId = orderId
        self.reason = reason
        self.status = status
        self.refundId = refundId
        self.refundAmount = refundAmount
        self.isFullOrder = isFullOrder
        self.createdAt = createdAt
        self.items = items
        self.order = order
    }
}

public struct CustomerReturnItem: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderItemId: String
    public let qty: Int
    public let refundAmount: Int

    public init(id: String, orderItemId: String, qty: Int, refundAmount: Int) {
        self.id = id
        self.orderItemId = orderItemId
        self.qty = qty
        self.refundAmount = refundAmount
    }
}

public struct CustomerReturnOrder: Decodable, Sendable {
    public let id: String
    public let total: Int
    public let createdAt: Date
    public let items: [CustomerReturnOrderItem]

    public init(id: String, total: Int, createdAt: Date, items: [CustomerReturnOrderItem]) {
        self.id = id
        self.total = total
        self.createdAt = createdAt
        self.items = items
    }
}

public struct CustomerReturnOrderItem: Decodable, Identifiable, Sendable {
    public let id: String
    public let sku: String
    public let qty: Int
    public let price: Int

    public init(id: String, sku: String, qty: Int, price: Int) {
        self.id = id
        self.sku = sku
        self.qty = qty
        self.price = price
    }
}

public struct CreateCustomerReturnRequest: Encodable, Sendable {
    public let orderId: String
    public let reason: String

    public init(orderId: String, reason: String) {
        self.orderId = orderId
        self.reason = reason
    }
}

public struct CustomerTradeIn: Decodable, Identifiable, Sendable {
    public let id: String
    public let customerId: String
    public let model: String
    public let imei: String?
    public let grade: String
    public let price: Int
    public let contractId: String?
    public let sellerPassportMasked: String
}

public struct CreateCustomerTradeInRequest: Encodable, Sendable {
    public let model: String
    public let imei: String?
    public let grade: String
    public let price: Int
    public let sellerPassport: String

    public init(model: String, imei: String?, grade: String, price: Int, sellerPassport: String) {
        self.model = model
        self.imei = imei
        self.grade = grade
        self.price = price
        self.sellerPassport = sellerPassport
    }
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

    public init(sku: String, qty: Int, price: Int, imei: String?) {
        self.sku = sku
        self.qty = qty
        self.price = price
        self.imei = imei
    }
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

    public init(id: String, channel: String, fulfillmentType: String?, pickupPoint: String?, deliveryAddress: String?, deliverySlot: String?, pickupCode: String?, status: String, total: Int, createdAt: Date, items: [CustomerOrderItem]) {
        self.id = id
        self.channel = channel
        self.fulfillmentType = fulfillmentType
        self.pickupPoint = pickupPoint
        self.deliveryAddress = deliveryAddress
        self.deliverySlot = deliverySlot
        self.pickupCode = pickupCode
        self.status = status
        self.total = total
        self.createdAt = createdAt
        self.items = items
    }
}

public struct CustomerOrderReceipt: Decodable, Sendable {
    public let markup: String
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
    public let storePointId: String?
    public let deliveryAddress: String?
    public let total: Int
    public let items: [CreateOrderItem]

    public init(
        customerId: String,
        fulfillmentType: String,
        storePointId: String?,
        deliveryAddress: String?,
        total: Int,
        items: [CreateOrderItem]
    ) {
        self.customerId = customerId
        self.channel = "mobile"
        self.fulfillmentType = fulfillmentType
        self.storePointId = storePointId
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

    public init(id: String, status: String, sla: Date) {
        self.id = id
        self.status = status
        self.sla = sla
    }
}

public struct CustomerDevice: Decodable, Identifiable, Sendable {
    public var id: String { imei }
    public let imei: String
    public let product: String
    public let status: String
    public let warrantyUntil: String?
    public let daysLeft: Int?
    public let warranty: DeviceWarrantySummary?

    public init(imei: String, product: String, status: String, warrantyUntil: String?, daysLeft: Int?, warranty: DeviceWarrantySummary?) {
        self.imei = imei
        self.product = product
        self.status = status
        self.warrantyUntil = warrantyUntil
        self.daysLeft = daysLeft
        self.warranty = warranty
    }
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

public struct OpenCustomerSupportTicketRequest: Encodable, Sendable {
    public let channel: String
    public let subject: String
    public let body: String?
    public let priority: String

    public init(subject: String, body: String?, priority: String = "normal") {
        self.channel = "app"
        self.subject = subject
        self.body = body
        self.priority = priority
    }
}

public struct CustomerSupportTicket: Decodable, Identifiable, Sendable {
    public let id: String
    public let channel: String
    public let subject: String
    public let body: String?
    public let priority: String
    public let sla: Date
    public let status: String
    public let createdAt: Date
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
    public let exchangeRequestId: String
    public let approvalId: String
    public let status: String
    public let oldImei: String
    public let newImei: String
    public let surchargeAmount: Int
    public let evidenceRequired: Bool
    public let expiresAt: String
    public let idempotent: Bool
}

package kg.alistore.core

enum class AppRole { CLIENT, STAFF, COURIER, POS }

data class Product(
  val id: String,
  val sku: String,
  val name: String,
  val price: Int,
  val category: String,
  val availableUnits: Int,
)

data class CatalogProductDetail(
  val product: Product,
  val variants: List<Product> = emptyList(),
  val related: List<Product> = emptyList(),
)

data class StorePoint(
  val id: String,
  val code: String,
  val name: String,
  val address: String,
  val inventoryLocation: String,
  val hours: String,
)

data class PendingMutation(
  val id: String,
  val endpoint: String,
  val method: String,
  val body: String,
  val idempotencyKey: String,
  val attempts: Int,
  val state: String,
  val lastError: String?,
  val createdAt: Long,
  val updatedAt: Long,
)

data class AuthTokens(val accessToken: String, val refreshToken: String)

data class AuthUser(val customerId: String, val phone: String?, val type: String)

data class OtpChallenge(val devCode: String?)

data class CreateOrderItem(val sku: String, val qty: Int, val price: Int)

data class CreateOrderRequest(
  val customerId: String,
  val fulfillmentType: String,
  val storePointId: String?,
  val deliveryAddress: String?,
  val total: Int,
  val items: List<CreateOrderItem>,
)

data class CustomerOrder(
  val id: String,
  val status: String,
  val total: Int,
  val fulfillmentType: String,
  val pickupPoint: String?,
  val deliveryAddress: String?,
  val items: List<CustomerOrderItem> = emptyList(),
  val createdAt: String? = null,
  val channel: String = "web",
)

data class CustomerOrderItem(val sku: String, val qty: Int, val price: Int, val imei: String? = null)

data class StaffSession(
  val accessToken: String,
  val staffId: String,
  val username: String,
  val role: String,
  val totpEnabled: Boolean,
)

data class StaffPrincipal(
  val id: String,
  val username: String,
  val role: String,
  val active: Boolean,
  val totpEnabled: Boolean,
  val type: String,
)

data class CourierCustomer(val name: String, val phone: String)

data class CourierRunSummary(
  val id: String,
  val codTotal: Int,
  val collectedTotal: Int,
  val handedOver: Boolean,
)

data class CourierDelivery(
  val id: String,
  val status: String,
  val total: Int,
  val address: String?,
  val slot: String?,
  val customer: CourierCustomer,
  val items: List<CustomerOrderItem>,
  val outstandingCod: Int,
  val run: CourierRunSummary?,
)

data class PosLine(val productId: String, val sku: String, val price: Int, val qty: Int, val imei: String? = null)
data class PosUnit(val imei: String, val productId: String, val status: String, val sku: String, val product: String, val price: Int)
data class PosTender(val method: String, val amount: Int)
data class PosReceipt(val markup: String, val svg: String, val escposBase64: String)
data class PosPayment(val id: String, val orderId: String?, val amount: Int, val method: String, val status: String)
data class PosReturn(val id: String, val orderId: String, val reason: String, val status: String, val createdAt: String)
data class PosExchangeRequest(
  val originalOrderId: String,
  val oldImei: String,
  val newProductId: String,
  val method: String,
)
data class PosExchangeResult(
  val exchangeRequestId: String,
  val approvalId: String,
  val status: String,
  val oldImei: String,
  val newImei: String,
  val surchargeAmount: Int,
  val evidenceRequired: Boolean,
  val expiresAt: String,
  val idempotent: Boolean,
)
data class PosSaleRequest(
  val point: String,
  val lines: List<PosLine>,
  val tenders: List<PosTender>,
  val discountPct: Int,
  val clientSaleId: String,
  val approvalId: String? = null,
  val reason: String? = null,
)

sealed interface PosSaleResult {
  data class Completed(
    val orderId: String,
    val receiptNo: String,
    val total: Int,
    val status: String,
    val shiftId: String,
    val imeis: List<String>,
  ) : PosSaleResult
  data class ApprovalRequired(val approvalId: String, val reason: String) : PosSaleResult
}

data class ShiftPayment(
  val id: String,
  val amount: Int,
  val method: String,
  val status: String,
)

data class CashShift(
  val id: String,
  val staffId: String,
  val point: String,
  val openCash: Int,
  val closeCash: Int?,
  val closeReason: String?,
  val diff: Int?,
  val openedAt: String,
  val closedAt: String?,
  val payments: List<ShiftPayment> = emptyList(),
  val expected: Int? = null,
) {
  val expectedCash: Int
    get() = expected ?: openCash + payments.filter { it.method == "cash" }.sumOf(ShiftPayment::amount)
}

data class OpenShiftRequest(val staffId: String, val point: String, val openCash: Int)

data class CloseShiftRequest(val closeCash: Int, val reason: String? = null)

data class StaffHrWeek(
  val weekStart: String,
  val weekEnd: String,
  val point: String?,
  val schedules: List<StaffHrSchedule>,
)

data class StaffHrSchedule(
  val id: String,
  val staffId: String,
  val point: String,
  val shiftDate: String,
  val startsAt: String,
  val endsAt: String,
  val cancelledAt: String?,
  val attendance: StaffHrAttendance?,
)

data class StaffHrAttendance(
  val id: String,
  val scheduleId: String,
  val staffId: String,
  val point: String,
  val checkedInAt: String,
  val checkedOutAt: String?,
)

enum class OnlinePaymentMethod(val wireValue: String) {
  CARD("card"),
  MBANK("qr_mbank"),
  ODENGI("qr_odengi"),
  INSTALLMENT("installment"),
}

data class CreatePaymentIntentRequest(
  val orderId: String,
  val method: OnlinePaymentMethod,
  val amount: Int,
  val returnUrl: String,
)

data class PaymentIntent(
  val intentId: String,
  val provider: String,
  val orderId: String,
  val orderStatus: String,
  val method: String,
  val amount: Int,
  val txnId: String,
  val status: String,
  val expiresAt: String,
  val paymentUrl: String,
  val qrPayload: String?,
)

data class DeviceWarrantySummary(
  val id: String,
  val status: String,
  val sla: String,
)

data class CustomerDevice(
  val imei: String,
  val product: String,
  val status: String,
  val warrantyUntil: String?,
  val daysLeft: Int?,
  val warranty: DeviceWarrantySummary?,
)

data class OpenWarrantyRequest(
  val imei: String,
  val customerId: String,
  val problem: String,
)

data class WarrantyCase(
  val id: String,
  val imei: String,
  val customerId: String,
  val problem: String,
  val status: String,
  val sla: String,
)

data class SupportTicket(
  val id: String,
  val customerId: String,
  val channel: String,
  val subject: String,
  val body: String?,
  val priority: String,
  val status: String,
  val sla: String,
  val createdAt: String,
)

data class Customer360(
  val customer: Customer360Profile,
  val orders: Customer360Orders,
  val debts: Customer360Debts,
  val warranties: Customer360Warranties,
  val tickets: Customer360Tickets,
)

data class Customer360Profile(
  val id: String,
  val name: String,
  val phone: String,
  val consent: Boolean,
  val segments: List<String>,
  val ltv: Int,
  val createdAt: String,
)

data class Customer360Order(val id: String, val status: String, val total: Int, val createdAt: String)
data class Customer360Orders(val total: Int, val spent: Int, val recent: List<Customer360Order>)
data class Customer360Debt(val id: String, val balance: Int, val status: String, val dueDate: String)
data class Customer360Debts(val count: Int, val openBalance: Int, val items: List<Customer360Debt>)
data class Customer360Warranty(val id: String, val imei: String, val status: String, val sla: String)
data class Customer360Warranties(val open: Int, val items: List<Customer360Warranty>)
data class Customer360Ticket(
  val id: String,
  val subject: String,
  val status: String,
  val priority: String,
  val sla: String,
)
data class Customer360Tickets(val open: Int, val items: List<Customer360Ticket>)

data class StaffTask(
  val id: String,
  val title: String,
  val description: String?,
  val status: String,
  val priority: String,
  val assigneeId: String,
  val dueAt: String?,
  val relatedType: String?,
  val relatedId: String?,
  val createdAt: String,
  val completedAt: String?,
)

data class OpenSupportTicketRequest(
  val channel: String,
  val subject: String,
  val body: String?,
  val priority: String = "normal",
)

data class ReturnOrderSummary(
  val total: Int,
  val createdAt: String,
  val items: List<CustomerOrderItem>,
)

data class CustomerReturn(
  val id: String,
  val orderId: String,
  val reason: String,
  val status: String,
  val createdAt: String,
  val order: ReturnOrderSummary?,
)

data class CreateReturnRequest(val orderId: String, val reason: String)

data class CustomerTradeIn(
  val id: String,
  val customerId: String,
  val model: String,
  val imei: String?,
  val grade: String,
  val price: Int,
  val contractId: String?,
  val sellerPassportMasked: String,
)

data class CreateTradeInRequest(
  val model: String,
  val imei: String?,
  val grade: String,
  val price: Int,
  val sellerPassport: String,
)

data class EvidenceAttachment(val key: String, val url: String)

data class LoyaltyCoupon(
  val id: String,
  val title: String,
  val code: String,
  val valueLabel: String,
  val expiresAt: String?,
)

data class LoyaltyEntry(
  val id: String,
  val label: String,
  val amount: Int,
  val createdAt: String,
)

data class CustomerLoyalty(
  val balance: Int,
  val conversion: Int,
  val level: String,
  val nextLevelSpend: Int,
  val coupons: List<LoyaltyCoupon>,
  val history: List<LoyaltyEntry>,
)

data class CustomerAddress(
  val id: String,
  val title: String,
  val text: String,
  val comment: String?,
  val isPrimary: Boolean,
)

data class CreateCustomerAddressRequest(
  val title: String,
  val text: String,
  val comment: String?,
  val isPrimary: Boolean = false,
)

data class UpdateCustomerAddressRequest(
  val title: String? = null,
  val text: String? = null,
  val comment: String? = null,
  val isPrimary: Boolean? = null,
)

data class CustomerSettings(
  val id: String,
  val phone: String,
  val name: String,
  val consent: Boolean,
  val push: Boolean,
  val whatsapp: Boolean,
  val service: Boolean,
  val promos: Boolean,
)

data class UpdateCustomerSettingsRequest(
  val name: String? = null,
  val consent: Boolean? = null,
  val push: Boolean? = null,
  val whatsapp: Boolean? = null,
  val service: Boolean? = null,
  val promos: Boolean? = null,
)

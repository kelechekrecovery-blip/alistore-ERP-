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
  val pickupPoint: String?,
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
)

data class CustomerOrderItem(val sku: String, val qty: Int, val price: Int)

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

package kg.alistore.core

import java.io.IOException
import org.json.JSONArray
import org.json.JSONObject

interface CheckoutGateway {
  suspend fun createOrder(request: CreateOrderRequest, token: String, idempotencyKey: String): CustomerOrder
}

interface PaymentGateway {
  suspend fun createPaymentIntent(
    request: CreatePaymentIntentRequest,
    token: String,
    idempotencyKey: String,
  ): PaymentIntent
}

interface PurchaseGateway : CheckoutGateway, PaymentGateway

interface MutationQueue {
  fun enqueue(endpoint: String, method: String, body: String, idempotencyKey: String): String
}

sealed interface CheckoutResult {
  data class Created(val order: CustomerOrder, val paymentIntent: PaymentIntent? = null) : CheckoutResult
  data class Queued(val mutationId: String) : CheckoutResult
}

class CheckoutManager(private val api: PurchaseGateway, private val queue: MutationQueue) {
  suspend fun submit(
    request: CreateOrderRequest,
    token: String,
    idempotencyKey: String,
    paymentMethod: OnlinePaymentMethod? = null,
    paymentIdempotencyKey: String? = null,
    returnUrl: String = "alistore://payment-return",
  ): CheckoutResult {
    require(idempotencyKey.isNotBlank()) { "Order idempotency key is required" }
    if (paymentMethod != null) require(!paymentIdempotencyKey.isNullOrBlank()) { "Payment idempotency key is required" }
    val order = try {
      api.createOrder(request, token, idempotencyKey)
    } catch (error: IOException) {
      return CheckoutResult.Queued(queue.enqueue("orders/mine", "POST", request.toJson().toString(), idempotencyKey))
    }
    val intent = paymentMethod?.let {
      val separator = if (returnUrl.contains("?")) "&" else "?"
      api.createPaymentIntent(
        CreatePaymentIntentRequest(
          order.id,
          it,
          order.total,
          "$returnUrl${separator}orderId=${order.id}&method=${it.wireValue}",
        ),
        token,
        paymentIdempotencyKey!!,
      )
    }
    return CheckoutResult.Created(order, intent)
  }
}

fun CreateOrderRequest.toJson(): JSONObject = JSONObject()
  .put("customerId", customerId)
  .put("channel", "mobile")
  .put("fulfillmentType", fulfillmentType)
  .put("storePointId", storePointId ?: JSONObject.NULL)
  .put("deliveryAddress", deliveryAddress ?: JSONObject.NULL)
  .put("total", total)
  .put("items", JSONArray().apply {
    items.forEach { item -> put(JSONObject().put("sku", item.sku).put("qty", item.qty).put("price", item.price)) }
  })
  .apply {
    paymentMode?.let { put("paymentMode", it) }
    deliverySlot?.let { put("deliverySlot", it) }
    deliveryZoneId?.let { put("deliveryZoneId", it) }
    deliverySlotId?.let { put("deliverySlotId", it) }
    promoCode?.let { put("promoCode", it) }
    loyaltyPoints?.let { put("loyaltyPoints", it) }
  }

fun PromotionQuoteRequest.toJson(): JSONObject = JSONObject()
  .put("code", code)
  .put("items", JSONArray().apply {
    items.forEach { item -> put(JSONObject().put("sku", item.sku).put("qty", item.qty)) }
  })

// COD exists only for courier delivery (API cod_courier_required); cash at pickup stays prepaid, like the web checkout.
fun resolvePaymentMode(paymentMethod: String, fulfillmentType: String): String =
  if (paymentMethod == "cash" && fulfillmentType == "courier") "cod" else "prepaid"

// One loyalty point redeems as one som, capped by the discounted subtotal, like the web checkout.
fun loyaltyRedemption(balance: Int, subtotal: Int, promoDiscount: Int): Int =
  minOf(balance.coerceAtLeast(0), (subtotal - promoDiscount).coerceAtLeast(0))

fun checkoutPayableEstimate(subtotal: Int, promoDiscount: Int, loyaltyPoints: Int, deliveryFee: Int): Int =
  (subtotal - promoDiscount - loyaltyPoints).coerceAtLeast(0) + deliveryFee

fun deliverySlotLabel(startsAt: String, endsAt: String): String {
  fun localTime(value: String): String = runCatching {
    java.time.OffsetDateTime.parse(value)
      .atZoneSameInstant(java.time.ZoneId.systemDefault())
      .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
  }.getOrDefault(value)
  return "${localTime(startsAt)}–${localTime(endsAt)}"
}

fun CreatePaymentIntentRequest.toJson(): JSONObject = JSONObject()
  .put("orderId", orderId)
  .put("method", method.wireValue)
  .put("amount", amount)
  .put("returnUrl", returnUrl)

fun OpenWarrantyRequest.toJson(): JSONObject = JSONObject()
  .put("imei", imei)
  .put("customerId", customerId)
  .put("problem", problem)

fun OpenSupportTicketRequest.toJson(): JSONObject = JSONObject()
  .put("channel", channel)
  .put("subject", subject)
  .put("body", body)
  .put("priority", priority)

fun CreateReturnRequest.toJson(): JSONObject = JSONObject()
  .put("orderId", orderId)
  .put("reason", reason)

fun CreateTradeInRequest.toJson(): JSONObject = JSONObject()
  .put("model", model)
  .put("imei", imei ?: JSONObject.NULL)
  .put("grade", grade)
  .put("price", price)
  .put("sellerPassport", sellerPassport)

fun CreateCustomerAddressRequest.toJson(): JSONObject = JSONObject()
  .put("title", title)
  .put("text", text)
  .put("comment", comment ?: JSONObject.NULL)
  .put("isPrimary", isPrimary)

fun UpdateCustomerAddressRequest.toJson(): JSONObject = JSONObject().apply {
  title?.let { put("title", it) }
  text?.let { put("text", it) }
  comment?.let { put("comment", it) }
  isPrimary?.let { put("isPrimary", it) }
}

fun UpdateCustomerSettingsRequest.toJson(): JSONObject = JSONObject().apply {
  name?.let { put("name", it) }
  consent?.let { put("consent", it) }
  push?.let { put("push", it) }
  whatsapp?.let { put("whatsapp", it) }
  service?.let { put("service", it) }
  promos?.let { put("promos", it) }
}

fun OpenShiftRequest.toJson(): JSONObject = JSONObject()
  .put("staffId", staffId)
  .put("point", point)
  .put("openCash", openCash)

fun CloseShiftRequest.toJson(): JSONObject = JSONObject()
  .put("closeCash", closeCash)
  .put("reason", reason?.trim()?.takeIf(String::isNotBlank) ?: JSONObject.NULL)

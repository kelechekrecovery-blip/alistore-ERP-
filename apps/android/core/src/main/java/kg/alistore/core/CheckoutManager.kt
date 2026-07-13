package kg.alistore.core

import java.io.IOException
import org.json.JSONArray
import org.json.JSONObject

interface CheckoutGateway {
  suspend fun createOrder(request: CreateOrderRequest, token: String, idempotencyKey: String): CustomerOrder
}

interface MutationQueue {
  fun enqueue(endpoint: String, method: String, body: String, idempotencyKey: String): String
}

sealed interface CheckoutResult {
  data class Created(val order: CustomerOrder) : CheckoutResult
  data class Queued(val mutationId: String) : CheckoutResult
}

class CheckoutManager(private val api: CheckoutGateway, private val queue: MutationQueue) {
  suspend fun submit(request: CreateOrderRequest, token: String, idempotencyKey: String): CheckoutResult {
    require(idempotencyKey.isNotBlank()) { "Idempotency key is required" }
    return try {
      CheckoutResult.Created(api.createOrder(request, token, idempotencyKey))
    } catch (error: IOException) {
      CheckoutResult.Queued(queue.enqueue("orders/mine", "POST", request.toJson().toString(), idempotencyKey))
    }
  }
}

fun CreateOrderRequest.toJson(): JSONObject = JSONObject()
  .put("customerId", customerId)
  .put("channel", "mobile")
  .put("fulfillmentType", fulfillmentType)
  .put("pickupPoint", pickupPoint ?: JSONObject.NULL)
  .put("deliveryAddress", deliveryAddress ?: JSONObject.NULL)
  .put("total", total)
  .put("items", JSONArray().apply {
    items.forEach { item -> put(JSONObject().put("sku", item.sku).put("qty", item.qty).put("price", item.price)) }
  })

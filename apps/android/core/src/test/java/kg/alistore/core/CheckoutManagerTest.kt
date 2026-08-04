package kg.alistore.core

import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckoutManagerTest {
  private val request = CreateOrderRequest(
    customerId = "customer-1",
    fulfillmentType = "courier",
    storePointId = "alistore-bishkek-1",
    deliveryAddress = "Бишкек, Киевская 95",
    total = 250000,
    items = listOf(CreateOrderItem("PHONE-1", 2, 125000)),
  )

  @Test
  fun returnsCreatedOrderWithoutQueueing() = runTest {
    val queue = FakeMutationQueue()
    val result = CheckoutManager(FakeCheckoutGateway(), queue).submit(request, "access", "order-key-1")

    assertTrue(result is CheckoutResult.Created)
    assertTrue(queue.records.isEmpty())
  }

  @Test
  fun createsPaymentIntentWithStableKeyAfterOrder() = runTest {
    val gateway = FakeCheckoutGateway()
    val result = CheckoutManager(gateway, FakeMutationQueue()).submit(
      request,
      "access",
      "order-key-2",
      OnlinePaymentMethod.MBANK,
      "payment-key-2",
    ) as CheckoutResult.Created

    assertEquals("intent-1", result.paymentIntent?.intentId)
    assertEquals("payment-key-2", gateway.paymentKey)
    assertEquals("alistore://payment-return?orderId=order-1&method=qr_mbank", gateway.paymentRequest?.returnUrl)
  }

  @Test
  fun paymentNetworkFailureDoesNotQueueAnAlreadyCreatedOrder() = runTest {
    val queue = FakeMutationQueue()
    val gateway = FakeCheckoutGateway(paymentFailure = IOException("provider offline"))

    assertThrows(IOException::class.java) {
      kotlinx.coroutines.runBlocking {
        CheckoutManager(gateway, queue).submit(request, "access", "order-key-3", OnlinePaymentMethod.CARD, "payment-key-3")
      }
    }
    assertTrue(queue.records.isEmpty())
  }

  @Test
  fun networkFailureQueuesExactRequestAndStableKey() = runTest {
    val queue = FakeMutationQueue()
    val gateway = FakeCheckoutGateway(IOException("offline"))

    val result = CheckoutManager(gateway, queue).submit(request, "access", "offline-key-1")

    assertEquals(CheckoutResult.Queued("mutation-1"), result)
    assertEquals(1, queue.records.size)
    val record = queue.records.single()
    assertEquals("orders/mine", record.endpoint)
    assertEquals("offline-key-1", record.key)
    assertEquals(2, org.json.JSONObject(record.body).getJSONArray("items").getJSONObject(0).getInt("qty"))
    assertEquals("courier", org.json.JSONObject(record.body).getString("fulfillmentType"))
  }

  @Test
  fun serverConflictIsVisibleAndNeverQueued() = runTest {
    val queue = FakeMutationQueue()
    val manager = CheckoutManager(FakeCheckoutGateway(ApiException(409, "insufficient_stock")), queue)

    assertThrows(ApiException::class.java) {
      kotlinx.coroutines.runBlocking { manager.submit(request, "access", "conflict-key-1") }
    }
    assertTrue(queue.records.isEmpty())
  }

  @Test
  fun rejectsBlankIdempotencyKey() = runTest {
    assertThrows(IllegalArgumentException::class.java) {
      kotlinx.coroutines.runBlocking { CheckoutManager(FakeCheckoutGateway(), FakeMutationQueue()).submit(request, "access", "") }
    }
  }

  @Test
  fun resolvesRelativeAndAbsolutePaymentUrls() {
    assertEquals(
      "https://api.ali.kg/sandbox/payments/card/intent-1",
      resolvePaymentUrl("https://api.ali.kg/api", "/sandbox/payments/card/intent-1"),
    )
    assertEquals(
      "https://bank.example/pay/1",
      resolvePaymentUrl("https://api.ali.kg/api", "https://bank.example/pay/1"),
    )
  }
}

private class FakeCheckoutGateway(
  private val failure: Throwable? = null,
  private val paymentFailure: Throwable? = null,
) : PurchaseGateway {
  var paymentKey: String? = null
  var paymentRequest: CreatePaymentIntentRequest? = null

  override suspend fun createOrder(request: CreateOrderRequest, token: String, idempotencyKey: String): CustomerOrder {
    failure?.let { throw it }
    return CustomerOrder("order-1", "created", 250000, "courier", null, request.deliveryAddress)
  }

  override suspend fun createPaymentIntent(
    request: CreatePaymentIntentRequest,
    token: String,
    idempotencyKey: String,
  ): PaymentIntent {
    paymentFailure?.let { throw it }
    paymentRequest = request
    paymentKey = idempotencyKey
    return PaymentIntent(
      "intent-1", "mbank", request.orderId, "awaiting_payment", request.method.wireValue,
      request.amount, "txn-1", "requires_action", "2026-07-13T02:00:00Z",
      "/sandbox/payments/mbank/intent-1", "alistore-mbank://pay",
    )
  }
}

private data class MutationRecord(val endpoint: String, val method: String, val body: String, val key: String)

private class FakeMutationQueue : MutationQueue {
  val records = mutableListOf<MutationRecord>()
  override fun enqueue(endpoint: String, method: String, body: String, idempotencyKey: String): String {
    records += MutationRecord(endpoint, method, body, idempotencyKey)
    return "mutation-1"
  }
}

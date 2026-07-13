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
    pickupPoint = null,
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
}

private class FakeCheckoutGateway(private val failure: Throwable? = null) : CheckoutGateway {
  override suspend fun createOrder(request: CreateOrderRequest, token: String, idempotencyKey: String): CustomerOrder {
    failure?.let { throw it }
    return CustomerOrder("order-1", "created", 250000, "courier", null, request.deliveryAddress)
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

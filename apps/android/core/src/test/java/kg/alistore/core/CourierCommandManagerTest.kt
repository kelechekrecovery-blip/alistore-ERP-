package kg.alistore.core

import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject

class CourierCommandManagerTest {
  @Test
  fun `network failure queues the exact command and idempotency key`() = runTest {
    val queue = RecordingQueue()
    val manager = CourierCommandManager(FakeCourierGateway(IOException("offline")), queue)

    val result = manager.deliver("order-1", 2500, null, "staff-token", "delivery-key")

    assertTrue(result is CourierCommandResult.Queued)
    assertEquals("courier/orders/order-1/deliver", queue.endpoint)
    assertEquals("delivery-key", queue.key)
    assertEquals("{\"codAmount\":2500}", queue.body)
  }

  @Test
  fun `partial COD queues the reason with the command`() = runTest {
    val queue = RecordingQueue()
    val manager = CourierCommandManager(FakeCourierGateway(IOException("offline")), queue)

    manager.deliver("order-1", 500, "customer paid the remainder later", "staff-token", "partial-key")

    val body = JSONObject(requireNotNull(queue.body))
    assertEquals(500, body.getInt("codAmount"))
    assertEquals("customer paid the remainder later", body.getString("reason"))
    assertEquals("partial-key", queue.key)
  }

  @Test
  fun `domain conflict is returned without enqueuing`() = runTest {
    val queue = RecordingQueue()
    val manager = CourierCommandManager(FakeCourierGateway(ApiException(409, "conflict")), queue)

    val error = runCatching { manager.start("order-1", "staff-token", "start-key") }.exceptionOrNull()

    assertTrue(error is ApiException)
    assertEquals(null, queue.endpoint)
  }
}

private class RecordingQueue : MutationQueue {
  var endpoint: String? = null
  var body: String? = null
  var key: String? = null

  override fun enqueue(endpoint: String, method: String, body: String, idempotencyKey: String): String {
    this.endpoint = endpoint
    this.body = body
    this.key = idempotencyKey
    return "queued-1"
  }
}

private class FakeCourierGateway(private val failure: Exception) : CourierGateway {
  override suspend fun courierDeliveries(token: String) = emptyList<CourierDelivery>()
  override suspend fun startDelivery(orderId: String, token: String, idempotencyKey: String): CourierDelivery = throw failure
  override suspend fun completeDelivery(orderId: String, codAmount: Int, reason: String?, token: String, idempotencyKey: String): CourierDelivery = throw failure
  override suspend fun failDelivery(orderId: String, reason: String, token: String, idempotencyKey: String) = throw failure
  override suspend fun handoverCourierRun(runId: String, amount: Int, reason: String?, token: String, idempotencyKey: String): CourierRunSummary = throw failure
}

package kg.alistore.core

import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject

class CourierHandoverTest {
  private val run = CourierRunSummary(id = "run-1", codTotal = 5000, collectedTotal = 5000, handedOver = false)

  @Test
  fun `network failure queues handover with amount reason and idempotency key`() = runTest {
    val queue = RecordingHandoverQueue()
    val manager = CourierCommandManager(FailingHandoverGateway(IOException("offline")), queue)

    val result = manager.handover("run-1", 4500, "клиент доплатил картой на месте", "staff-token", "courier-handover-run-1")

    assertTrue(result is CourierCommandResult.Queued)
    assertEquals("courier/handover", queue.endpoint)
    assertEquals("courier-handover-run-1", queue.key)
    val body = JSONObject(requireNotNull(queue.body))
    assertEquals("run-1", body.getString("runId"))
    assertEquals(4500, body.getInt("amount"))
    assertEquals("клиент доплатил картой на месте", body.getString("reason"))
  }

  @Test
  fun `full handover omits the reason from the queued payload`() = runTest {
    val queue = RecordingHandoverQueue()
    val manager = CourierCommandManager(FailingHandoverGateway(IOException("offline")), queue)

    manager.handover("run-1", 5000, null, "staff-token", "courier-handover-run-1")

    assertFalse(JSONObject(requireNotNull(queue.body)).has("reason"))
  }

  @Test
  fun `domain conflict is returned without enqueuing`() = runTest {
    val queue = RecordingHandoverQueue()
    val manager = CourierCommandManager(FailingHandoverGateway(ApiException(409, "cod_already_handed_over")), queue)

    val error = runCatching { manager.handover("run-1", 5000, null, "staff-token", "courier-handover-run-1") }.exceptionOrNull()

    assertTrue(error is ApiException)
    assertEquals(null, queue.endpoint)
  }

  @Test
  fun `reason is required when the handed amount differs from collected`() {
    assertTrue(handoverReasonRequired(run, 4500))
    assertTrue(handoverReasonRequired(run, 5500))
  }

  @Test
  fun `reason is required when collection is incomplete even if amount matches collected`() {
    val partial = run.copy(collectedTotal = 4000)

    assertTrue(handoverReasonRequired(partial, 4000))
  }

  @Test
  fun `reason is not required when amount matches a fully collected run`() {
    assertFalse(handoverReasonRequired(run, 5000))
  }
}

private class RecordingHandoverQueue : MutationQueue {
  var endpoint: String? = null
  var body: String? = null
  var key: String? = null

  override fun enqueue(endpoint: String, method: String, body: String, idempotencyKey: String): String {
    this.endpoint = endpoint
    this.body = body
    this.key = idempotencyKey
    return "queued-handover"
  }
}

private class FailingHandoverGateway(private val failure: Exception) : CourierGateway {
  override suspend fun courierDeliveries(token: String) = emptyList<CourierDelivery>()
  override suspend fun startDelivery(orderId: String, token: String, idempotencyKey: String): CourierDelivery = throw failure
  override suspend fun completeDelivery(orderId: String, codAmount: Int, reason: String?, token: String, idempotencyKey: String): CourierDelivery = throw failure
  override suspend fun failDelivery(orderId: String, reason: String, token: String, idempotencyKey: String) = throw failure
  override suspend fun handoverCourierRun(runId: String, amount: Int, reason: String?, token: String, idempotencyKey: String): CourierRunSummary = throw failure
}

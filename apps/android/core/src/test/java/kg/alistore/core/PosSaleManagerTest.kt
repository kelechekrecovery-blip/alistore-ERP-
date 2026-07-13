package kg.alistore.core

import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PosSaleManagerTest {
  private val request = PosSaleRequest(
    point = "BISHKEK-1",
    lines = listOf(PosLine("product-1", "SKU-1", 1000, 1)),
    tenders = listOf(PosTender("cash", 1000)),
    discountPct = 0,
    clientSaleId = "sale-stable-1",
  )

  @Test
  fun `network failure queues exact sale with stable client id`() = runTest {
    val queue = PosRecordingQueue()
    val result = PosSaleManager(FailingPosGateway(IOException("offline")), queue).submit(request, "staff-token")

    assertTrue(result is PosSubmitResult.Queued)
    assertEquals("pos/sale", queue.endpoint)
    assertEquals("sale-stable-1", queue.key)
    assertTrue(queue.body!!.contains("\"clientSaleId\":\"sale-stable-1\""))
    assertTrue(!queue.body!!.contains("staffId"))
  }

  @Test
  fun `approval response stays online and is not queued`() = runTest {
    val queue = PosRecordingQueue()
    val gateway = object : PosGateway {
      override suspend fun posSale(request: PosSaleRequest, token: String) =
        PosSaleResult.ApprovalRequired("approval-1", "discount")
    }

    val result = PosSaleManager(gateway, queue).submit(request, "staff-token")

    assertTrue((result as PosSubmitResult.Online).result is PosSaleResult.ApprovalRequired)
    assertEquals(null, queue.endpoint)
  }

  @Test
  fun `offline replay keeps a 202 approval instead of deleting the sale`() {
    val decision = posReplayDecision(RawApiResponse(202, "{\"approvalId\":\"approval-12345678\"}"))

    assertTrue(decision is PosReplayDecision.Conflict)
    assertTrue((decision as PosReplayDecision.Conflict).message.contains("12345678"))
  }
}

private class PosRecordingQueue : MutationQueue {
  var endpoint: String? = null
  var body: String? = null
  var key: String? = null
  override fun enqueue(endpoint: String, method: String, body: String, idempotencyKey: String): String {
    this.endpoint = endpoint; this.body = body; this.key = idempotencyKey
    return "queued-pos"
  }
}

private class FailingPosGateway(private val error: Exception) : PosGateway {
  override suspend fun posSale(request: PosSaleRequest, token: String): PosSaleResult = throw error
}

package kg.alistore.core

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StableCommandIntentStoreTest {
  @Test
  fun `retry and recreated store reuse the open payment intent`() = runTest {
    val persistence = MapIntentPersistence()
    val firstStore = store(persistence)
    val first = firstStore.posReceivable("receivable-1", "cash", 1_000, null, null)

    val retry = firstStore.posReceivable("receivable-1", "cash", 1_000, null, null)
    val afterRestart = store(persistence).posReceivable("receivable-1", "cash", 1_000, null, null)

    assertEquals(first.idempotencyKey, retry.idempotencyKey)
    assertEquals(first.idempotencyKey, afterRestart.idempotencyKey)
  }

  @Test
  fun `two identical payments after success receive different keys`() = runTest {
    val persistence = MapIntentPersistence()
    val store = store(persistence)
    val first = store.posReceivable("receivable-1", "cash", 1_000, null, null)

    store.close(first)
    val second = store.posReceivable("receivable-1", "cash", 1_000, null, null)

    assertNotEquals(first.idempotencyKey, second.idempotencyKey)
  }

  @Test
  fun `two same-reason delivery failures after success receive different keys`() = runTest {
    val store = store()
    val first = store.courierFail("order-1", "клиент недоступен")

    store.close(first)
    val second = store.courierFail("order-1", "клиент недоступен")

    assertNotEquals(first.idempotencyKey, second.idempotencyKey)
  }

  @Test
  fun `payload correction rotates the current open intent`() = runTest {
    val store = store()
    val original = store.courierDeliver("order-1", 2_500, null)

    val corrected = store.courierDeliver("order-1", 2_400, "недостача")

    assertNotEquals(original.idempotencyKey, corrected.idempotencyKey)
  }

  @Test
  fun `courier evidence key is preserved by the command intent`() = runTest {
    val store = store()
    val evidenceKey = "evidence-key-1"

    val intent = store.courierDeliver("order-1", 2_500, null, evidenceKey)
    val retry = store.courierDeliver("order-1", 2_500, null, evidenceKey)

    assertEquals(evidenceKey, intent.idempotencyKey)
    assertEquals(evidenceKey, retry.idempotencyKey)
  }

  @Test
  fun `stale success cannot close a rotated intent`() = runTest {
    val store = store()
    val original = store.courierHandover("run-1", 5_000, null)
    val corrected = store.courierHandover("run-1", 4_500, "корректировка")

    store.close(original)

    assertEquals(
      corrected.idempotencyKey,
      store.courierHandover("run-1", 4_500, "корректировка").idempotencyKey,
    )
  }

  @Test
  fun `rotating TOTP does not rotate the same owner decision or enter persisted material`() = runTest {
    val persistence = MapIntentPersistence()
    val store = store(persistence)
    val firstTotp = "123456"
    val rotatedTotp = "654321"

    val first = ownerDecision(store)
    val retryWithRotatedTotp = ownerDecision(store)

    assertNotEquals(firstTotp, rotatedTotp)
    assertEquals(first.idempotencyKey, retryWithRotatedTotp.idempotencyKey)
    assertFalse(persistence.values().any { firstTotp in it || rotatedTotp in it })
    assertFalse(first.idempotencyKey.contains(firstTotp))
    assertFalse(first.idempotencyKey.contains(rotatedTotp))
  }

  @Test
  fun `server-equivalent canonical payloads reuse an open intent`() = runTest {
    val store = store()
    val first = store.quarantineProposal(
      "item-1",
      "  повреждение  ",
      linkedMapOf("photo" to "a", "document" to "b"),
      listOf("  imei-b ", "IMEI-A", "imei-a"),
    )
    val equivalent = store.quarantineProposal(
      "item-1",
      "повреждение",
      linkedMapOf("document" to "b", "photo" to "a"),
      listOf("IMEI-A", "IMEI-B"),
    )
    val nullRefund = store.ownerCancellation(
      "order-1", "cancel-1", "reject", null, null, null, " причина ", listOf("b", "a"),
    )
    val zeroRefund = store.ownerCancellation(
      "order-1", "cancel-1", "reject", 0, 0, " ", "причина", listOf("a", "b"),
    )
    val nullExpense = store.ownerCancellation(
      "order-2", "cancel-2", "reject", null, null, null, "причина", emptyList(),
    )
    val zeroExpense = store.ownerCancellation(
      "order-2", "cancel-2", "reject", null, 0, null, "причина", emptyList(),
    )
    val blankReason = store.courierDeliver("order-2", 0, " ")
    val nullReason = store.courierDeliver("order-2", 0, null)

    assertEquals(first.idempotencyKey, equivalent.idempotencyKey)
    assertNotEquals(nullRefund.idempotencyKey, zeroRefund.idempotencyKey)
    assertEquals(nullExpense.idempotencyKey, zeroExpense.idempotencyKey)
    assertEquals(blankReason.idempotencyKey, nullReason.idempotencyKey)
  }

  @Test
  fun `queued courier success closes exact intent before later identical failure`() = runTest {
    val persistence = MapIntentPersistence()
    val store = store(persistence)
    val queued = store.courierFail("order-1", "клиент недоступен")
    var queueRemoved = false

    val removed = finalizeCourierQueuedSuccess(store, queued.idempotencyKey) {
      assertFalse(persistence.values().any { queued.idempotencyKey in it })
      queueRemoved = true
      1
    }
    val laterFailure = store.courierFail("order-1", "клиент недоступен")

    assertEquals(1, removed)
    assertTrue(queueRemoved)
    assertNotEquals(queued.idempotencyKey, laterFailure.idempotencyKey)
    assertFalse(store.closeByIdempotencyKey(queued.idempotencyKey))
    assertEquals(laterFailure.idempotencyKey, store.courierFail("order-1", "клиент недоступен").idempotencyKey)
  }

  @Test
  fun `account switch cannot reuse or close another actors intent`() = runTest {
    val persistence = MapIntentPersistence()
    val firstActor = store(persistence, QueueOwner.staff("staff-1"))
    val secondActor = store(persistence, QueueOwner.staff("staff-2"))
    val first = firstActor.courierFail("order-1", "нет ответа")
    val second = secondActor.courierFail("order-1", "нет ответа")

    assertNotEquals(first.idempotencyKey, second.idempotencyKey)
    assertFalse(secondActor.closeByIdempotencyKey(first.idempotencyKey))
    assertEquals(first.idempotencyKey, firstActor.courierFail("order-1", "нет ответа").idempotencyKey)
  }

  private suspend fun ownerDecision(store: StableCommandIntentStore) = store.ownerCancellation(
    orderId = "order-1",
    cancellationId = "cancel-1",
    action = "approve_full",
    refundAmount = 5_000,
    supplierExpenseAmount = 0,
    faultParty = "customer",
    reason = "товар не приехал",
    evidenceIds = listOf("evidence-1"),
  )

  private fun store(
    persistence: MapIntentPersistence = MapIntentPersistence(),
    owner: QueueOwner = QueueOwner.staff("staff-1"),
  ): StableCommandIntentStore {
    return StableCommandIntentStore(owner, persistence) {
      persistence.sequence += 1
      "command-${persistence.sequence}"
    }
  }
}

private class MapIntentPersistence : CommandIntentPersistence {
  private val records = mutableMapOf<String, String>()
  var sequence = 0

  override suspend fun read(scope: String): String? = records[scope]

  override suspend fun write(scope: String, value: String) {
    records[scope] = value
  }

  override suspend fun remove(scope: String) {
    records.remove(scope)
  }

  override suspend fun entries(): Map<String, String> = records.toMap()

  fun values(): Collection<String> = records.values
}

package kg.alistore.core

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineQueueOwnershipTest {
  private val context = ApplicationProvider.getApplicationContext<Context>()
  private val databaseNames = mutableListOf<String>()

  @After
  fun cleanUp() {
    databaseNames.forEach(context::deleteDatabase)
  }

  @Test
  fun clientStaffPosAndCourierQueuesDoNotCrossAccountBoundariesAfterReopen() {
    listOf("client", "staff", "pos", "courier").forEach(::assertAccountIsolation)
  }

  @Test
  fun newRowsKeepStableKeyOwnerAndPayloadFingerprint() {
    val databaseName = databaseName("fingerprint")
    val owner = QueueOwner("client", "customer-a")
    val queue = OfflineQueueDb(context, databaseName, owner)
    val id = queue.enqueue("orders/mine", "POST", """{"total":100}""", "stable-key")

    val row = queue.pending().single()

    assertEquals(id, row.id)
    assertEquals("stable-key", row.idempotencyKey)
    assertEquals(owner.storageKey, row.ownerId)
    assertEquals(payloadFingerprint("POST", "orders/mine", """{"total":100}""", "stable-key"), row.payloadFingerprint)
  }

  @Test
  fun approvalContinuationPreservesOriginalAuditRowAndUsesADistinctLinkedKey() {
    val databaseName = databaseName("continuation")
    val owner = QueueOwner("pos", "staff-a")
    val queue = OfflineQueueDb(context, databaseName, owner)
    val originalBody = """{"clientSaleId":"stable-sale"}"""
    val originalId = queue.enqueue("pos/sale", "POST", originalBody, "stable-sale")
    queue.markState(originalId, "conflict", "approval_required:approval-1")
    val continuationBody = """{"clientSaleId":"stable-sale","approvalId":"approval-1"}"""
    val continuationKey = posApprovalContinuationKey("stable-sale", "approval-1")

    val continuationId = queue.enqueueContinuation(originalId, continuationBody, continuationKey)

    val rows = queue.pending(includeConflicts = true)
    val original = rows.first { it.id == originalId }
    val continuation = rows.first { it.id == continuationId }
    assertEquals(originalBody, original.body)
    assertEquals("stable-sale", original.idempotencyKey)
    assertEquals(
      payloadFingerprint("POST", "pos/sale", originalBody, "stable-sale"),
      original.payloadFingerprint,
    )
    assertEquals("conflict", original.state)
    assertEquals(originalId, continuation.parentMutationId)
    assertNotEquals(original.idempotencyKey, continuation.idempotencyKey)
    assertEquals(continuationKey, continuation.idempotencyKey)
    assertEquals(continuationBody, continuation.body)
    assertEquals(
      payloadFingerprint("POST", "pos/sale", continuationBody, continuationKey),
      continuation.payloadFingerprint,
    )
    assertEquals(listOf(continuationId), queue.pending().map(PendingMutation::id))
    val claimed = requireNotNull(queue.claimNext())
    assertEquals(continuationId, claimed.id)
    assertEquals(1, queue.markContinuationSent(claimed))
    val auditedOriginal = queue.pending(includeConflicts = true).single()
    assertEquals(originalId, auditedOriginal.id)
    assertEquals(originalBody, auditedOriginal.body)
    assertEquals("stable-sale", auditedOriginal.idempotencyKey)
    assertEquals("continued", auditedOriginal.state)
  }

  @Test
  fun approvalContinuationCannotCollideWithOrReplayAsOriginal() {
    val databaseName = databaseName("continuation-collision")
    val queue = OfflineQueueDb(context, databaseName, QueueOwner("pos", "staff-a"))
    val originalId = queue.enqueue("pos/sale", "POST", """{"clientSaleId":"sale-1"}""", "sale-1")
    queue.markState(originalId, "conflict", "approval_required:approval-1")
    val key = posApprovalContinuationKey("sale-1", "approval-1")
    val continuationId = queue.enqueueContinuation(
      originalId,
      """{"clientSaleId":"sale-1","approvalId":"approval-1"}""",
      key,
    )

    assertEquals(
      continuationId,
      queue.enqueueContinuation(
        originalId,
        """{"clientSaleId":"sale-1","approvalId":"approval-1"}""",
        key,
      ),
    )
    assertTrue(runCatching {
      queue.enqueueContinuation(
        originalId,
        """{"clientSaleId":"different-sale","approvalId":"approval-1"}""",
        key,
      )
    }.isFailure)
    assertEquals(continuationId, queue.claimNext()?.id)
  }

  @Test
  fun approvalContinuationCannotCreateAContinuationChain() {
    val databaseName = databaseName("continuation-chain")
    val queue = OfflineQueueDb(context, databaseName, QueueOwner("pos", "staff-a"))
    val originalId = queue.enqueue("pos/sale", "POST", """{"clientSaleId":"sale-1"}""", "sale-1")
    queue.markState(originalId, "conflict", "approval_required:approval-1")
    val continuationId = queue.enqueueContinuation(
      originalId,
      """{"clientSaleId":"sale-1","approvalId":"approval-1"}""",
      posApprovalContinuationKey("sale-1", "approval-1"),
    )
    queue.markState(continuationId, "conflict", "approval_required:approval-2")

    assertTrue(runCatching {
      queue.enqueueContinuation(
        continuationId,
        """{"clientSaleId":"sale-1","approvalId":"approval-2"}""",
        posApprovalContinuationKey("sale-1", "approval-2"),
      )
    }.isFailure)
  }

  @Test
  fun idempotencyKeyIsFingerprintBoundAndImmutableEvenThroughDirectSql() {
    val databaseName = databaseName("immutable-key")
    val queue = OfflineQueueDb(context, databaseName, QueueOwner("client", "customer-a"))
    val id = queue.enqueue("orders/mine", "POST", "{}", "original-key")

    val failure = runCatching {
      queue.writableDatabase.execSQL(
        "UPDATE pending_mutation SET idempotency_key = ? WHERE id = ?",
        arrayOf("mutated-key", id),
      )
    }.exceptionOrNull()

    assertTrue(failure != null)
    assertEquals("original-key", queue.pending().single().idempotencyKey)
  }

  @Test
  fun claimsOnlyQueuedRowsAndExplicitlyRecoversStaleClaims() {
    val databaseName = databaseName("claim-state")
    val queue = OfflineQueueDb(context, databaseName, QueueOwner("staff", "staff-a"))
    val terminalId = queue.enqueue("command/terminal", "POST", "{}", "terminal-key")
    queue.markState(terminalId, "failed", "HTTP 403")
    val retryId = queue.enqueue("command/retry", "POST", "{}", "retry-key")

    val first = requireNotNull(queue.claimNext())
    assertEquals(retryId, first.id)
    assertEquals("syncing", first.state)
    assertEquals(1, first.attempts)
    assertEquals(null, queue.claimNext())
    assertEquals(0, queue.recoverStaleSyncing(first.updatedAt - 1))
    assertEquals(1, queue.recoverStaleSyncing(first.updatedAt + 1))
    val second = requireNotNull(queue.claimNext())
    assertEquals(retryId, second.id)
    assertEquals(0, queue.markClaimState(first, "failed", "stale worker"))
    assertEquals(1, queue.markClaimState(second, "queued", "retry"))
    assertEquals("failed", queue.pending(includeConflicts = true).first { it.id == terminalId }.state)
  }

  @Test
  fun concurrentClaimReturnsEachQueuedRowAtMostOnce() {
    val databaseName = databaseName("concurrent-claim")
    val owner = QueueOwner("courier", "staff-a")
    OfflineQueueDb(context, databaseName, owner).use {
      it.enqueue("courier/command", "POST", "{}", "claim-key")
    }
    val start = CountDownLatch(1)
    val executor = Executors.newFixedThreadPool(2)
    try {
      val claims = List(2) {
        executor.submit<PendingMutation?> {
          OfflineQueueDb(context, databaseName, owner).use { queue ->
            start.await()
            queue.claimNext()
          }
        }
      }
      start.countDown()
      assertEquals(1, claims.map { it.get() }.count { it != null })
    } finally {
      executor.shutdownNow()
    }
  }

  @Test
  fun fingerprintMismatchIsClaimedOnceThenCanBeQuarantined() {
    val databaseName = databaseName("fingerprint-mismatch")
    val queue = OfflineQueueDb(context, databaseName, QueueOwner("pos", "staff-a"))
    val id = queue.enqueue("pos/sale", "POST", """{"total":1}""", "sale-key")
    queue.writableDatabase.execSQL(
      "UPDATE pending_mutation SET body = ? WHERE id = ?",
      arrayOf("""{"total":2}""", id),
    )

    val claimed = requireNotNull(queue.claimNext())
    assertTrue(!claimed.hasValidPayloadFingerprint())
    queue.markState(claimed.id, "quarantined", "fingerprint mismatch")
    assertEquals(null, queue.claimNext())
  }

  @Test
  fun authenticatedSessionSnapshotRejectsGenerationAndTokenOwnerMismatch() {
    val store = SecureTokenStore(context, "offline-session-test-${UUID.randomUUID()}")
    store.clear()
    try {
      store.saveAuthenticatedSession(
        AuthTokens("token-a", "refresh-a"),
        QueueOwner.client("customer-a").storageKey,
      )
      val sessionA = requireNotNull(store.readSessionSnapshot("client"))

      store.saveAuthenticatedSession(
        AuthTokens("token-b", "refresh-b"),
        QueueOwner.client("customer-b").storageKey,
      )

      assertFalse(store.isCurrent(sessionA))
      assertEquals("customer-b", store.readSessionSnapshot("client")?.queueOwner?.principalId)

      context.getSharedPreferences("secure-session", Context.MODE_PRIVATE)
        .edit()
        .putString("principal_id", QueueOwner.client("customer-a").storageKey)
        .commit()

      assertNull(store.readSessionSnapshot("client"))
      assertNull(store.readToken())
    } finally {
      store.clear()
    }
  }

  @Test
  fun versionTwoRowsAreQuarantinedAndInvisibleToEveryOwner() {
    val databaseName = databaseName("migration")
    createVersionTwoDatabase(databaseName)

    val ownerA = OfflineQueueDb(context, databaseName, QueueOwner("staff", "a"))
    val ownerB = OfflineQueueDb(context, databaseName, QueueOwner("staff", "b"))

    assertTrue(ownerA.pending(includeConflicts = true).isEmpty())
    assertTrue(ownerB.pending(includeConflicts = true).isEmpty())
    assertEquals(
      "quarantined",
      ownerA.readableDatabase.rawQuery(
        "SELECT state FROM pending_mutation WHERE id = ?",
        arrayOf("legacy-row"),
      ).use { cursor -> cursor.moveToFirst(); cursor.getString(0) },
    )
  }

  private fun assertAccountIsolation(queueKind: String) {
    val databaseName = databaseName(queueKind)
    val ownerA = QueueOwner(queueKind, "principal-a")
    val ownerB = QueueOwner(queueKind, "principal-b")
    val firstProcess = OfflineQueueDb(context, databaseName, ownerA)
    val id = firstProcess.enqueue("commands", "POST", """{"from":"a"}""", "stable-a")
    firstProcess.close() // A logs out and the process may be killed.

    val afterRebootForB = OfflineQueueDb(context, databaseName, ownerB)
    assertTrue(afterRebootForB.pending(includeConflicts = true).isEmpty())
    assertEquals(0, afterRebootForB.markState(id, "syncing", incrementAttempt = true))
    assertEquals(0, afterRebootForB.markSent(id))
    val ownerBId = afterRebootForB.enqueue("commands", "POST", """{"from":"b"}""", "stable-a")
    assertNotEquals(id, ownerBId)
    assertEquals(listOf(ownerBId), afterRebootForB.pending().map(PendingMutation::id))
    afterRebootForB.close()

    val afterRebootForA = OfflineQueueDb(context, databaseName, ownerA)
    val retained = afterRebootForA.pending(includeConflicts = true).single()
    assertEquals(id, retained.id)
    assertEquals("queued", retained.state)
    assertEquals(0, retained.attempts)
  }

  private fun databaseName(label: String): String =
    "offline-ownership-$label-${UUID.randomUUID()}.db".also(databaseNames::add)

  private fun createVersionTwoDatabase(databaseName: String) {
    SQLiteDatabase.openOrCreateDatabase(context.getDatabasePath(databaseName), null).use { db ->
      db.execSQL(
        """
        CREATE TABLE pending_mutation (
          id TEXT PRIMARY KEY,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          body TEXT NOT NULL,
          idempotency_key TEXT NOT NULL UNIQUE,
          attempts INTEGER NOT NULL DEFAULT 0,
          state TEXT NOT NULL DEFAULT 'queued',
          last_error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
        """.trimIndent(),
      )
      db.execSQL(
        """
        INSERT INTO pending_mutation
          (id, endpoint, method, body, idempotency_key, attempts, state, created_at, updated_at)
        VALUES
          ('legacy-row', 'orders/mine', 'POST', '{}', 'legacy-key', 0, 'queued', 1, 1)
        """.trimIndent(),
      )
      db.version = 2
    }
  }
}

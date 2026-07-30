package kg.alistore.core

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.security.MessageDigest
import java.util.UUID

data class QueueOwner(val namespace: String, val principalId: String) {
  init {
    require(namespace.isNotBlank()) { "Owner namespace is required" }
    require(principalId.isNotBlank()) { "Owner principal id is required" }
    require(':' !in namespace) { "Owner namespace cannot contain ':'" }
  }

  val storageKey: String = "$namespace:$principalId"

  companion object {
    fun client(customerId: String) = QueueOwner("client", customerId)
    fun staff(staffId: String) = QueueOwner("staff", staffId)

    fun fromStorageKey(value: String): QueueOwner {
      val separator = value.indexOf(':')
      require(separator > 0 && separator < value.lastIndex) { "Invalid queue owner" }
      return QueueOwner(value.substring(0, separator), value.substring(separator + 1))
    }
  }
}

internal fun payloadFingerprint(method: String, endpoint: String, body: String, idempotencyKey: String): String =
  MessageDigest.getInstance("SHA-256")
    .digest("${method.uppercase()}\n$endpoint\n$idempotencyKey\n$body".toByteArray(Charsets.UTF_8))
    .joinToString("") { "%02x".format(it) }

internal fun PendingMutation.hasValidPayloadFingerprint(): Boolean =
  payloadFingerprint == payloadFingerprint(method, endpoint, body, idempotencyKey)

class OfflineQueueDb(
  context: Context,
  databaseName: String = "alistore-offline.db",
  private val owner: QueueOwner,
) : SQLiteOpenHelper(context, databaseName, null, DATABASE_VERSION), MutationQueue {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("""
      CREATE TABLE pending_mutation (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        parent_mutation_id TEXT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        body TEXT NOT NULL,
        payload_fingerprint TEXT,
        idempotency_key TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'queued',
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(owner_id, idempotency_key)
      )
    """.trimIndent())
    db.execSQL("CREATE INDEX pending_mutation_owner_state ON pending_mutation(owner_id, state, created_at)")
    installImmutableIdentityTriggers(db)
    installImmutableParentTrigger(db)
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 2) {
      db.execSQL("ALTER TABLE pending_mutation ADD COLUMN state TEXT NOT NULL DEFAULT 'queued'")
      db.execSQL("ALTER TABLE pending_mutation ADD COLUMN last_error TEXT")
      db.execSQL("ALTER TABLE pending_mutation ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0")
      db.execSQL("UPDATE pending_mutation SET updated_at = created_at WHERE updated_at = 0")
    }
    if (oldVersion < 3) migrateToOwnerBoundQueue(db)
    if (oldVersion < 4) {
      db.execSQL("ALTER TABLE pending_mutation ADD COLUMN parent_mutation_id TEXT")
      installImmutableParentTrigger(db)
    }
  }

  override fun enqueue(endpoint: String, method: String, body: String, idempotencyKey: String): String {
    val id = UUID.randomUUID().toString()
    val now = System.currentTimeMillis()
    writableDatabase.insertOrThrow("pending_mutation", null, ContentValues().apply {
      put("id", id)
      put("owner_id", owner.storageKey)
      putNull("parent_mutation_id")
      put("endpoint", endpoint)
      put("method", method)
      put("body", body)
      put("payload_fingerprint", payloadFingerprint(method, endpoint, body, idempotencyKey))
      put("idempotency_key", idempotencyKey)
      put("attempts", 0)
      put("state", "queued")
      putNull("last_error")
      put("created_at", now)
      put("updated_at", now)
    })
    return id
  }

  fun pending(limit: Int = 50, includeConflicts: Boolean = false): List<PendingMutation> {
    val cursor = readableDatabase.query(
      "pending_mutation",
      null,
      if (includeConflicts) "owner_id = ?" else "owner_id = ? AND state = ?",
      if (includeConflicts) arrayOf(owner.storageKey) else arrayOf(owner.storageKey, "queued"),
      null,
      null,
      "created_at ASC",
      limit.toString(),
    )
    return cursor.use {
      buildList {
        while (it.moveToNext()) {
          add(PendingMutation(
            id = it.getString(it.getColumnIndexOrThrow("id")),
            ownerId = it.getString(it.getColumnIndexOrThrow("owner_id")),
            parentMutationId = it.getString(it.getColumnIndexOrThrow("parent_mutation_id")),
            endpoint = it.getString(it.getColumnIndexOrThrow("endpoint")),
            method = it.getString(it.getColumnIndexOrThrow("method")),
            body = it.getString(it.getColumnIndexOrThrow("body")),
            payloadFingerprint = it.getString(it.getColumnIndexOrThrow("payload_fingerprint")),
            idempotencyKey = it.getString(it.getColumnIndexOrThrow("idempotency_key")),
            attempts = it.getInt(it.getColumnIndexOrThrow("attempts")),
            state = it.getString(it.getColumnIndexOrThrow("state")),
            lastError = it.getString(it.getColumnIndexOrThrow("last_error")),
            createdAt = it.getLong(it.getColumnIndexOrThrow("created_at")),
            updatedAt = it.getLong(it.getColumnIndexOrThrow("updated_at")),
          ))
        }
      }
    }
  }

  fun markSent(id: String): Int =
    writableDatabase.delete("pending_mutation", "id = ? AND owner_id = ?", arrayOf(id, owner.storageKey))

  fun markClaimSent(mutation: PendingMutation): Int = writableDatabase.delete(
    "pending_mutation",
    "id = ? AND owner_id = ? AND state = 'syncing' AND attempts = ?",
    arrayOf(mutation.id, owner.storageKey, mutation.attempts.toString()),
  )

  fun markContinuationSent(mutation: PendingMutation): Int {
    val parentId = mutation.parentMutationId ?: return markClaimSent(mutation)
    val db = writableDatabase
    db.beginTransaction()
    try {
      val parentUpdated = db.update("pending_mutation", ContentValues().apply {
        put("state", "continued")
        put("last_error", "approval_continuation_sent:${mutation.id}")
        put("updated_at", System.currentTimeMillis())
      }, "id = ? AND owner_id = ? AND state = 'conflict'", arrayOf(parentId, owner.storageKey))
      if (parentUpdated != 1) return 0
      val continuationDeleted = db.delete(
        "pending_mutation",
        "id = ? AND owner_id = ? AND state = 'syncing' AND attempts = ? AND parent_mutation_id = ?",
        arrayOf(mutation.id, owner.storageKey, mutation.attempts.toString(), parentId),
      )
      if (continuationDeleted != 1) return 0
      db.setTransactionSuccessful()
      return 1
    } finally {
      db.endTransaction()
    }
  }

  fun markClaimState(mutation: PendingMutation, state: String, error: String? = null): Int =
    writableDatabase.update("pending_mutation", ContentValues().apply {
      put("state", state)
      if (error == null) putNull("last_error") else put("last_error", error)
      put("updated_at", System.currentTimeMillis())
    }, "id = ? AND owner_id = ? AND state = 'syncing' AND attempts = ?", arrayOf(
      mutation.id,
      owner.storageKey,
      mutation.attempts.toString(),
    ))

  fun retry(id: String): Int = markState(id, "queued")

  fun claimNext(): PendingMutation? {
    val db = writableDatabase
    db.beginTransaction()
    try {
      val id = db.rawQuery(
        """
        SELECT id
        FROM pending_mutation
        WHERE owner_id = ? AND state = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        """.trimIndent(),
        arrayOf(owner.storageKey),
      ).use { if (it.moveToFirst()) it.getString(0) else null } ?: return null
      val now = System.currentTimeMillis()
      val claimed = db.execSQLUpdate(
        """
        UPDATE pending_mutation
        SET state = 'syncing', attempts = attempts + 1, last_error = NULL, updated_at = ?
        WHERE id = ? AND owner_id = ? AND state = 'queued'
        """.trimIndent(),
        arrayOf<Any>(now, id, owner.storageKey),
      )
      if (claimed != 1) return null
      val mutation = readMutation(db, id) ?: return null
      db.setTransactionSuccessful()
      return mutation
    } finally {
      db.endTransaction()
    }
  }

  fun recoverStaleSyncing(staleBefore: Long): Int = writableDatabase.execSQLUpdate(
    """
    UPDATE pending_mutation
    SET state = 'queued', last_error = 'Recovered stale offline claim', updated_at = ?
    WHERE owner_id = ? AND state = 'syncing' AND updated_at <= ?
    """.trimIndent(),
    arrayOf<Any>(System.currentTimeMillis(), owner.storageKey, staleBefore),
  )

  fun enqueueContinuation(originalId: String, body: String, idempotencyKey: String): String {
    require(idempotencyKey.isNotBlank()) { "Continuation idempotency key is required" }
    val db = writableDatabase
    db.beginTransaction()
    try {
      val original = db.rawQuery(
        """
        SELECT endpoint, method, body, payload_fingerprint, idempotency_key, state, parent_mutation_id
        FROM pending_mutation
        WHERE id = ? AND owner_id = ?
        """.trimIndent(),
        arrayOf(originalId, owner.storageKey),
      ).use {
        require(it.moveToFirst()) { "Original offline command not found" }
        ContinuationSource(
          endpoint = it.getString(0),
          method = it.getString(1),
          body = it.getString(2),
          payloadFingerprint = it.getString(3),
          idempotencyKey = it.getString(4),
          state = it.getString(5),
          parentMutationId = it.getString(6),
        )
      }
      require(original.state == "conflict") { "Only conflicted commands can continue" }
      require(original.parentMutationId == null) {
        "Approval continuation cannot create another continuation"
      }
      require(original.idempotencyKey != idempotencyKey) { "Continuation must use a distinct idempotency key" }
      require(
        original.payloadFingerprint == payloadFingerprint(
          original.method,
          original.endpoint,
          original.body,
          original.idempotencyKey,
        ),
      ) { "Original offline command fingerprint mismatch" }
      val continuationFingerprint =
        payloadFingerprint(original.method, original.endpoint, body, idempotencyKey)
      val existing = db.rawQuery(
        """
        SELECT id, parent_mutation_id, payload_fingerprint, state
        FROM pending_mutation
        WHERE owner_id = ? AND idempotency_key = ?
        """.trimIndent(),
        arrayOf(owner.storageKey, idempotencyKey),
      ).use {
        if (!it.moveToFirst()) null else ContinuationRow(
          id = it.getString(0),
          parentMutationId = it.getString(1),
          payloadFingerprint = it.getString(2),
          state = it.getString(3),
        )
      }
      if (existing != null) {
        require(
          existing.parentMutationId == originalId &&
            existing.payloadFingerprint == continuationFingerprint &&
            existing.state != "quarantined",
        ) {
          "Continuation idempotency key collision"
        }
        if (existing.state == "failed" || existing.state == "conflict") {
          db.update("pending_mutation", ContentValues().apply {
            put("state", "queued")
            putNull("last_error")
            put("updated_at", System.currentTimeMillis())
          }, "id = ? AND owner_id = ? AND state = ?", arrayOf(existing.id, owner.storageKey, existing.state))
        }
        db.setTransactionSuccessful()
        return existing.id
      }
      val now = System.currentTimeMillis()
      val continuationId = UUID.randomUUID().toString()
      db.insertOrThrow("pending_mutation", null, ContentValues().apply {
        put("id", continuationId)
        put("owner_id", owner.storageKey)
        put("parent_mutation_id", originalId)
        put("endpoint", original.endpoint)
        put("method", original.method)
        put("body", body)
        put("payload_fingerprint", continuationFingerprint)
        put("idempotency_key", idempotencyKey)
        put("attempts", 0)
        put("state", "queued")
        putNull("last_error")
        put("created_at", now)
        put("updated_at", now)
      })
      db.setTransactionSuccessful()
      return continuationId
    } finally {
      db.endTransaction()
    }
  }

  fun markState(id: String, state: String, error: String? = null, incrementAttempt: Boolean = false): Int =
    writableDatabase.update("pending_mutation", ContentValues().apply {
      put("state", state)
      if (error == null) putNull("last_error") else put("last_error", error)
      put("updated_at", System.currentTimeMillis())
      if (incrementAttempt) put("attempts", pendingAttempts(id) + 1)
    }, "id = ? AND owner_id = ?", arrayOf(id, owner.storageKey))

  private fun pendingAttempts(id: String): Int = readableDatabase.rawQuery(
    "SELECT attempts FROM pending_mutation WHERE id = ? AND owner_id = ?",
    arrayOf(id, owner.storageKey),
  ).use { if (it.moveToFirst()) it.getInt(0) else 0 }

  private fun migrateToOwnerBoundQueue(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE pending_mutation_v3 (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        body TEXT NOT NULL,
        payload_fingerprint TEXT,
        idempotency_key TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'queued',
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(owner_id, idempotency_key)
      )
      """.trimIndent(),
    )
    db.execSQL(
      """
      INSERT INTO pending_mutation_v3 (
        id, owner_id, endpoint, method, body, payload_fingerprint,
        idempotency_key, attempts, state, last_error, created_at, updated_at
      )
      SELECT
        id, NULL, endpoint, method, body, NULL,
        idempotency_key, attempts, 'quarantined',
        'Legacy offline command has no owner and cannot be replayed',
        created_at, CASE WHEN updated_at = 0 THEN created_at ELSE updated_at END
      FROM pending_mutation
      """.trimIndent(),
    )
    db.execSQL("DROP TABLE pending_mutation")
    db.execSQL("ALTER TABLE pending_mutation_v3 RENAME TO pending_mutation")
    db.execSQL("CREATE INDEX pending_mutation_owner_state ON pending_mutation(owner_id, state, created_at)")
    installImmutableIdentityTriggers(db)
  }

  private fun installImmutableIdentityTriggers(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TRIGGER pending_mutation_owner_immutable
      BEFORE UPDATE OF owner_id ON pending_mutation
      BEGIN
        SELECT RAISE(ABORT, 'offline command owner is immutable');
      END
      """.trimIndent(),
    )
    db.execSQL(
      """
      CREATE TRIGGER pending_mutation_fingerprint_immutable
      BEFORE UPDATE OF payload_fingerprint ON pending_mutation
      BEGIN
        SELECT RAISE(ABORT, 'offline command payload fingerprint is immutable');
      END
      """.trimIndent(),
    )
    db.execSQL(
      """
      CREATE TRIGGER pending_mutation_idempotency_key_immutable
      BEFORE UPDATE OF idempotency_key ON pending_mutation
      BEGIN
        SELECT RAISE(ABORT, 'offline command idempotency key is immutable');
      END
      """.trimIndent(),
    )
  }

  private fun installImmutableParentTrigger(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TRIGGER pending_mutation_parent_immutable
      BEFORE UPDATE OF parent_mutation_id ON pending_mutation
      BEGIN
        SELECT RAISE(ABORT, 'offline command parent is immutable');
      END
      """.trimIndent(),
    )
  }

  private fun readMutation(db: SQLiteDatabase, id: String): PendingMutation? = db.query(
    "pending_mutation",
    null,
    "id = ? AND owner_id = ?",
    arrayOf(id, owner.storageKey),
    null,
    null,
    null,
    "1",
  ).use {
    if (!it.moveToFirst()) return null
    PendingMutation(
      id = it.getString(it.getColumnIndexOrThrow("id")),
      ownerId = it.getString(it.getColumnIndexOrThrow("owner_id")),
      parentMutationId = it.getString(it.getColumnIndexOrThrow("parent_mutation_id")),
      endpoint = it.getString(it.getColumnIndexOrThrow("endpoint")),
      method = it.getString(it.getColumnIndexOrThrow("method")),
      body = it.getString(it.getColumnIndexOrThrow("body")),
      payloadFingerprint = it.getString(it.getColumnIndexOrThrow("payload_fingerprint")),
      idempotencyKey = it.getString(it.getColumnIndexOrThrow("idempotency_key")),
      attempts = it.getInt(it.getColumnIndexOrThrow("attempts")),
      state = it.getString(it.getColumnIndexOrThrow("state")),
      lastError = it.getString(it.getColumnIndexOrThrow("last_error")),
      createdAt = it.getLong(it.getColumnIndexOrThrow("created_at")),
      updatedAt = it.getLong(it.getColumnIndexOrThrow("updated_at")),
    )
  }

  private companion object {
    const val DATABASE_VERSION = 4
  }
}

private data class ContinuationSource(
  val endpoint: String,
  val method: String,
  val body: String,
  val payloadFingerprint: String,
  val idempotencyKey: String,
  val state: String,
  val parentMutationId: String?,
)

private data class ContinuationRow(
  val id: String,
  val parentMutationId: String?,
  val payloadFingerprint: String,
  val state: String,
)

private fun SQLiteDatabase.execSQLUpdate(sql: String, bindArgs: Array<out Any>): Int {
  compileStatement(sql).use { statement ->
    bindArgs.forEachIndexed { index, value ->
      when (value) {
        is Long -> statement.bindLong(index + 1, value)
        is Int -> statement.bindLong(index + 1, value.toLong())
        is String -> statement.bindString(index + 1, value)
        else -> error("Unsupported SQLite bind argument")
      }
    }
    return statement.executeUpdateDelete()
  }
}

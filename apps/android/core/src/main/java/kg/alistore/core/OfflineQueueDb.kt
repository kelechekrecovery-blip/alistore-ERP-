package kg.alistore.core

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.util.UUID

class OfflineQueueDb(context: Context) : SQLiteOpenHelper(context, "alistore-offline.db", null, 2), MutationQueue {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("""
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
    """.trimIndent())
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 2) {
      db.execSQL("ALTER TABLE pending_mutation ADD COLUMN state TEXT NOT NULL DEFAULT 'queued'")
      db.execSQL("ALTER TABLE pending_mutation ADD COLUMN last_error TEXT")
      db.execSQL("ALTER TABLE pending_mutation ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0")
      db.execSQL("UPDATE pending_mutation SET updated_at = created_at WHERE updated_at = 0")
    }
  }

  override fun enqueue(endpoint: String, method: String, body: String, idempotencyKey: String): String {
    val id = UUID.randomUUID().toString()
    val now = System.currentTimeMillis()
    writableDatabase.insertOrThrow("pending_mutation", null, ContentValues().apply {
      put("id", id)
      put("endpoint", endpoint)
      put("method", method)
      put("body", body)
      put("idempotency_key", idempotencyKey)
      put("attempts", 0)
      put("state", "queued")
      putNull("last_error")
      put("created_at", now)
      put("updated_at", now)
    })
    return id
  }

  fun pending(limit: Int = 50): List<PendingMutation> {
    val cursor = readableDatabase.query(
      "pending_mutation",
      null,
      "state != ?",
      arrayOf("conflict"),
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
            endpoint = it.getString(it.getColumnIndexOrThrow("endpoint")),
            method = it.getString(it.getColumnIndexOrThrow("method")),
            body = it.getString(it.getColumnIndexOrThrow("body")),
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

  fun markSent(id: String) { writableDatabase.delete("pending_mutation", "id = ?", arrayOf(id)) }

  fun retry(id: String) { markState(id, "queued") }

  fun markState(id: String, state: String, error: String? = null, incrementAttempt: Boolean = false) {
    writableDatabase.update("pending_mutation", ContentValues().apply {
      put("state", state)
      if (error == null) putNull("last_error") else put("last_error", error)
      put("updated_at", System.currentTimeMillis())
      if (incrementAttempt) put("attempts", pendingAttempts(id) + 1)
    }, "id = ?", arrayOf(id))
  }

  private fun pendingAttempts(id: String): Int = readableDatabase.rawQuery(
    "SELECT attempts FROM pending_mutation WHERE id = ?", arrayOf(id),
  ).use { if (it.moveToFirst()) it.getInt(0) else 0 }
}

package kg.alistore.core

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.util.UUID

class OfflineQueueDb(context: Context) : SQLiteOpenHelper(context, "alistore-offline.db", null, 1) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("""
      CREATE TABLE pending_mutation (
        id TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        body TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    """.trimIndent())
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  fun enqueue(endpoint: String, method: String, body: String, idempotencyKey: String = UUID.randomUUID().toString()): String {
    val id = UUID.randomUUID().toString()
    writableDatabase.insertOrThrow("pending_mutation", null, ContentValues().apply {
      put("id", id)
      put("endpoint", endpoint)
      put("method", method)
      put("body", body)
      put("idempotency_key", idempotencyKey)
      put("attempts", 0)
      put("created_at", System.currentTimeMillis())
    })
    return id
  }

  fun pending(limit: Int = 50): List<PendingMutation> {
    val cursor = readableDatabase.query("pending_mutation", null, null, null, null, null, "created_at ASC", limit.toString())
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
            createdAt = it.getLong(it.getColumnIndexOrThrow("created_at")),
          ))
        }
      }
    }
  }

  fun markSent(id: String) { writableDatabase.delete("pending_mutation", "id = ?", arrayOf(id)) }

  fun markAttempt(id: String) {
    writableDatabase.execSQL("UPDATE pending_mutation SET attempts = attempts + 1 WHERE id = ?", arrayOf(id))
  }
}

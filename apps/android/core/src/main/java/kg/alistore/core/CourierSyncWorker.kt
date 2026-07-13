package kg.alistore.core

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class CourierSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val apiBaseUrl = inputData.getString("apiBaseUrl") ?: return@withContext Result.failure()
    val token = SecureTokenStore(applicationContext, "alistore-courier-session").readToken()
      ?: return@withContext Result.failure()
    val queue = OfflineQueueDb(applicationContext, COURIER_QUEUE_DB)
    val client = ApiClient(apiBaseUrl)
    var retryRequired = false
    for (mutation in queue.pending()) {
      try {
        queue.markState(mutation.id, "syncing", incrementAttempt = true)
        val status = client.send(mutation, token)
        when {
          status in 200..299 -> queue.markSent(mutation.id)
          status == 409 || status == 422 -> queue.markState(mutation.id, "conflict", "HTTP $status")
          status == 401 || status == 403 -> queue.markState(mutation.id, "failed", "HTTP $status")
          else -> {
            queue.markState(mutation.id, "failed", "HTTP $status")
            retryRequired = true
          }
        }
      } catch (error: Exception) {
        queue.markState(mutation.id, "queued", error.message)
        retryRequired = true
      }
    }
    if (retryRequired) Result.retry() else Result.success()
  }
}

internal const val COURIER_QUEUE_DB = "alistore-courier-offline.db"

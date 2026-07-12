package kg.alistore.core

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class OfflineSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val apiBaseUrl = inputData.getString("apiBaseUrl") ?: return@withContext Result.failure()
    val queue = OfflineQueueDb(applicationContext)
    val token = SecureTokenStore(applicationContext, "alistore-session").read()
    val client = ApiClient(apiBaseUrl)
    var retryRequired = false
    for (mutation in queue.pending()) {
      try {
        val status = client.send(mutation, token)
        when {
          status in 200..299 -> queue.markSent(mutation.id)
          status == 409 || status == 422 -> queue.markAttempt(mutation.id)
          else -> { queue.markAttempt(mutation.id); retryRequired = true }
        }
      } catch (_: Exception) {
        queue.markAttempt(mutation.id)
        retryRequired = true
      }
    }
    if (retryRequired) Result.retry() else Result.success()
  }
}

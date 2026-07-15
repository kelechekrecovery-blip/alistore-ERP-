package kg.alistore.core

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class OfflineSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val apiBaseUrl = inputData.getString("apiBaseUrl") ?: return@withContext Result.failure()
    val queue = OfflineQueueDb(applicationContext)
    val tokenStore = SecureTokenStore(applicationContext, "alistore-session")
    var session = tokenStore.readSession()
    val client = ApiClient(apiBaseUrl)
    var retryRequired = false
    for (mutation in queue.pending()) {
      try {
        queue.markState(mutation.id, "syncing", incrementAttempt = true)
        if (mutation.endpoint == "orders/mine") {
          val body = JSONObject(mutation.body)
          if (body.optString("fulfillmentType") == "pickup" && body.optString("storePointId").isBlank()) {
            queue.markState(mutation.id, "conflict", "Выберите актуальную точку самовывоза и создайте заказ повторно")
            continue
          }
        }
        var status = client.send(mutation, session?.accessToken)
        if (status == 401 && session != null) {
          session = client.refresh(session.refreshToken).also(tokenStore::saveSession)
          status = client.send(mutation, session.accessToken)
        }
        when {
          status in 200..299 -> queue.markSent(mutation.id)
          status == 409 || status == 422 -> queue.markState(mutation.id, "conflict", "HTTP $status")
          else -> { queue.markState(mutation.id, "failed", "HTTP $status"); retryRequired = true }
        }
      } catch (error: Exception) {
        queue.markState(mutation.id, "queued", error.message)
        retryRequired = true
      }
    }
    if (retryRequired) Result.retry() else Result.success()
  }
}

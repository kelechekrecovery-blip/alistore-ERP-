package kg.alistore.core

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PosSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val apiBaseUrl = inputData.getString("apiBaseUrl") ?: return@withContext Result.failure()
    val token = SecureTokenStore(applicationContext, "alistore-pos-session").readToken()
      ?: return@withContext Result.failure()
    val queue = OfflineQueueDb(applicationContext, POS_QUEUE_DB)
    val client = ApiClient(apiBaseUrl)
    var retry = false
    for (mutation in queue.pending()) {
      try {
        queue.markState(mutation.id, "syncing", incrementAttempt = true)
        val response = client.sendResponse(mutation, token)
        when (val decision = posReplayDecision(response)) {
          PosReplayDecision.Sent -> queue.markSent(mutation.id)
          is PosReplayDecision.Conflict -> queue.markState(mutation.id, "conflict", decision.message)
          is PosReplayDecision.Failed -> queue.markState(mutation.id, "failed", decision.message)
          PosReplayDecision.Retry -> { queue.markState(mutation.id, "failed", "HTTP ${response.status}"); retry = true }
        }
      } catch (error: Exception) {
        queue.markState(mutation.id, "queued", error.message)
        retry = true
      }
    }
    if (retry) Result.retry() else Result.success()
  }
}

internal const val POS_QUEUE_DB = "alistore-pos-offline.db"

internal sealed interface PosReplayDecision {
  data object Sent : PosReplayDecision
  data class Conflict(val message: String) : PosReplayDecision
  data class Failed(val message: String) : PosReplayDecision
  data object Retry : PosReplayDecision
}

internal fun posReplayDecision(response: RawApiResponse): PosReplayDecision {
  val status = response.status
  if (status == 202) {
    val approvalId = runCatching { org.json.JSONObject(response.body).optString("approvalId") }.getOrNull()
    return PosReplayDecision.Conflict("Требуется approval ${approvalId?.takeLast(8).orEmpty()}".trim())
  }
  return when {
    status in 200..299 -> PosReplayDecision.Sent
    status == 409 || status == 422 -> PosReplayDecision.Conflict("HTTP $status")
    status == 401 || status == 403 -> PosReplayDecision.Failed("HTTP $status")
    else -> PosReplayDecision.Retry
  }
}

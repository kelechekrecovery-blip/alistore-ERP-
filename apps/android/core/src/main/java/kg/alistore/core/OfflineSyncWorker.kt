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
    val tokenStore = SecureTokenStore(applicationContext, "alistore-session")
    var session = tokenStore.readSessionSnapshot("client") ?: return@withContext Result.failure()
    val queue = OfflineQueueDb(applicationContext, owner = session.queueOwner)
    val client = ApiClient(apiBaseUrl)
    var retryRequired = false
    try {
      queue.recoverStaleSyncing(System.currentTimeMillis() - OFFLINE_CLAIM_TIMEOUT_MS)
      while (true) {
        val mutation = queue.claimNext() ?: break
        try {
        if (!tokenStore.isCurrent(session)) {
          queue.markClaimState(mutation, "queued", "Authenticated session changed before replay")
          return@withContext Result.success()
        }
        if (!mutation.hasValidPayloadFingerprint()) {
          queue.markClaimState(mutation, "quarantined", "Offline command payload fingerprint mismatch")
          continue
        }
        if (mutation.endpoint == "orders/mine") {
          val body = JSONObject(mutation.body)
          if (body.optString("fulfillmentType") == "pickup" && body.optString("storePointId").isBlank()) {
            queue.markClaimState(mutation, "conflict", "Выберите актуальную точку самовывоза и создайте заказ повторно")
            continue
          }
        }
        var status = client.send(mutation, session.accessToken)
        if (status == 401) {
          val refreshToken = session.refreshToken
          if (refreshToken == null) {
            queue.markClaimState(mutation, "failed", "Authenticated session has no refresh token")
            continue
          }
          val refreshed = client.refresh(refreshToken)
          val replacement = tokenStore.replaceSession(session, refreshed)
          if (replacement == null) {
            queue.markClaimState(mutation, "queued", "Authenticated session changed during refresh")
            return@withContext Result.success()
          }
          session = replacement
          status = client.send(mutation, session.accessToken)
        }
        when {
          status in 200..299 -> queue.markClaimSent(mutation)
          status == 409 || status == 422 -> queue.markClaimState(mutation, "conflict", "HTTP $status")
          status == 401 || status == 403 -> queue.markClaimState(mutation, "failed", "HTTP $status")
          else -> {
            queue.markClaimState(mutation, "queued", "HTTP $status")
            retryRequired = true
          }
        }
        } catch (error: Exception) {
          if (error is ApiException && (error.status == 401 || error.status == 403)) {
            queue.markClaimState(mutation, "failed", "HTTP ${error.status}")
          } else {
            queue.markClaimState(mutation, "queued", error.message)
            retryRequired = true
          }
        }
        if (retryRequired) break
      }
      if (retryRequired) Result.retry() else Result.success()
    } finally {
      queue.close()
    }
  }
}

internal const val OFFLINE_CLAIM_TIMEOUT_MS = 15 * 60 * 1000L

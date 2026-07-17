package kg.alistore.client

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kg.alistore.core.ApiClient
import kg.alistore.core.AuthState
import kg.alistore.core.ClientPushRegistrar
import kg.alistore.core.SecureTokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine

class FirebaseClientPushRegistrar(
  context: Context,
  private val apiBaseUrl: String,
) : ClientPushRegistrar {
  private val appContext = context.applicationContext
  private val preferences = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private val api = ApiClient(apiBaseUrl)

  override suspend fun register(session: AuthState.SignedIn) {
    val token = preferences.getString(KEY_TOKEN, null) ?: currentFirebaseToken().also(::saveToken)
    api.registerPushToken(token, "android", installationId(), session.tokens.accessToken)
  }

  private suspend fun currentFirebaseToken(): String {
    check(FirebaseApp.getApps(appContext).isNotEmpty()) { "Firebase is not configured" }
    return suspendCancellableCoroutine { continuation ->
      FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
        if (!continuation.isActive) return@addOnCompleteListener
        if (task.isSuccessful) continuation.resume(task.result)
        else continuation.resumeWithException(task.exception ?: IllegalStateException("FCM token unavailable"))
      }
    }
  }

  private fun installationId(): String = preferences.getString(KEY_INSTALLATION, null) ?: UUID.randomUUID().toString().also {
    preferences.edit().putString(KEY_INSTALLATION, it).apply()
  }

  private fun saveToken(token: String) { preferences.edit().putString(KEY_TOKEN, token).apply() }

  companion object {
    private const val PREFS = "client-push"
    private const val KEY_TOKEN = "fcm-token"
    private const val KEY_INSTALLATION = "installation-id"

    fun onNewToken(context: Context, apiBaseUrl: String, token: String) {
      val registrar = FirebaseClientPushRegistrar(context, apiBaseUrl)
      registrar.saveToken(token)
      val accessToken = SecureTokenStore(context, "alistore-session").readToken() ?: return
      CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
        runCatching { registrar.api.registerPushToken(token, "android", registrar.installationId(), accessToken) }
      }
    }
  }
}

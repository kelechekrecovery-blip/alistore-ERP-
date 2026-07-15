package kg.alistore.core

interface AuthGateway {
  suspend fun requestOtp(phone: String): OtpChallenge
  suspend fun verifyOtp(phone: String, code: String): AuthTokens
  suspend fun refresh(refreshToken: String): AuthTokens
  suspend fun me(accessToken: String): AuthUser
  suspend fun logout(refreshToken: String)
}

interface SessionStore {
  fun saveSession(tokens: AuthTokens)
  fun readSession(): AuthTokens?
  fun clear()
}

sealed interface AuthState {
  data object Restoring : AuthState
  data object Guest : AuthState
  data class SignedIn(val user: AuthUser, val tokens: AuthTokens) : AuthState
  data class Failed(val message: String) : AuthState
}

class AuthSessionManager(
  private val api: AuthGateway,
  private val store: SessionStore,
) {
  var requiresQuickUnlock: Boolean = false
    private set
  suspend fun restore(): AuthState {
    val stored = store.readSession() ?: return AuthState.Guest
    return runCatching { requiresQuickUnlock = true; signedIn(stored) }.getOrElse { initialError ->
      if (initialError !is ApiException || initialError.status != 401) {
        return@getOrElse failAndClear(initialError)
      }
      runCatching {
        val refreshed = api.refresh(stored.refreshToken)
        store.saveSession(refreshed)
        requiresQuickUnlock = true
        signedIn(refreshed)
      }.getOrElse(::failAndClear)
    }
  }

  suspend fun requestOtp(phone: String): OtpChallenge = api.requestOtp(phone.normalizedPhone())

  suspend fun verify(phone: String, code: String): AuthState = runCatching {
    val tokens = api.verifyOtp(phone.normalizedPhone(), code.trim())
    store.saveSession(tokens)
    requiresQuickUnlock = false
    signedIn(tokens)
  }.getOrElse { AuthState.Failed(it.userMessage()) }

  suspend fun logout(state: AuthState.SignedIn): AuthState {
    runCatching { api.logout(state.tokens.refreshToken) }
    store.clear()
    requiresQuickUnlock = false
    return AuthState.Guest
  }

  fun unlock() { requiresQuickUnlock = false }

  fun forceLogout(): AuthState {
    store.clear()
    requiresQuickUnlock = false
    return AuthState.Guest
  }

  suspend fun refresh(state: AuthState.SignedIn): AuthState = runCatching {
    val refreshed = api.refresh(state.tokens.refreshToken)
    store.saveSession(refreshed)
    signedIn(refreshed)
  }.getOrElse(::failAndClear)

  private suspend fun signedIn(tokens: AuthTokens): AuthState.SignedIn =
    AuthState.SignedIn(api.me(tokens.accessToken), tokens)

  private fun failAndClear(error: Throwable): AuthState {
    store.clear()
    return AuthState.Failed(error.userMessage())
  }
}

private fun String.normalizedPhone(): String = trim().replace(" ", "").replace("-", "")

private fun Throwable.userMessage(): String = message?.takeIf { it.isNotBlank() } ?: "Не удалось войти"

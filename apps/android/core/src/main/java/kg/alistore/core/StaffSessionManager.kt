package kg.alistore.core

interface StaffAuthGateway {
  suspend fun staffLogin(username: String, password: String): StaffSession
  suspend fun staffMe(accessToken: String): StaffPrincipal
}

interface StaffSessionStore {
  fun saveToken(token: String)
  fun readToken(): String?
  fun clear()
}

sealed interface StaffAuthState {
  data object Restoring : StaffAuthState
  data object SignedOut : StaffAuthState
  data class SignedIn(val session: StaffSession) : StaffAuthState
  data class Failed(val message: String) : StaffAuthState
}

class StaffSessionManager(
  private val api: StaffAuthGateway,
  private val store: StaffSessionStore,
) {
  var requiresQuickUnlock: Boolean = false
    private set
  suspend fun restore(): StaffAuthState {
    val token = store.readToken() ?: return StaffAuthState.SignedOut
    return runCatching {
      val principal = api.staffMe(token)
      requiresQuickUnlock = true
      StaffAuthState.SignedIn(principal.session(token))
    }.getOrElse(::failAndClear)
  }

  suspend fun login(username: String, password: String): StaffAuthState = runCatching {
    val session = api.staffLogin(username.trim(), password)
    store.saveToken(session.accessToken)
    requiresQuickUnlock = false
    val principal = api.staffMe(session.accessToken)
    StaffAuthState.SignedIn(principal.session(session.accessToken))
  }.getOrElse { StaffAuthState.Failed(it.message?.takeIf(String::isNotBlank) ?: "Не удалось войти") }

  fun logout(): StaffAuthState {
    store.clear()
    requiresQuickUnlock = false
    return StaffAuthState.SignedOut
  }

  fun unlock() { requiresQuickUnlock = false }

  private fun failAndClear(error: Throwable): StaffAuthState {
    store.clear()
    return StaffAuthState.Failed(error.message?.takeIf(String::isNotBlank) ?: "Сессия сотрудника недоступна")
  }
}

private fun StaffPrincipal.session(token: String) = StaffSession(
  accessToken = token,
  staffId = id,
  username = username,
  role = role,
  totpEnabled = totpEnabled,
)

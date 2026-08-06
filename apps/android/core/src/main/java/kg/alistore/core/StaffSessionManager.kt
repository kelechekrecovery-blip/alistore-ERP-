package kg.alistore.core

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collect

interface StaffAuthGateway {
  suspend fun staffLogin(username: String, password: String, totp: String? = null): StaffSession
  suspend fun staffMe(accessToken: String): StaffPrincipal
  suspend fun staffRefresh(refreshToken: String): StaffSession
  suspend fun staffLogout(refreshToken: String)
  fun installStaffUnauthorizedHandler(handler: suspend (failedAccessToken: String) -> String?) = Unit
}

interface StaffSessionStore {
  fun saveAuthenticatedSession(tokens: AuthTokens, principalId: String)
  fun readSession(): AuthTokens?
  fun readStaffSessionSnapshot(): SecureSessionSnapshot?
  fun isCurrent(snapshot: SecureSessionSnapshot): Boolean
  fun replaceStaffSession(snapshot: SecureSessionSnapshot, tokens: AuthTokens): SecureSessionSnapshot?
  val sessionChanges: Flow<Unit>
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
  private val refreshMutex = Mutex()
  private var activeSession: StaffSession? = null

  init {
    api.installStaffUnauthorizedHandler(::renewAccessToken)
  }

  // Compose-observable: a plain `var` here is never re-read by a running composition once
  // it changes outside a recomposition triggered by other state, so the unlock gate could
  // silently become a no-op. Backing this with mutableStateOf makes every reader (PosApp,
  // StaffApp, CourierApp) recompose whenever restore()/login()/unlock()/logout() flip it.
  var requiresQuickUnlock: Boolean by mutableStateOf(false)
    private set
  var requiresTotp: Boolean by mutableStateOf(false)
    private set
  /** Set only when the server terminally rejects refresh; app roots observe it and sign out. */
  var sessionInvalidated: Boolean by mutableStateOf(false)
    private set

  suspend fun restore(): StaffAuthState {
    val snapshot = store.readStaffSessionSnapshot() ?: return StaffAuthState.SignedOut
    val refreshToken = snapshot.refreshToken ?: return failAndClear(
      IllegalStateException("Сохранённая staff-сессия не содержит refresh-токен"),
    )
    val tokens = AuthTokens(snapshot.accessToken, refreshToken)
    return runCatching {
      val principal = try {
        api.staffMe(tokens.accessToken)
      } catch (error: Throwable) {
        if (!error.staffUnauthorized()) throw error
        val renewed = renewAccessToken(tokens.accessToken)
        if (renewed == null && store.readStaffSessionSnapshot() != null) {
          throw TransientStaffRestoreFailure(error)
        }
        if (renewed == null) throw error
        api.staffMe(renewed)
      }
      val session = activeSession
        ?.takeIf { it.staffId == principal.id }
        ?: principal.session(tokens.accessToken, tokens.refreshToken)
      activeSession = session
      store.saveAuthenticatedSession(session.tokens(), QueueOwner.staff(principal.id).storageKey)
      requiresQuickUnlock = true
      sessionInvalidated = false
      StaffAuthState.SignedIn(session)
    }.getOrElse { error ->
      if (error is TransientStaffRestoreFailure) {
        StaffAuthState.Failed(
          error.cause?.message?.takeIf(String::isNotBlank) ?: "Сессия временно недоступна",
        )
      } else {
        failAndClear(error)
      }
    }
  }

  suspend fun login(username: String, password: String, totp: String? = null): StaffAuthState = runCatching {
    val issued = api.staffLogin(username.trim(), password, totp?.trim()?.takeIf(String::isNotBlank))
    val refreshToken = issued.refreshToken
      ?: throw IllegalStateException("Сервер не вернул refresh-токен staff-сессии")
    val principal = api.staffMe(issued.accessToken)
    val session = principal.session(issued.accessToken, refreshToken)
    activeSession = session
    store.saveAuthenticatedSession(session.tokens(), QueueOwner.staff(principal.id).storageKey)
    requiresQuickUnlock = false
    requiresTotp = false
    sessionInvalidated = false
    StaffAuthState.SignedIn(session)
  }.getOrElse(::failAndClear)

  /** Clears local credentials synchronously so navigation cannot race a slow network revoke. */
  fun beginLogout(): StaffAuthState {
    activeSession = null
    store.clear()
    requiresQuickUnlock = false
    requiresTotp = false
    sessionInvalidated = false
    return StaffAuthState.SignedOut
  }

  /** Best-effort remote revoke after [beginLogout]; cancellation still propagates. */
  suspend fun finishLogout(session: StaffSession?) {
    val refreshToken = session?.refreshToken ?: return
    try {
      api.staffLogout(refreshToken)
    } catch (cancelled: CancellationException) {
      throw cancelled
    } catch (_: Throwable) {
      // Local logout is authoritative and must never resurrect the session.
    }
  }

  fun unlock() { requiresQuickUnlock = false }

  /** Observes clears performed by a worker/another store instance in this process. */
  suspend fun monitorExternalSessionChanges() {
    store.sessionChanges.collect {
      if (activeSession != null && store.readStaffSessionSnapshot() == null) {
        activeSession = null
        requiresQuickUnlock = false
        sessionInvalidated = true
      }
    }
  }

  private fun failAndClear(error: Throwable): StaffAuthState {
    activeSession = null
    store.clear()
    requiresTotp = error is ApiException && error.code in setOf("totp_required", "totp_invalid")
    return StaffAuthState.Failed(error.message?.takeIf(String::isNotBlank) ?: "Сессия сотрудника недоступна")
  }

  /**
   * Coalesces rotation and never replays a consumed refresh token. If another
   * request already rotated while this one waited, return the fresh access token.
   */
  private suspend fun renewAccessToken(failedAccessToken: String): String? = refreshMutex.withLock {
    activeSession?.takeIf { it.accessToken != failedAccessToken }?.let { return@withLock it.accessToken }
    val snapshot = store.readStaffSessionSnapshot() ?: return@withLock null
    if (snapshot.accessToken != failedAccessToken) return@withLock snapshot.accessToken
    val refreshToken = snapshot.refreshToken ?: run {
      terminallyInvalidate(snapshot)
      return@withLock null
    }
    try {
      val issued = api.staffRefresh(refreshToken)
      val rotated = issued.refreshToken ?: run {
        terminallyInvalidate(snapshot)
        return@withLock null
      }
      check(snapshot.queueOwner == QueueOwner.staff(issued.staffId)) {
        "Refresh principal does not match the stored staff session"
      }
      val replacement = store.replaceStaffSession(
        snapshot,
        AuthTokens(issued.accessToken, rotated),
      ) ?: return@withLock store.readStaffSessionSnapshot()
        ?.takeIf { it.accessToken != failedAccessToken }
        ?.accessToken
      activeSession = issued
      sessionInvalidated = false
      issued.accessToken
    } catch (cancelled: CancellationException) {
      throw cancelled
    } catch (error: Throwable) {
      if (store.isCurrent(snapshot) && error.terminalStaffRefreshFailure()) {
        terminallyInvalidate(snapshot)
      }
      null
    }
  }

  private fun terminallyInvalidate(snapshot: SecureSessionSnapshot) {
    if (!store.isCurrent(snapshot)) return
    activeSession = null
    store.clear()
    requiresQuickUnlock = false
    sessionInvalidated = true
  }
}

private fun StaffPrincipal.session(accessToken: String, refreshToken: String) = StaffSession(
  accessToken = accessToken,
  staffId = id,
  username = username,
  role = role,
  totpEnabled = totpEnabled,
  point = point,
  capabilities = capabilities,
  refreshToken = refreshToken,
)

private fun StaffSession.tokens() = AuthTokens(
  accessToken = accessToken,
  refreshToken = refreshToken ?: error("Staff refresh token is missing"),
)

private fun Throwable.staffUnauthorized() = this is ApiException && status in setOf(401, 403)

private fun Throwable.terminalStaffRefreshFailure() = this is ApiException && (
  status in setOf(401, 403) || code in setOf("staff_refresh_invalid", "staff_refresh_reused", "refresh_invalid", "refresh_reused")
)

private class TransientStaffRestoreFailure(cause: Throwable) : Exception(cause)

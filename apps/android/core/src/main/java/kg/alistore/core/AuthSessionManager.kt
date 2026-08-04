package kg.alistore.core

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

interface AuthGateway {
  suspend fun requestOtp(phone: String): OtpChallenge
  suspend fun verifyOtp(phone: String, code: String): AuthTokens =
    verifyOtp(phone, code, null)
  suspend fun verifyOtp(phone: String, code: String, challengeId: String?): AuthTokens
  /** Код на почту, уже привязанную к аккаунту (вход вторым каналом). */
  suspend fun requestEmailOtp(email: String): EmailOtpChallenge
  suspend fun verifyEmailOtp(email: String, code: String): AuthTokens =
    verifyEmailOtp(email, code, null)
  suspend fun verifyEmailOtp(email: String, code: String, challengeId: String?): AuthTokens
  /** Код на адрес, который вошедший клиент хочет привязать к своему аккаунту. */
  suspend fun requestEmailAttach(email: String, accessToken: String): EmailOtpChallenge
  suspend fun confirmEmailAttach(email: String, code: String, accessToken: String): Unit =
    confirmEmailAttach(email, code, accessToken, null)
  suspend fun confirmEmailAttach(email: String, code: String, accessToken: String, challengeId: String?): Unit
  suspend fun refresh(refreshToken: String): AuthTokens
  suspend fun me(accessToken: String): AuthUser
  suspend fun logout(refreshToken: String)
}

interface SessionStore {
  fun saveSession(tokens: AuthTokens)
  fun readSession(): AuthTokens?
  fun saveAuthenticatedSession(tokens: AuthTokens, principalId: String)
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
  private data class RefreshFlight(
    val refreshToken: String,
    val generation: Long,
    val result: Deferred<AuthState>,
  )

  private val authLock = ReentrantLock()
  private var refreshFlight: RefreshFlight? = null
  private var sessionGeneration = 0L
  private var phoneChallengeId: String? = null
  private var emailChallengeId: String? = null
  private var emailAttachChallengeId: String? = null

  // Compose-observable, see StaffSessionManager.requiresQuickUnlock for the rationale:
  // a plain var is not tracked by the snapshot system, so AliStoreApp's overlay check
  // (`authManager.requiresQuickUnlock`) would not reliably recompose on its own.
  var requiresQuickUnlock: Boolean by mutableStateOf(false)
    private set
  suspend fun restore(): AuthState {
    val stored = store.readSession() ?: return AuthState.Guest
    return runCatching { requiresQuickUnlock = true; signedIn(stored) }.getOrElse { initialError ->
      if (initialError !is ApiException || initialError.status != 401) {
        return@getOrElse failAndClear(initialError)
      }
      refreshCoalesced(stored.refreshToken).also {
        if (it is AuthState.SignedIn) requiresQuickUnlock = true
      }
    }
  }

  suspend fun requestOtp(phone: String): OtpChallenge =
    api.requestOtp(phone.normalizedPhone()).also { phoneChallengeId = it.challengeId }

  suspend fun verify(phone: String, code: String): AuthState = runCatching {
    val tokens = api.verifyOtp(phone.normalizedPhone(), code.trim(), phoneChallengeId)
    requiresQuickUnlock = false
    signedIn(tokens).also { phoneChallengeId = null }
  }.getOrElse(::failAndClear)

  suspend fun requestEmailOtp(email: String): EmailOtpChallenge =
    api.requestEmailOtp(email.normalizedEmail()).also { emailChallengeId = it.challengeId }

  /**
   * Вход по почте. Аккаунт здесь никогда не создаётся: адрес без телефона не
   * может быть клиентом, поэтому неизвестная почта возвращает `customer_not_found`.
   */
  suspend fun verifyEmail(email: String, code: String): AuthState = runCatching {
    val tokens = api.verifyEmailOtp(email.normalizedEmail(), code.trim(), emailChallengeId)
    requiresQuickUnlock = false
    signedIn(tokens).also { emailChallengeId = null }
  }.getOrElse {
    failAndClear(it, emailAuthMessage(it))
  }

  suspend fun requestEmailAttach(email: String, accessToken: String): EmailOtpChallenge =
    api.requestEmailAttach(email.normalizedEmail(), accessToken).also { emailAttachChallengeId = it.challengeId }

  suspend fun confirmEmailAttach(email: String, code: String, accessToken: String) =
    api.confirmEmailAttach(email.normalizedEmail(), code.trim(), accessToken, emailAttachChallengeId).also {
      emailAttachChallengeId = null
    }

  suspend fun logout(state: AuthState.SignedIn): AuthState {
    invalidateAndClear()
    runCatching { api.logout(state.tokens.refreshToken) }
    return AuthState.Guest
  }

  fun unlock() { requiresQuickUnlock = false }

  fun forceLogout(): AuthState {
    invalidateAndClear()
    return AuthState.Guest
  }

  suspend fun refresh(state: AuthState.SignedIn): AuthState = refreshCoalesced(state.tokens.refreshToken)

  /**
   * Coalesces refreshes for a rotating token. Every waiter observes the same
   * result, so a second 401 cannot replay a token the first request consumed.
   */
  private suspend fun refreshCoalesced(refreshToken: String): AuthState {
    // The exchange belongs to the manager, not to whichever screen happened to
    // observe the first 401. Removing the caller Job preserves its dispatcher
    // (including the test scheduler) while cancellation only detaches that waiter.
    val flightContext = currentCoroutineContext().minusKey(Job) + SupervisorJob()
    val flight = authLock.withLock {
      refreshFlight?.takeIf {
        it.refreshToken == refreshToken && it.generation == sessionGeneration
      } ?: run {
        refreshFlight?.result?.cancel()
        val scope = CoroutineScope(flightContext)
        lateinit var created: RefreshFlight
        val result = scope.async(start = CoroutineStart.LAZY) {
          try {
            try {
              val tokens = api.refresh(refreshToken)
              val user = api.me(tokens.accessToken)
              authLock.withLock {
                if (
                  sessionGeneration != created.generation
                  || store.readSession()?.refreshToken != created.refreshToken
                ) {
                  AuthState.Failed("Сессия уже изменилась")
                } else {
                  store.saveAuthenticatedSession(tokens, QueueOwner.client(user.customerId).storageKey)
                  AuthState.SignedIn(user, tokens)
                }
              }
            } catch (cancelled: CancellationException) {
              throw cancelled
            } catch (error: Throwable) {
              failRefreshAndClear(error, created)
            }
          } finally {
            authLock.withLock {
              if (refreshFlight === created) refreshFlight = null
            }
          }
        }
        created = RefreshFlight(refreshToken, sessionGeneration, result)
        refreshFlight = created
        result.start()
        created
      }
    }
    return flight.result.await()
  }

  private suspend fun signedIn(tokens: AuthTokens): AuthState.SignedIn {
    val user = api.me(tokens.accessToken)
    authLock.withLock {
      sessionGeneration += 1
      refreshFlight?.result?.cancel()
      refreshFlight = null
      store.saveAuthenticatedSession(tokens, QueueOwner.client(user.customerId).storageKey)
    }
    return AuthState.SignedIn(user, tokens)
  }

  private fun failRefreshAndClear(error: Throwable, flight: RefreshFlight): AuthState {
    authLock.withLock {
      if (
        sessionGeneration == flight.generation
        && store.readSession()?.refreshToken == flight.refreshToken
      ) {
        sessionGeneration += 1
        store.clear()
        requiresQuickUnlock = false
      }
    }
    return AuthState.Failed(error.userMessage())
  }

  private fun failAndClear(error: Throwable, message: String = error.userMessage()): AuthState {
    invalidateAndClear()
    return AuthState.Failed(message)
  }

  private fun invalidateAndClear() {
    authLock.withLock {
      sessionGeneration += 1
      refreshFlight?.result?.cancel()
      refreshFlight = null
      store.clear()
      requiresQuickUnlock = false
    }
  }
}

private fun String.normalizedPhone(): String = trim().replace(" ", "").replace("-", "")

private fun Throwable.userMessage(): String = message?.takeIf { it.isNotBlank() } ?: "Не удалось войти"

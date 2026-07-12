package kg.alistore.core

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthSessionManagerTest {
  @Test
  fun restoresValidStoredSession() = runTest {
    val tokens = AuthTokens("access", "refresh")
    val store = FakeStore(tokens)
    val api = FakeAuthGateway()

    val state = AuthSessionManager(api, store).restore()

    assertTrue(state is AuthState.SignedIn)
    assertEquals("customer-1", (state as AuthState.SignedIn).user.customerId)
    assertEquals(listOf("access"), api.meCalls)
  }

  @Test
  fun refreshesOnceWhenStoredAccessTokenExpired() = runTest {
    val store = FakeStore(AuthTokens("expired", "refresh-1"))
    val api = FakeAuthGateway().apply {
      meFailures["expired"] = ApiException(401, "expired")
      refreshed = AuthTokens("access-2", "refresh-2")
    }

    val state = AuthSessionManager(api, store).restore()

    assertTrue(state is AuthState.SignedIn)
    assertEquals(AuthTokens("access-2", "refresh-2"), store.tokens)
    assertEquals(listOf("refresh-1"), api.refreshCalls)
    assertEquals(listOf("expired", "access-2"), api.meCalls)
  }

  @Test
  fun clearsSessionWhenRefreshRejected() = runTest {
    val store = FakeStore(AuthTokens("expired", "revoked"))
    val api = FakeAuthGateway().apply {
      meFailures["expired"] = ApiException(401, "expired")
      refreshFailure = ApiException(401, "revoked")
    }

    val state = AuthSessionManager(api, store).restore()

    assertTrue(state is AuthState.Failed)
    assertNull(store.tokens)
    assertEquals(1, store.clearCount)
  }

  @Test
  fun verifyNormalizesPhoneAndPersistsBothTokens() = runTest {
    val store = FakeStore()
    val api = FakeAuthGateway()
    val manager = AuthSessionManager(api, store)

    manager.requestOtp(" +996 700-12-34-56 ")
    val state = manager.verify(" +996 700-12-34-56 ", " 123456 ")

    assertTrue(state is AuthState.SignedIn)
    assertEquals("+996700123456", api.requestedPhone)
    assertEquals("+996700123456" to "123456", api.verified)
    assertEquals(api.verifiedTokens, store.tokens)
  }

  @Test
  fun logoutClearsLocalSessionEvenWhenServerUnavailable() = runTest {
    val store = FakeStore(AuthTokens("access", "refresh"))
    val api = FakeAuthGateway().apply { logoutFailure = ApiException(503, "offline") }
    val manager = AuthSessionManager(api, store)
    val signedIn = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), store.tokens!!)

    val state = manager.logout(signedIn)

    assertEquals(AuthState.Guest, state)
    assertNull(store.tokens)
    assertEquals(listOf("refresh"), api.logoutCalls)
  }
}

private class FakeStore(initial: AuthTokens? = null) : SessionStore {
  var tokens: AuthTokens? = initial
  var clearCount = 0
  override fun saveSession(tokens: AuthTokens) { this.tokens = tokens }
  override fun readSession(): AuthTokens? = tokens
  override fun clear() { tokens = null; clearCount += 1 }
}

private class FakeAuthGateway : AuthGateway {
  val meCalls = mutableListOf<String>()
  val refreshCalls = mutableListOf<String>()
  val logoutCalls = mutableListOf<String>()
  val meFailures = mutableMapOf<String, Throwable>()
  var refreshed = AuthTokens("access-refreshed", "refresh-refreshed")
  var verifiedTokens = AuthTokens("access-verified", "refresh-verified")
  var refreshFailure: Throwable? = null
  var logoutFailure: Throwable? = null
  var requestedPhone: String? = null
  var verified: Pair<String, String>? = null

  override suspend fun requestOtp(phone: String): OtpChallenge {
    requestedPhone = phone
    return OtpChallenge("123456")
  }

  override suspend fun verifyOtp(phone: String, code: String): AuthTokens {
    verified = phone to code
    return verifiedTokens
  }

  override suspend fun refresh(refreshToken: String): AuthTokens {
    refreshCalls += refreshToken
    refreshFailure?.let { throw it }
    return refreshed
  }

  override suspend fun me(accessToken: String): AuthUser {
    meCalls += accessToken
    meFailures[accessToken]?.let { throw it }
    return AuthUser("customer-1", "+996700123456", "customer")
  }

  override suspend fun logout(refreshToken: String) {
    logoutCalls += refreshToken
    logoutFailure?.let { throw it }
  }
}

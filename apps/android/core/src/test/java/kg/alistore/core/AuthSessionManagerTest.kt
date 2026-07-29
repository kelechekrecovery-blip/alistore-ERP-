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
    assertEquals("client:customer-1", store.principalId)
  }

  @Test
  fun verifyDoesNotPersistTokensWhenPrincipalValidationFails() = runTest {
    val store = FakeStore()
    val api = FakeAuthGateway().apply {
      meFailures[verifiedTokens.accessToken] = ApiException(403, "customer disabled")
    }

    val state = AuthSessionManager(api, store).verify("+996700123456", "123456")

    assertTrue(state is AuthState.Failed)
    assertNull(store.tokens)
    assertNull(store.principalId)
    assertEquals(0, store.saveCount)
    assertEquals(1, store.clearCount)
  }

  @Test
  fun emailLoginNormalizesAddressAndPersistsTokens() = runTest {
    val store = FakeStore()
    val api = FakeAuthGateway()
    val manager = AuthSessionManager(api, store)

    manager.requestEmailOtp("  User@Example.COM ")
    val state = manager.verifyEmail(" User@Example.COM ", " 123456 ")

    assertTrue(state is AuthState.SignedIn)
    assertEquals("user@example.com", api.requestedEmail)
    assertEquals("user@example.com" to "123456", api.verifiedEmail)
    assertEquals(api.verifiedTokens, store.tokens)
  }

  @Test
  fun emailLoginSurfacesServerCodeAsRussianText() = runTest {
    val store = FakeStore()
    val api = FakeAuthGateway().apply { verifyEmailFailure = ApiException(422, "Аккаунт не найден", "customer_not_found") }

    val state = AuthSessionManager(api, store).verifyEmail("user@example.com", "123456")

    assertEquals(
      "Аккаунт с такой почтой не найден. Войдите по телефону и привяжите адрес",
      (state as AuthState.Failed).message,
    )
    assertNull(store.tokens)
  }

  @Test
  fun emailAttachNormalizesAddressAndPassesAccessToken() = runTest {
    val api = FakeAuthGateway()
    val manager = AuthSessionManager(api, FakeStore(AuthTokens("access", "refresh")))

    manager.requestEmailAttach(" User@Example.COM ", "access")
    manager.confirmEmailAttach(" User@Example.COM ", " 123456 ", "access")

    assertEquals("user@example.com" to "access", api.attachRequested)
    assertEquals(Triple("user@example.com", "123456", "access"), api.attachConfirmed)
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

  @Test
  fun explicitlyRefreshesAndPersistsSessionForActiveApiFlows() = runTest {
    val store = FakeStore(AuthTokens("expired", "refresh-1"))
    val api = FakeAuthGateway().apply { refreshed = AuthTokens("access-2", "refresh-2") }
    val state = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), store.tokens!!)

    val refreshed = AuthSessionManager(api, store).refresh(state)

    assertTrue(refreshed is AuthState.SignedIn)
    assertEquals(AuthTokens("access-2", "refresh-2"), store.tokens)
    assertEquals(listOf("refresh-1"), api.refreshCalls)
  }
}

private class FakeStore(initial: AuthTokens? = null) : SessionStore {
  var tokens: AuthTokens? = initial
  var principalId: String? = null
  var saveCount = 0
  var clearCount = 0
  override fun saveSession(tokens: AuthTokens) { this.tokens = tokens; saveCount += 1 }
  override fun readSession(): AuthTokens? = tokens
  override fun saveAuthenticatedSession(tokens: AuthTokens, principalId: String) {
    this.tokens = tokens
    this.principalId = principalId
    saveCount += 1
  }
  override fun clear() { tokens = null; principalId = null; clearCount += 1 }
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
  var requestedEmail: String? = null
  var verifiedEmail: Pair<String, String>? = null
  var verifyEmailFailure: Throwable? = null
  var attachRequested: Pair<String, String>? = null
  var attachConfirmed: Triple<String, String, String>? = null

  override suspend fun requestOtp(phone: String): OtpChallenge {
    requestedPhone = phone
    return OtpChallenge("123456")
  }

  override suspend fun requestEmailOtp(email: String): EmailOtpChallenge {
    requestedEmail = email
    return EmailOtpChallenge("challenge-1", "123456")
  }

  override suspend fun verifyEmailOtp(email: String, code: String): AuthTokens {
    verifyEmailFailure?.let { throw it }
    verifiedEmail = email to code
    return verifiedTokens
  }

  override suspend fun requestEmailAttach(email: String, accessToken: String): EmailOtpChallenge {
    attachRequested = email to accessToken
    return EmailOtpChallenge("challenge-2", "654321")
  }

  override suspend fun confirmEmailAttach(email: String, code: String, accessToken: String) {
    attachConfirmed = Triple(email, code, accessToken)
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

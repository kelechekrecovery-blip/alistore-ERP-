package kg.alistore.core

import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthSessionManagerTest {
  @Test
  fun capabilityFailureHidesMethodsAndPreventsOtpRequest() = runTest {
    val api = FakeAuthGateway().apply { authMethodsFailure = ApiException(503, "unavailable") }
    val manager = AuthSessionManager(api, FakeStore(), FakeGoogleSignInProvider())

    manager.loadAuthMethods()
    val error = runCatching { manager.requestOtp("+996700123456") }.exceptionOrNull()

    assertEquals(CustomerAuthMethodsState.Unavailable, manager.authMethodsState)
    assertTrue(error?.message.orEmpty().contains("Не удалось проверить"))
    assertNull(api.requestedPhone)
  }

  @Test
  fun disabledPhoneEmailAndGoogleNeverReachLoginEndpoints() = runTest {
    val api = FakeAuthGateway().apply {
      methods = testAuthMethods(phone = false, email = false, google = false, googleClientId = null)
    }
    val manager = AuthSessionManager(api, FakeStore())

    val phoneError = runCatching { manager.requestOtp("+996700123456") }.exceptionOrNull()
    val emailError = runCatching { manager.requestEmailOtp("user@example.com") }.exceptionOrNull()
    val googleState = manager.loginWithGoogle(GoogleIdentityCredential("token", "nonce"))

    assertTrue(phoneError?.message.orEmpty().contains("телефону"))
    assertTrue(emailError?.message.orEmpty().contains("почте"))
    assertTrue((googleState as AuthState.Failed).message.contains("Google"))
    assertNull(api.requestedPhone)
    assertNull(api.requestedEmail)
    assertNull(api.googleLoginCall)
  }

  @Test
  fun disabledRecoveryNeverReachesRecoveryEndpoints() = runTest {
    val api = FakeAuthGateway().apply { methods = testAuthMethods(recovery = false) }
    val manager = AuthSessionManager(api, FakeStore())

    val requestError = runCatching { manager.requestRecoveryOtp("+996700123456") }.exceptionOrNull()
    val verifyState = manager.verifyRecovery("+996700123456", "123456")

    assertEquals("Восстановление доступа сейчас недоступно", requestError?.message)
    assertEquals(
      "Не удалось восстановить доступ. Проверьте код и попробуйте ещё раз",
      (verifyState as AuthState.Failed).message,
    )
    assertNull(api.requestedRecoveryPhone)
    assertNull(api.verifiedRecovery)
  }

  @Test
  fun unavailableCapabilitiesPreventRecoveryCalls() = runTest {
    val api = FakeAuthGateway().apply { authMethodsFailure = ApiException(503, "unavailable") }
    val manager = AuthSessionManager(api, FakeStore())

    val error = runCatching { manager.requestRecoveryOtp("+996700123456") }.exceptionOrNull()

    assertTrue(error?.message.orEmpty().contains("Не удалось проверить"))
    assertNull(api.requestedRecoveryPhone)
  }

  @Test
  fun recoveryRequestDoesNotExposeWhetherCustomerExists() = runTest {
    val api = FakeAuthGateway().apply {
      requestRecoveryFailure = ApiException(404, "Клиент не найден", "customer_not_found")
    }
    val manager = AuthSessionManager(api, FakeStore())

    val error = runCatching { manager.requestRecoveryOtp("+996700123456") }.exceptionOrNull()

    assertEquals("Не удалось отправить код восстановления. Попробуйте позже", error?.message)
    assertTrue(!error?.message.orEmpty().contains("найден", ignoreCase = true))
  }

  @Test
  fun googleNeedsApiConfirmedWebAudienceBeforeAccountPicker() = runTest {
    val api = FakeAuthGateway().apply {
      methods = testAuthMethods(google = true, googleClientId = null)
    }

    val state = AuthSessionManager(api, FakeStore(), FakeGoogleSignInProvider())
      .loginWithGoogle(GoogleIdentityCredential("token", "nonce"))

    assertTrue(state is AuthState.Failed)
    assertNull(api.googleLoginCall)
  }

  @Test
  fun googleRejectsBuildAudienceNotConfirmedByApi() = runTest {
    val api = FakeAuthGateway()
    val provider = FakeGoogleSignInProvider(serverClientId = "other-client.apps.googleusercontent.com")

    val state = AuthSessionManager(api, FakeStore(), provider)
      .loginWithGoogle(GoogleIdentityCredential("token", "nonce"))

    assertTrue(state is AuthState.Failed)
    assertNull(api.googleLoginCall)
  }

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
    assertEquals("phone-challenge", api.verifiedChallengeId)
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
  fun recoveryUsesPinnedChallengeAndPersistsValidatedReplacementSession() = runTest {
    val store = FakeStore()
    val api = FakeAuthGateway()
    val manager = AuthSessionManager(api, store)

    manager.requestRecoveryOtp(" +996 700-12-34-56 ")
    val state = manager.verifyRecovery(" +996 700-12-34-56 ", " 987654 ")

    assertTrue(state is AuthState.SignedIn)
    assertEquals("+996700123456", api.requestedRecoveryPhone)
    assertEquals("+996700123456" to "987654", api.verifiedRecovery)
    assertEquals("recovery-challenge", api.verifiedRecoveryChallengeId)
    assertEquals(api.recoveryTokens, store.tokens)
    assertEquals("client:customer-1", store.principalId)
  }

  @Test
  fun recoveryChallengeIdMismatchCannotPersistOrValidateSession() = runTest {
    val store = FakeStore()
    val api = FakeAuthGateway().apply {
      expectedRecoveryChallengeId = "different-challenge"
    }
    val manager = AuthSessionManager(api, store)

    manager.requestRecoveryOtp("+996700123456")
    val state = manager.verifyRecovery("+996700123456", "987654")

    assertTrue(state is AuthState.Failed)
    assertEquals("recovery-challenge", api.verifiedRecoveryChallengeId)
    assertNull(store.tokens)
    assertNull(store.principalId)
    assertEquals(0, store.saveCount)
  }

  @Test
  fun recoveryVerificationDoesNotExposeWhetherCustomerExists() = runTest {
    val api = FakeAuthGateway().apply {
      verifyRecoveryFailure = ApiException(404, "Клиент не найден", "customer_not_found")
    }
    val manager = AuthSessionManager(api, FakeStore())

    manager.requestRecoveryOtp("+996700123456")
    val state = manager.verifyRecovery("+996700123456", "987654")

    assertEquals(
      "Не удалось восстановить доступ. Проверьте код и попробуйте ещё раз",
      (state as AuthState.Failed).message,
    )
    assertTrue(!state.message.contains("найден", ignoreCase = true))
  }

  @Test
  fun recoveryVerificationRethrowsCancellationWithoutClearingSession() = runTest {
    val store = FakeStore()
    val api = FakeAuthGateway().apply {
      verifyRecoveryFailure = CancellationException("screen closed")
    }
    val manager = AuthSessionManager(api, store)

    manager.requestRecoveryOtp("+996700123456")
    val error = runCatching {
      manager.verifyRecovery("+996700123456", "987654")
    }.exceptionOrNull()

    assertTrue(error is CancellationException)
    assertEquals(0, store.clearCount)
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
    assertEquals("challenge-1", api.verifiedEmailChallengeId)
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
    assertEquals("challenge-2", api.attachChallengeId)
  }

  @Test
  fun existingGoogleIdentitySignsInAndPersistsSession() = runTest {
    val store = FakeStore()
    val api = FakeAuthGateway().apply {
      googleResult = SocialAuthResult.Authenticated(AuthTokens("google-access", "google-refresh"))
    }

    val state = AuthSessionManager(api, store, FakeGoogleSignInProvider()).loginWithGoogle(
      GoogleIdentityCredential("google-id-token", "raw-nonce"),
    )

    assertTrue(state is AuthState.SignedIn)
    assertEquals("google-id-token" to "raw-nonce", api.googleLoginCall)
    assertEquals(AuthTokens("google-access", "google-refresh"), store.tokens)
  }

  @Test
  fun newGoogleIdentityCompletesPhoneEnrollmentWithMemoryOnlyTicket() = runTest {
    val store = FakeStore()
    val api = FakeAuthGateway().apply {
      googleResult = SocialAuthResult.EnrollmentRequired("memory-ticket", 600)
      socialEnrollmentTokens = AuthTokens("enrolled-access", "enrolled-refresh")
    }
    val manager = AuthSessionManager(api, store, FakeGoogleSignInProvider())

    val enrollment = manager.loginWithGoogle(GoogleIdentityCredential("google-id-token", "raw-nonce"))
    assertTrue(enrollment is AuthState.SocialEnrollment)
    assertEquals(SocialProvider.GOOGLE, (enrollment as AuthState.SocialEnrollment).provider)
    assertNull(store.tokens)

    manager.requestSocialEnrollmentOtp(" +996 700-12-34-56 ")
    val signedIn = manager.completeSocialEnrollment("+996700123456", " 123456 ")

    assertTrue(signedIn is AuthState.SignedIn)
    assertEquals(
      listOf(SocialEnrollmentCall("memory-ticket", "+996700123456", "123456", "phone-challenge")),
      api.socialEnrollmentCalls,
    )
    assertEquals(AuthTokens("enrolled-access", "enrolled-refresh"), store.tokens)
  }

  @Test
  fun cancellingGoogleEnrollmentDestroysTicket() = runTest {
    val api = FakeAuthGateway().apply {
      googleResult = SocialAuthResult.EnrollmentRequired("memory-ticket", 600)
    }
    val manager = AuthSessionManager(api, FakeStore(), FakeGoogleSignInProvider())
    manager.loginWithGoogle(GoogleIdentityCredential("token", "nonce"))

    assertEquals(AuthState.Guest, manager.cancelSocialEnrollment())
    val result = manager.completeSocialEnrollment("+996700123456", "123456")

    assertTrue(result is AuthState.Failed)
    assertTrue(api.socialEnrollmentCalls.isEmpty())
  }

  @Test
  fun expiredGoogleEnrollmentDestroysMemoryTicket() = runTest {
    var clock = 1_000L
    val api = FakeAuthGateway().apply {
      googleResult = SocialAuthResult.EnrollmentRequired("memory-ticket", 10)
    }
    val manager = AuthSessionManager(api, FakeStore(), FakeGoogleSignInProvider(), nowMillis = { clock })
    val state = manager.loginWithGoogle(GoogleIdentityCredential("token", "nonce")) as AuthState.SocialEnrollment
    assertEquals(11_000L, state.expiresAtMillis)

    clock = 11_000L
    val error = runCatching { manager.requestSocialEnrollmentOtp("+996700123456") }.exceptionOrNull()

    assertTrue(error?.message.orEmpty().contains("истёк"))
    assertTrue(api.socialEnrollmentCalls.isEmpty())
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
  fun logoutAlsoClearsGoogleCredentialState() = runTest {
    val tokens = AuthTokens("access", "refresh")
    val provider = FakeGoogleSignInProvider()
    val manager = AuthSessionManager(FakeAuthGateway(), FakeStore(tokens), provider)
    val signedIn = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), tokens)

    assertEquals(AuthState.Guest, manager.logout(signedIn))

    assertEquals(1, provider.clearCalls)
  }

  @Test
  fun logoutCancellationStillClearsCredentialsAndIsRethrown() = runTest {
    val tokens = AuthTokens("access", "refresh")
    val api = FakeAuthGateway().apply { logoutFailure = CancellationException("cancelled") }
    val provider = FakeGoogleSignInProvider()
    val manager = AuthSessionManager(api, FakeStore(tokens), provider)
    val signedIn = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), tokens)

    assertEquals(AuthState.Guest, manager.beginLogout())
    val cancellation = runCatching { manager.finishLogout(signedIn) }.exceptionOrNull()

    assertTrue(cancellation is CancellationException)
    assertEquals(1, provider.clearCalls)
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

  @Test
  fun concurrentRefreshesShareOneRotatingTokenExchange() = runTest {
    val tokens = AuthTokens("expired", "refresh-1")
    val store = FakeStore(tokens)
    val gate = CompletableDeferred<Unit>()
    val api = FakeAuthGateway().apply {
      refreshed = AuthTokens("access-2", "refresh-2")
      refreshGate = gate
    }
    val manager = AuthSessionManager(api, store)
    val state = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), tokens)

    val first = async { manager.refresh(state) }
    api.refreshStarted.await()
    val second = async { manager.refresh(state) }
    gate.complete(Unit)

    assertEquals(first.await(), second.await())
    assertEquals(listOf("refresh-1"), api.refreshCalls)
    assertEquals(AuthTokens("access-2", "refresh-2"), store.tokens)
  }

  @Test
  fun cancellingFirstWaiterDoesNotCancelRefreshExchangeOrPersistence() = runTest {
    val tokens = AuthTokens("expired", "refresh-1")
    val store = FakeStore(tokens)
    val meGate = CompletableDeferred<Unit>()
    val api = FakeAuthGateway().apply {
      refreshed = AuthTokens("access-2", "refresh-2")
      meGates["access-2"] = meGate
    }
    val manager = AuthSessionManager(api, store)
    val state = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), tokens)

    val firstWaiter = launch { manager.refresh(state) }
    api.meStarted.await()
    val survivingWaiter = async { manager.refresh(state) }
    firstWaiter.cancel()
    meGate.complete(Unit)

    val refreshed = survivingWaiter.await()
    assertTrue(refreshed is AuthState.SignedIn)
    assertEquals(listOf("refresh-1"), api.refreshCalls)
    assertEquals(AuthTokens("access-2", "refresh-2"), store.tokens)
  }

  @Test
  fun logoutDuringHeldRefreshClearsLocallyBeforeRevokeAndCannotResurrect() = runTest {
    val tokens = AuthTokens("expired", "refresh-1")
    val store = FakeStore(tokens)
    val meGate = CompletableDeferred<Unit>()
    val logoutGate = CompletableDeferred<Unit>()
    val api = FakeAuthGateway().apply {
      refreshed = AuthTokens("access-2", "refresh-2")
      meGates["access-2"] = meGate
      this.logoutGate = logoutGate
    }
    val manager = AuthSessionManager(api, store)
    val state = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), tokens)

    val refresh = async { manager.refresh(state) }
    api.meStarted.await()
    val logout = async { manager.logout(state) }
    api.logoutStarted.await()

    assertNull(store.tokens)
    logoutGate.complete(Unit)
    assertEquals(AuthState.Guest, logout.await())
    meGate.complete(Unit)
    runCatching { refresh.await() }

    assertNull(store.tokens)
    assertEquals(listOf("refresh-1"), api.refreshCalls)
    assertEquals(listOf("refresh-1"), api.logoutCalls)
  }

  @Test
  fun newLoginDuringHeldRefreshWinsAndOldSessionCannotResurrect() = runTest {
    val oldTokens = AuthTokens("expired", "refresh-1")
    val newTokens = AuthTokens("new-access", "new-refresh")
    val store = FakeStore(oldTokens)
    val meGate = CompletableDeferred<Unit>()
    val api = FakeAuthGateway().apply {
      refreshed = AuthTokens("stale-access", "stale-refresh")
      verifiedTokens = newTokens
      meGates["stale-access"] = meGate
      meUsers["new-access"] = AuthUser("customer-new", "+996555000000", "customer")
    }
    val manager = AuthSessionManager(api, store)
    val oldState = AuthState.SignedIn(AuthUser("customer-old", "+996700123456", "customer"), oldTokens)

    val refresh = async { manager.refresh(oldState) }
    api.meStarted.await()
    val signedIn = manager.verify("+996555000000", "123456")
    meGate.complete(Unit)
    runCatching { refresh.await() }

    assertTrue(signedIn is AuthState.SignedIn)
    assertEquals(newTokens, store.tokens)
    assertEquals("client:customer-new", store.principalId)
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
  var verifiedChallengeId: String? = null
  var requestedRecoveryPhone: String? = null
  var requestRecoveryFailure: Throwable? = null
  var verifiedRecovery: Pair<String, String>? = null
  var verifiedRecoveryChallengeId: String? = null
  var expectedRecoveryChallengeId: String? = "recovery-challenge"
  var recoveryTokens = AuthTokens("recovery-access", "recovery-refresh")
  var verifyRecoveryFailure: Throwable? = null
  var requestedEmail: String? = null
  var verifiedEmail: Pair<String, String>? = null
  var verifiedEmailChallengeId: String? = null
  var verifyEmailFailure: Throwable? = null
  var attachRequested: Pair<String, String>? = null
  var attachConfirmed: Triple<String, String, String>? = null
  var attachChallengeId: String? = null
  var refreshGate: CompletableDeferred<Unit>? = null
  val refreshStarted = CompletableDeferred<Unit>()
  val meGates = mutableMapOf<String, CompletableDeferred<Unit>>()
  val meUsers = mutableMapOf<String, AuthUser>()
  val meStarted = CompletableDeferred<Unit>()
  var logoutGate: CompletableDeferred<Unit>? = null
  val logoutStarted = CompletableDeferred<Unit>()
  var googleResult: SocialAuthResult = SocialAuthResult.Authenticated(verifiedTokens)
  var googleLoginCall: Pair<String, String>? = null
  var socialEnrollmentTokens = verifiedTokens
  val socialEnrollmentCalls = mutableListOf<SocialEnrollmentCall>()
  var methods = testAuthMethods()
  var authMethodsFailure: Throwable? = null

  override suspend fun authMethods(): CustomerAuthMethods {
    authMethodsFailure?.let { throw it }
    return methods
  }

  override suspend fun requestOtp(phone: String): OtpChallenge {
    requestedPhone = phone
    return OtpChallenge("123456", "phone-challenge")
  }

  override suspend fun requestRecoveryOtp(phone: String): OtpChallenge {
    requestRecoveryFailure?.let { throw it }
    requestedRecoveryPhone = phone
    return OtpChallenge("987654", "recovery-challenge")
  }

  override suspend fun verifyRecoveryOtp(phone: String, code: String, challengeId: String?): AuthTokens {
    verifyRecoveryFailure?.let { throw it }
    verifiedRecovery = phone to code
    verifiedRecoveryChallengeId = challengeId
    if (challengeId != expectedRecoveryChallengeId) throw ApiException(422, "Код не найден", "otp_not_found")
    return recoveryTokens
  }

  override suspend fun requestEmailOtp(email: String): EmailOtpChallenge {
    requestedEmail = email
    return EmailOtpChallenge("challenge-1", "123456")
  }

  override suspend fun verifyEmailOtp(email: String, code: String, challengeId: String?): AuthTokens {
    verifyEmailFailure?.let { throw it }
    verifiedEmail = email to code
    verifiedEmailChallengeId = challengeId
    return verifiedTokens
  }

  override suspend fun requestEmailAttach(email: String, accessToken: String): EmailOtpChallenge {
    attachRequested = email to accessToken
    return EmailOtpChallenge("challenge-2", "654321")
  }

  override suspend fun confirmEmailAttach(email: String, code: String, accessToken: String, challengeId: String?) {
    attachConfirmed = Triple(email, code, accessToken)
    attachChallengeId = challengeId
  }

  override suspend fun verifyOtp(phone: String, code: String, challengeId: String?): AuthTokens {
    verified = phone to code
    verifiedChallengeId = challengeId
    return verifiedTokens
  }

  override suspend fun refresh(refreshToken: String): AuthTokens {
    refreshCalls += refreshToken
    refreshStarted.complete(Unit)
    refreshGate?.await()
    refreshFailure?.let { throw it }
    return refreshed
  }

  override suspend fun me(accessToken: String): AuthUser {
    meCalls += accessToken
    meGates[accessToken]?.let {
      meStarted.complete(Unit)
      it.await()
    }
    meFailures[accessToken]?.let { throw it }
    return meUsers[accessToken] ?: AuthUser("customer-1", "+996700123456", "customer")
  }

  override suspend fun logout(refreshToken: String) {
    logoutCalls += refreshToken
    logoutStarted.complete(Unit)
    logoutGate?.await()
    logoutFailure?.let { throw it }
  }

  override suspend fun googleLogin(identityToken: String, nonce: String): SocialAuthResult {
    googleLoginCall = identityToken to nonce
    return googleResult
  }

  override suspend fun completeSocialEnrollment(
    enrollmentToken: String,
    phone: String,
    code: String,
    challengeId: String?,
  ): AuthTokens {
    socialEnrollmentCalls += SocialEnrollmentCall(enrollmentToken, phone, code, challengeId)
    return socialEnrollmentTokens
  }
}

private data class SocialEnrollmentCall(
  val enrollmentToken: String,
  val phone: String,
  val code: String,
  val challengeId: String?,
)

private class FakeGoogleSignInProvider(
  override val serverClientId: String? = "google-web.apps.googleusercontent.com",
) : GoogleSignInProvider {
  var clearCalls = 0
  override suspend fun signIn() = GoogleIdentityCredential("token", "nonce")
  override suspend fun clearCredentialState() { clearCalls += 1 }
}

private fun testAuthMethods(
  phone: Boolean = true,
  email: Boolean = true,
  google: Boolean = true,
  googleClientId: String? = "google-web.apps.googleusercontent.com",
  recovery: Boolean = true,
): CustomerAuthMethods = CustomerAuthMethods(
  phone = CustomerAuthMethodAvailability(phone, phone),
  email = CustomerAuthMethodAvailability(email, false),
  google = CustomerSocialAuthMethodAvailability(google, google && phone, googleClientId),
  recovery = CustomerRecoveryAuthMethodAvailability(recovery),
  anyLoginAvailable = phone || email || google,
  registrationAvailable = phone || (google && phone),
)

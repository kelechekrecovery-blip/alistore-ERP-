package kg.alistore.core

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StaffSessionManagerTest {
  @Test
  fun loginStoresTokenAndUsesServerPrincipal() = runTest {
    val store = MemoryStaffStore()
    val api = FakeStaffAuthGateway()
    val state = StaffSessionManager(api, store).login(" seller ", "secret")

    assertTrue(state is StaffAuthState.SignedIn)
    val signedIn = state as StaffAuthState.SignedIn
    assertEquals("staff-token", store.tokens?.accessToken)
    assertEquals("staff-refresh", store.tokens?.refreshToken)
    assertEquals("staff:staff-1", store.principalId)
    assertEquals("seller", signedIn.session.username)
    assertEquals("seller", signedIn.session.role)
    assertEquals(listOf("seller"), api.loginNames)
  }

  @Test
  fun restoreRevalidatesStoredToken() = runTest {
    val store = MemoryStaffStore(AuthTokens("stored-token", "stored-refresh"))
    val api = FakeStaffAuthGateway()
    val state = StaffSessionManager(api, store).restore()

    assertTrue(state is StaffAuthState.SignedIn)
    assertEquals(listOf("stored-token"), api.meTokens)
  }

  @Test
  fun loginDoesNotPersistTokenWhenPrincipalValidationFails() = runTest {
    val store = MemoryStaffStore()

    val state = StaffSessionManager(FakeStaffAuthGateway(rejectMe = true), store)
      .login("seller", "secret")

    assertTrue(state is StaffAuthState.Failed)
    assertNull(store.tokens)
    assertNull(store.principalId)
    assertEquals(0, store.saveCount)
    assertEquals(1, store.clearCount)
  }

  @Test
  fun rejectedStoredTokenIsCleared() = runTest {
    val store = MemoryStaffStore(AuthTokens("revoked-token", "revoked-refresh"))
    val state = StaffSessionManager(FakeStaffAuthGateway(rejectMe = true), store).restore()

    assertTrue(state is StaffAuthState.Failed)
    assertNull(store.tokens)
  }

  @Test
  fun totpChallengeIsRetriedWithAuthenticatorCode() = runTest {
    val api = FakeStaffAuthGateway(requireTotp = true)
    val manager = StaffSessionManager(api, MemoryStaffStore())

    val challenged = manager.login("seller", "secret")
    assertTrue(challenged is StaffAuthState.Failed)
    assertTrue(manager.requiresTotp)

    val signedIn = manager.login("seller", "secret", " 123456 ")
    assertTrue(signedIn is StaffAuthState.SignedIn)
    assertEquals(listOf(null, "123456"), api.loginTotps)
    assertTrue(!manager.requiresTotp)
  }

  @Test
  fun restoreRotatesExpiredAccessAndPersistsFreshPair() = runTest {
    val store = MemoryStaffStore(AuthTokens("expired-access", "refresh-1"))
    val api = FakeStaffAuthGateway(expiredTokens = mutableSetOf("expired-access"))

    val state = StaffSessionManager(api, store).restore()

    assertTrue(state is StaffAuthState.SignedIn)
    assertEquals(listOf("refresh-1"), api.refreshTokens)
    assertEquals("staff-token-2", store.tokens?.accessToken)
    assertEquals("staff-refresh-2", store.tokens?.refreshToken)
  }

  @Test
  fun concurrentStyleUnauthorizedCallbacksReuseSingleRotation() = runTest {
    val store = MemoryStaffStore(AuthTokens("expired-access", "refresh-1"))
    val api = FakeStaffAuthGateway()
    StaffSessionManager(api, store)

    val first = api.unauthorizedHandler?.invoke("expired-access")
    val second = api.unauthorizedHandler?.invoke("expired-access")

    assertEquals("staff-token-2", first)
    assertEquals("staff-token-2", second)
    assertEquals(listOf("refresh-1"), api.refreshTokens)
  }

  @Test
  fun logoutWhileRefreshIsSuspendedCannotResurrectSession() = runTest {
    val started = CompletableDeferred<Unit>()
    val release = CompletableDeferred<Unit>()
    val store = MemoryStaffStore(AuthTokens("expired-access", "refresh-1"))
    val api = FakeStaffAuthGateway(refreshStarted = started, releaseRefresh = release)
    val manager = StaffSessionManager(api, store)

    val refresh = async { api.unauthorizedHandler?.invoke("expired-access") }
    started.await()
    assertTrue(manager.beginLogout() is StaffAuthState.SignedOut)
    release.complete(Unit)

    assertNull(refresh.await())
    assertNull(store.tokens)
    assertTrue(!manager.sessionInvalidated)
  }

  @Test
  fun terminalRefreshFailureIsExposedToAppRoot() = runTest {
    val store = MemoryStaffStore(AuthTokens("expired-access", "refresh-1"))
    val api = FakeStaffAuthGateway(refreshFailure = ApiException(401, "Refresh revoked"))
    val manager = StaffSessionManager(api, store)

    assertNull(api.unauthorizedHandler?.invoke("expired-access"))

    assertNull(store.tokens)
    assertTrue(manager.sessionInvalidated)
  }

  @Test
  fun transientRefreshFailurePreservesDurableSession() = runTest {
    val store = MemoryStaffStore(AuthTokens("expired-access", "refresh-1"))
    val api = FakeStaffAuthGateway(refreshFailure = IOException("timeout"))
    val manager = StaffSessionManager(api, store)

    assertNull(api.unauthorizedHandler?.invoke("expired-access"))

    assertEquals("refresh-1", store.tokens?.refreshToken)
    assertTrue(!manager.sessionInvalidated)
  }

  @Test
  fun coldRestorePreservesDurableSessionWhenRefreshTimesOut() = runTest {
    val store = MemoryStaffStore(AuthTokens("expired-access", "refresh-1"))
    val api = FakeStaffAuthGateway(
      expiredTokens = mutableSetOf("expired-access"),
      refreshFailure = IOException("timeout"),
    )

    val state = StaffSessionManager(api, store).restore()

    assertTrue(state is StaffAuthState.Failed)
    assertEquals("expired-access", store.tokens?.accessToken)
    assertEquals("refresh-1", store.tokens?.refreshToken)
    assertEquals(0, store.clearCount)
  }

  @Test
  fun externalWorkerClearInvalidatesForegroundManager() = runTest {
    val store = MemoryStaffStore()
    val manager = StaffSessionManager(FakeStaffAuthGateway(), store)
    assertTrue(manager.login("seller", "secret") is StaffAuthState.SignedIn)
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
      manager.monitorExternalSessionChanges()
    }

    store.clear()
    advanceUntilIdle()

    assertTrue(manager.sessionInvalidated)
  }

  @Test
  fun workerContinuesWithRotatedSnapshotForSamePrincipal() {
    val owner = QueueOwner.staff("staff-1")
    val old = SecureSessionSnapshot("old-access", "old-refresh", owner, 1)
    val rotated = SecureSessionSnapshot("fresh-access", "fresh-refresh", owner, 2)

    assertEquals(rotated, selectWorkerSession(old, previousStillCurrent = false, persisted = rotated))
    assertNull(
      selectWorkerSession(
        old,
        previousStillCurrent = false,
        persisted = rotated.copy(queueOwner = QueueOwner.staff("staff-2")),
      ),
    )
  }

  @Test
  fun logoutClearsLocallyBeforeRevokingRefreshToken() = runTest {
    val store = MemoryStaffStore()
    val api = FakeStaffAuthGateway()
    val manager = StaffSessionManager(api, store)
    val signedIn = manager.login("seller", "secret") as StaffAuthState.SignedIn

    assertTrue(manager.beginLogout() is StaffAuthState.SignedOut)
    assertNull(store.tokens)
    manager.finishLogout(signedIn.session)

    assertEquals(listOf("staff-refresh"), api.logoutTokens)
  }
}

private class MemoryStaffStore(var tokens: AuthTokens? = null) : StaffSessionStore {
  var principalId: String? = null
  var saveCount = 0
  var clearCount = 0
  private var generation = 0L
  private var owner = QueueOwner.staff("staff-1")
  private val changes = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
  override val sessionChanges: Flow<Unit> = changes
  override fun readSession(): AuthTokens? = tokens
  override fun readStaffSessionSnapshot(): SecureSessionSnapshot? = tokens?.let {
    SecureSessionSnapshot(it.accessToken, it.refreshToken, owner, generation)
  }
  override fun isCurrent(snapshot: SecureSessionSnapshot): Boolean =
    snapshot.generation == generation && snapshot.queueOwner == owner && tokens != null
  override fun replaceStaffSession(snapshot: SecureSessionSnapshot, tokens: AuthTokens): SecureSessionSnapshot? {
    if (!isCurrent(snapshot)) return null
    this.tokens = tokens
    generation += 1
    return readStaffSessionSnapshot()
  }
  override fun saveAuthenticatedSession(tokens: AuthTokens, principalId: String) {
    this.tokens = tokens
    this.principalId = principalId
    owner = QueueOwner.fromStorageKey(principalId)
    generation += 1
    saveCount += 1
  }
  override fun clear() {
    tokens = null
    principalId = null
    generation += 1
    clearCount += 1
    changes.tryEmit(Unit)
  }
}

private class FakeStaffAuthGateway(
  private val rejectMe: Boolean = false,
  private val requireTotp: Boolean = false,
  private val expiredTokens: MutableSet<String> = mutableSetOf(),
  private val refreshStarted: CompletableDeferred<Unit>? = null,
  private val releaseRefresh: CompletableDeferred<Unit>? = null,
  private val refreshFailure: Throwable? = null,
) : StaffAuthGateway {
  val loginNames = mutableListOf<String>()
  val loginTotps = mutableListOf<String?>()
  val meTokens = mutableListOf<String>()
  val refreshTokens = mutableListOf<String>()
  val logoutTokens = mutableListOf<String>()
  var unauthorizedHandler: (suspend (String) -> String?)? = null

  override suspend fun staffLogin(username: String, password: String, totp: String?): StaffSession {
    loginNames += username
    loginTotps += totp
    if (requireTotp && totp == null) throw ApiException(401, "Нужен код", "totp_required")
    return StaffSession("staff-token", "staff-1", username, "seller", false, refreshToken = "staff-refresh")
  }

  override suspend fun staffMe(accessToken: String): StaffPrincipal {
    meTokens += accessToken
    if (rejectMe || expiredTokens.remove(accessToken)) throw ApiException(401, "Сессия истекла")
    return StaffPrincipal("staff-1", "seller", "seller", true, false, "staff")
  }

  override suspend fun staffRefresh(refreshToken: String): StaffSession {
    refreshTokens += refreshToken
    refreshStarted?.complete(Unit)
    releaseRefresh?.await()
    refreshFailure?.let { throw it }
    return StaffSession(
      "staff-token-2", "staff-1", "seller", "seller", false,
      refreshToken = "staff-refresh-2",
    )
  }

  override suspend fun staffLogout(refreshToken: String) {
    logoutTokens += refreshToken
  }

  override fun installStaffUnauthorizedHandler(handler: suspend (failedAccessToken: String) -> String?) {
    unauthorizedHandler = handler
  }
}

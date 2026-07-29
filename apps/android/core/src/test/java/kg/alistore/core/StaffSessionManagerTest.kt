package kg.alistore.core

import kotlinx.coroutines.test.runTest
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
    assertEquals("staff-token", store.token)
    assertEquals("staff:staff-1", store.principalId)
    assertEquals("seller", signedIn.session.username)
    assertEquals("seller", signedIn.session.role)
    assertEquals(listOf("seller"), api.loginNames)
  }

  @Test
  fun restoreRevalidatesStoredToken() = runTest {
    val store = MemoryStaffStore("stored-token")
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
    assertNull(store.token)
    assertNull(store.principalId)
    assertEquals(0, store.saveCount)
    assertEquals(1, store.clearCount)
  }

  @Test
  fun rejectedStoredTokenIsCleared() = runTest {
    val store = MemoryStaffStore("revoked-token")
    val state = StaffSessionManager(FakeStaffAuthGateway(rejectMe = true), store).restore()

    assertTrue(state is StaffAuthState.Failed)
    assertNull(store.token)
  }
}

private class MemoryStaffStore(var token: String? = null) : StaffSessionStore {
  var principalId: String? = null
  var saveCount = 0
  var clearCount = 0
  override fun saveToken(token: String) { this.token = token; saveCount += 1 }
  override fun readToken(): String? = token
  override fun saveAuthenticatedToken(token: String, principalId: String) {
    this.token = token
    this.principalId = principalId
    saveCount += 1
  }
  override fun clear() { token = null; principalId = null; clearCount += 1 }
}

private class FakeStaffAuthGateway(private val rejectMe: Boolean = false) : StaffAuthGateway {
  val loginNames = mutableListOf<String>()
  val meTokens = mutableListOf<String>()

  override suspend fun staffLogin(username: String, password: String): StaffSession {
    loginNames += username
    return StaffSession("staff-token", "staff-1", username, "seller", false)
  }

  override suspend fun staffMe(accessToken: String): StaffPrincipal {
    meTokens += accessToken
    if (rejectMe) throw ApiException(403, "Сотрудник отключён")
    return StaffPrincipal("staff-1", "seller", "seller", true, false, "staff")
  }
}

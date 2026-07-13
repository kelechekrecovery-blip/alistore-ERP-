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
  fun rejectedStoredTokenIsCleared() = runTest {
    val store = MemoryStaffStore("revoked-token")
    val state = StaffSessionManager(FakeStaffAuthGateway(rejectMe = true), store).restore()

    assertTrue(state is StaffAuthState.Failed)
    assertNull(store.token)
  }
}

private class MemoryStaffStore(var token: String? = null) : StaffSessionStore {
  override fun saveToken(token: String) { this.token = token }
  override fun readToken(): String? = token
  override fun clear() { token = null }
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

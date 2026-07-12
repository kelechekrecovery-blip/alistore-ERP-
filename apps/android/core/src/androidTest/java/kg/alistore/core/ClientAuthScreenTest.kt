package kg.alistore.core

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import org.junit.Rule
import org.junit.Test

class ClientAuthScreenTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun guestRequestsOtpAndReceivesDevCode() {
    val manager = AuthSessionManager(UiAuthGateway(), UiSessionStore())
    compose.setContent {
      MaterialTheme {
        ClientAccount(AuthState.Guest, manager, {}, 0, 0)
      }
    }

    compose.onNodeWithTag("auth-phone").performTextReplacement("+996700123456")
    compose.onNodeWithTag("auth-action").assertIsEnabled().performClick()
    compose.waitUntil(5_000) {
      runCatching { compose.onNodeWithTag("auth-code").fetchSemanticsNode() }.isSuccess
    }
    compose.onNodeWithTag("auth-code").assertIsDisplayed().assertTextContains("123456")
    compose.onNodeWithTag("auth-action").assertIsEnabled().assertTextContains("Войти")
  }

  @Test
  fun signedInAccountShowsIdentityAndLogout() {
    val tokens = AuthTokens("access", "refresh")
    val state = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), tokens)
    compose.setContent {
      MaterialTheme {
        ClientAccount(state, AuthSessionManager(UiAuthGateway(), UiSessionStore(tokens)), {}, 2, 1)
      }
    }

    compose.onNodeWithTag("account-title").assertIsDisplayed()
    compose.onNodeWithTag("auth-logout").assertIsDisplayed().assertTextContains("Выйти")
  }
}

private class UiSessionStore(private var tokens: AuthTokens? = null) : SessionStore {
  override fun saveSession(tokens: AuthTokens) { this.tokens = tokens }
  override fun readSession(): AuthTokens? = tokens
  override fun clear() { tokens = null }
}

private class UiAuthGateway : AuthGateway {
  override suspend fun requestOtp(phone: String) = OtpChallenge("123456")
  override suspend fun verifyOtp(phone: String, code: String) = AuthTokens("access", "refresh")
  override suspend fun refresh(refreshToken: String) = AuthTokens("access", "refresh")
  override suspend fun me(accessToken: String) = AuthUser("customer-1", "+996700123456", "customer")
  override suspend fun logout(refreshToken: String) = Unit
}

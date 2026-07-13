package kg.alistore.core

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.assertEquals

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

  @Test
  fun courierCheckoutRequiresAddressAndShowsCartTotal() {
    val tokens = AuthTokens("access", "refresh")
    val state = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), tokens)
    val product = Product("product-1", "PHONE-1", "AliStore Phone", 125000, "phones", 2)
    compose.setContent {
      MaterialTheme {
        ClientCheckout("http://10.0.2.2:4000/api", listOf(product), mapOf(product.id to 2), state, { _, _ -> }, {}, {})
      }
    }

    compose.onNodeWithTag("checkout-total").assertTextEquals("250000 сом")
    compose.onNodeWithText("Курьер").performClick()
    compose.onNodeWithTag("checkout-submit").assertIsNotEnabled()
    compose.onNodeWithTag("checkout-address").performTextReplacement("Бишкек, Киевская 95")
    compose.onNodeWithTag("checkout-submit").assertIsEnabled()
  }

  @Test
  fun orderHistoryShowsServerStatusAndTotal() {
    val tokens = AuthTokens("access", "refresh")
    val state = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), tokens)
    val order = CustomerOrder(
      "order-12345678", "awaiting_payment", 125000, "pickup", "BISHKEK-1", null,
      listOf(CustomerOrderItem("PHONE-1", 1, 125000)), "2026-07-13T01:30:00.000Z",
    )
    compose.setContent {
      MaterialTheme {
        ClientOrdersScreen(
          "https://api.alistore.kg/api", state, 1, {}, providedGateway = UiOrdersGateway(listOf(order)),
        )
      }
    }

    compose.waitUntil(5_000) {
      runCatching { compose.onNodeWithTag("order-order-12345678").fetchSemanticsNode() }.isSuccess
    }
    compose.onNodeWithTag("orders-title").assertIsDisplayed()
    compose.onNodeWithText("Ожидает оплаты").assertIsDisplayed()
    compose.onNodeWithText("1 тов. · 125000 сом").assertIsDisplayed()
  }

  @Test
  fun ownedDeviceOpensWarrantyWithSameKeyAfterTokenRefresh() {
    val tokens = AuthTokens("access", "refresh")
    val state = AuthState.SignedIn(AuthUser("customer-1", "+996700123456", "customer"), tokens)
    val device = CustomerDevice("123456789012345", "iPhone 16 Pro", "sold", "2027-07-13", 365, null)
    val gateway = UiDevicesGateway(listOf(device), failFirstOpen = true)
    compose.setContent {
      MaterialTheme {
        ClientDevicesScreen(
          "https://api.alistore.kg/api",
          state,
          {},
          providedGateway = gateway,
          authManager = AuthSessionManager(UiAuthGateway(), UiSessionStore(tokens)),
        )
      }
    }

    compose.waitUntil(5_000) {
      runCatching { compose.onNodeWithTag("device-123456789012345").fetchSemanticsNode() }.isSuccess
    }
    compose.onNodeWithTag("device-123456789012345").performClick()
    compose.onNodeWithTag("warranty-problem").performTextReplacement("Не держит заряд")
    compose.onNodeWithTag("warranty-submit").assertIsEnabled().performClick()
    compose.waitUntil(5_000) {
      runCatching { compose.onNodeWithTag("warranty-status").fetchSemanticsNode() }.isSuccess
    }
    compose.onNodeWithText("Создано").assertIsDisplayed()
    assertEquals(2, gateway.openKeys.size)
    assertEquals(gateway.openKeys[0], gateway.openKeys[1])
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

private class UiOrdersGateway(private val result: List<CustomerOrder>) : CustomerOrdersGateway {
  override suspend fun orders(token: String) = result
}

private class UiDevicesGateway(
  private val result: List<CustomerDevice>,
  private val failFirstOpen: Boolean = false,
) : CustomerDevicesGateway {
  val openKeys = mutableListOf<String>()
  override suspend fun devices(token: String) = result
  override suspend fun openWarranty(request: OpenWarrantyRequest, token: String, idempotencyKey: String): WarrantyCase {
    openKeys += idempotencyKey
    if (failFirstOpen && openKeys.size == 1) throw ApiException(401, "expired")
    return WarrantyCase("warranty-1", request.imei, request.customerId, request.problem, "created", "2026-07-27T00:00:00.000Z")
  }
}

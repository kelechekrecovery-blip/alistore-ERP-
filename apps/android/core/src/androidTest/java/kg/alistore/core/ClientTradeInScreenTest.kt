package kg.alistore.core

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test

class ClientTradeInScreenTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun tradeInSubmissionUsesOwnerSessionAndKeepsKeyAfterRefresh() {
    val state = AuthState.SignedIn(
      AuthUser("customer-1", "+996700123456", "customer"),
      AuthTokens("access", "refresh"),
    )
    val gateway = UiTradeInsGateway(failFirstOpen = true)
    compose.setContent {
      MaterialTheme {
        ClientTradeInsScreen(
          "https://api.alistore.kg/api",
          state,
          {},
          providedGateway = gateway,
          authManager = AuthSessionManager(TradeInAuthGateway(), TradeInSessionStore(state.tokens)),
        )
      }
    }

    compose.waitUntil(5_000) {
      runCatching { compose.onNodeWithTag("tradein-model").fetchSemanticsNode() }.isSuccess
    }
    compose.onNodeWithTag("tradein-model").performTextReplacement("iPhone 15 Pro")
    compose.onNodeWithTag("tradein-imei").performTextReplacement("123456789012345")
    compose.onNodeWithTag("tradein-passport").performTextReplacement("ID1234567")
    compose.onNodeWithTag("tradein-price").performTextReplacement("55000")
    compose.onNodeWithTag("tradein-submit").assertIsEnabled().performClick()
    compose.waitUntil(5_000) {
      runCatching { compose.onNodeWithTag("tradein-created").fetchSemanticsNode() }.isSuccess
    }

    compose.onNodeWithText("Заявка принята").assertIsDisplayed()
    assertEquals(2, gateway.openKeys.size)
    assertEquals(gateway.openKeys[0], gateway.openKeys[1])
    assertEquals("customer-1", gateway.requests.last().customerId)
    assertFalse(gateway.requests.last().toJson().has("customerId"))
  }
}

private class UiTradeInsGateway(
  private val failFirstOpen: Boolean,
) : CustomerTradeInsGateway {
  val openKeys = mutableListOf<String>()
  val requests = mutableListOf<CustomerTradeInRequestSnapshot>()

  override suspend fun tradeIns(token: String) = emptyList<CustomerTradeIn>()

  override suspend fun uploadEvidence(entityType: String, entityId: String, fileName: String, mimeType: String, bytes: ByteArray, token: String) =
    EvidenceAttachment("evidence/tradein/$entityId/photo.webp", "https://media.alistore.kg/evidence.webp")

  override suspend fun createTradeIn(request: CreateTradeInRequest, token: String, idempotencyKey: String): CustomerTradeIn {
    openKeys += idempotencyKey
    requests += CustomerTradeInRequestSnapshot("customer-1", request)
    if (failFirstOpen && openKeys.size == 1) throw ApiException(401, "expired")
    return CustomerTradeIn(
      id = "tradein-1",
      customerId = "customer-1",
      model = request.model,
      imei = request.imei,
      grade = request.grade,
      price = request.price,
      contractId = "TI-20260717-ABC123",
      sellerPassportMasked = "ID1***67",
    )
  }
}

private data class CustomerTradeInRequestSnapshot(val customerId: String, val request: CreateTradeInRequest) {
  val model: String get() = request.model
  val imei: String? get() = request.imei
  val grade: String get() = request.grade
  val price: Int get() = request.price
  val sellerPassport: String get() = request.sellerPassport
  fun toJson() = request.toJson()
}

private class TradeInSessionStore(private var tokens: AuthTokens?) : SessionStore {
  override fun saveSession(tokens: AuthTokens) { this.tokens = tokens }
  override fun readSession(): AuthTokens? = tokens
  override fun clear() { tokens = null }
}

private class TradeInAuthGateway : AuthGateway {
  override suspend fun requestOtp(phone: String) = OtpChallenge(null)
  override suspend fun verifyOtp(phone: String, code: String) = AuthTokens("access", "refresh")
  override suspend fun refresh(refreshToken: String) = AuthTokens("access-refreshed", "refresh-refreshed")
  override suspend fun me(accessToken: String) = AuthUser("customer-1", "+996700123456", "customer")
  override suspend fun logout(refreshToken: String) = Unit
}

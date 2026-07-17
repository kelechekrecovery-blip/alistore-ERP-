package kg.alistore.core

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class ClientProductDetailScreenTest {
  @get:Rule val compose = createComposeRule()

  private val phone = Product("phone", "PHONE-17", "iPhone 17 Pro Max", 139_900, "phones", 3)
  private val variant = Product("phone-white", "PHONE-17-W", "iPhone 17 Pro Max White", 139_900, "phones", 2)

  @Test
  fun rendersServerDetailAndRoutesActions() {
    var opened: String? = null
    var cartId: String? = null
    compose.setContent {
      MaterialTheme {
        ClientProductDetailContent(
          detail = CatalogProductDetail(phone, variants = listOf(variant), related = listOf(variant)),
          favorite = false,
          inCart = false,
          onFavorite = {},
          onCart = { cartId = it },
          onBack = {},
          onOpenProduct = { opened = it },
          apiBaseUrl = "https://api.alistore.kg/api",
        )
      }
    }

    compose.onNodeWithText("iPhone 17 Pro Max").assertIsDisplayed()
    compose.onAllNodesWithText("139900 сом").onFirst().assertIsDisplayed()
    compose.onNodeWithTag("product-detail-cart").performClick()
    compose.onNodeWithTag("product-variant-phone-white").performClick()
    assertEquals("phone", cartId)
    assertEquals("phone-white", opened)
  }
}

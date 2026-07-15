package kg.alistore.core

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import org.junit.Rule
import org.junit.Test

class ClientCatalogScreenTest {
  @get:Rule val compose = createComposeRule()

  private val products = listOf(
    Product("phone", "PHONE-15", "iPhone 15", 85_000, "phones", 3),
    Product("laptop", "MAC-AIR", "MacBook Air", 120_000, "laptops", 0),
  )

  @Test
  fun searchAndStockFilterUpdateVisibleCatalog() {
    compose.setContent {
      MaterialTheme {
        ClientCatalogScreen(products, emptySet(), emptySet(), {}, {})
      }
    }

    compose.onNodeWithTag("catalog-search").performTextReplacement("iphone")
    compose.onNodeWithTag("product-phone").assertIsDisplayed()
    compose.onNodeWithTag("catalog-count").assertTextEquals("1 товаров")

    compose.onNodeWithTag("catalog-search").performTextReplacement("")
    compose.onNodeWithTag("catalog-stock").performClick()
    compose.onNodeWithTag("product-phone").assertIsDisplayed()
    compose.onNodeWithTag("catalog-count").assertTextEquals("1 товаров")
  }
}

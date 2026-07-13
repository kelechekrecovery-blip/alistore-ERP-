package kg.alistore.core

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class CourierAppScreenTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun signedOutCourierSeesNativeLogin() {
    compose.setContent { CourierApp("http://127.0.0.1:1/api") }

    compose.onNodeWithText("AliStore Courier").assertIsDisplayed()
    compose.onNodeWithText("Доставки и расчёты COD").assertIsDisplayed()
  }
}

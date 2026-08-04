package kg.alistore.core

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class PosAppScreenTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun signedOutPosShowsNativeCashierLogin() {
    compose.setContent { PosApp("http://127.0.0.1:1/api") }
    compose.onNodeWithText("AliStore POS").assertIsDisplayed()
    compose.onNodeWithText("Нативная касса").assertIsDisplayed()
  }
}

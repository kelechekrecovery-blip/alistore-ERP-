package kg.alistore.client

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class ClientPackagedUiTest {
  @get:Rule val compose = createAndroidComposeRule<MainActivity>()

  @Test
  fun launchesClientRoleFromPackagedActivity() {
    compose.onNodeWithText("Главная").assertIsDisplayed()
    compose.onNodeWithText("Каталог").assertIsDisplayed()
  }
}

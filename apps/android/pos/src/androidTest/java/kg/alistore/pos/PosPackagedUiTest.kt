package kg.alistore.pos

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class PosPackagedUiTest {
  @get:Rule val compose = createAndroidComposeRule<MainActivity>()

  @Test
  fun launchesPosRoleFromPackagedActivity() {
    compose.onNodeWithText("AliStore POS").assertIsDisplayed()
  }
}

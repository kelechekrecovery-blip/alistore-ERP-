package kg.alistore.staff

import android.Manifest
import android.os.Build
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.rule.GrantPermissionRule
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runners.model.Statement

class StaffPackagedUiTest {
  private val permission = NotificationPermissionRule()
  private val compose = createAndroidComposeRule<MainActivity>()

  @get:Rule val rules: RuleChain = RuleChain.outerRule(permission).around(compose)

  @Test
  fun launchesStaffRoleFromPackagedActivity() {
    compose.onNodeWithText("AliStore Staff").assertIsDisplayed()
  }
}

private class NotificationPermissionRule : TestRule {
  override fun apply(base: Statement, description: Description): Statement =
    if (Build.VERSION.SDK_INT >= 33) {
      GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS).apply(base, description)
    } else {
      base
    }
}

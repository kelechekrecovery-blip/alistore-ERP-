package kg.alistore.pos

import androidx.activity.compose.setContent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import kg.alistore.core.CashShift
import kg.alistore.core.CloseShiftRequest
import kg.alistore.core.CustomerOrder
import kg.alistore.core.OpenShiftRequest
import kg.alistore.core.StaffHrAttendance
import kg.alistore.core.StaffHrWeek
import kg.alistore.core.StaffOperationsGateway
import kg.alistore.core.StaffSession
import kg.alistore.core.StaffShiftScreen
import org.junit.Rule
import org.junit.Test

class PosPackagedUiTest {
  @get:Rule val compose = createAndroidComposeRule<MainActivity>()

  @Test
  fun launchesPosRoleFromPackagedActivity() {
    compose.onNodeWithText("AliStore POS").assertIsDisplayed()
  }

  @Test
  fun packagedPosUsesBlindCashCount() {
    val gateway = PackagedShiftGateway()
    compose.activityRule.scenario.onActivity {
      it.setContent { StaffShiftScreen(StaffSession("token", "staff-1", "seller", "seller", true), gateway, {}) }
    }

    compose.waitUntil(5_000) { runCatching { compose.onNodeWithTag("shift-close-cash").fetchSemanticsNode() }.isSuccess }
    compose.onNodeWithTag("shift-expected").assertDoesNotExist()
    compose.onNodeWithText("7000", substring = true).assertDoesNotExist()
    compose.onNodeWithTag("shift-close-cash").performTextReplacement("0")
    compose.onNodeWithTag("shift-close").assertIsEnabled().performClick()
    compose.waitUntil(5_000) { runCatching { compose.onNodeWithTag("shift-result").fetchSemanticsNode() }.isSuccess }
    compose.onNodeWithText("Ожидалось: 7000 сом").assertIsDisplayed()
  }
}

private class PackagedShiftGateway : StaffOperationsGateway {
  private val shift = CashShift("shift-1", "staff-1", "BISHKEK-1", 5000, null, null, null, "2026-07-13", null, expected = 7000)

  override suspend fun currentShift(token: String) = shift
  override suspend fun closeShift(shiftId: String, request: CloseShiftRequest, token: String, idempotencyKey: String) =
    shift.copy(closeCash = request.closeCash, diff = -7000, closedAt = "2026-07-13")
  override suspend fun openShift(request: OpenShiftRequest, token: String, idempotencyKey: String) = error("unused")
  override suspend fun staffHrWeek(weekStart: String, token: String) = StaffHrWeek(weekStart, weekStart, null, emptyList())
  override suspend fun openAttendance(scheduleId: String, token: String, idempotencyKey: String): StaffHrAttendance = error("unused")
  override suspend fun closeAttendance(scheduleId: String, token: String, idempotencyKey: String): StaffHrAttendance = error("unused")
  override suspend fun staffOrders(status: String, token: String): List<CustomerOrder> = emptyList()
  override suspend fun fulfillOrder(orderId: String, token: String): CustomerOrder = error("unused")
  override suspend fun transitionOrder(orderId: String, to: String, token: String): CustomerOrder = error("unused")
}

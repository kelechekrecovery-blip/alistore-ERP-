package kg.alistore.core

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.graphics.asAndroidBitmap
import android.graphics.Bitmap
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import java.io.IOException
import java.io.File
import java.io.FileOutputStream

class StaffOperationsScreenTest {
  @get:Rule val compose = createComposeRule()

  private val session = StaffSession("staff-token", "staff-1", "seller", "seller", true)

  @Test
  fun orderActionUsesServerTransitionAndReloadsQueue() {
    val order = CustomerOrder(
      id = "order-staff-1", status = "paid", total = 125000, fulfillmentType = "pickup",
      pickupPoint = "BISHKEK-1", deliveryAddress = null,
      items = listOf(CustomerOrderItem("PHONE-1", 1, 125000)),
    )
    val gateway = UiStaffGateway(orders = mutableListOf(order))
    compose.setContent { MaterialTheme { StaffOrdersScreen(session, gateway) } }

    compose.onNodeWithTag("staff-status-paid").performClick()
    compose.waitUntil(5_000) { runCatching { compose.onNodeWithTag("staff-order-order-staff-1").fetchSemanticsNode() }.isSuccess }
    if (InstrumentationRegistry.getArguments().getString("visual") == "true") {
      val context = InstrumentationRegistry.getInstrumentation().targetContext
      val image = compose.onRoot().captureToImage().asAndroidBitmap()
      FileOutputStream(File(context.getExternalFilesDir(null), "staff-orders.png")).use {
        image.compress(Bitmap.CompressFormat.PNG, 100, it)
      }
      Thread.sleep(InstrumentationRegistry.getArguments().getString("visualDelay")?.toLongOrNull() ?: 10_000)
    }
    compose.onNodeWithText("Начать комплектацию").assertIsDisplayed().performClick()
    compose.waitUntil(5_000) { gateway.transitions.isNotEmpty() && gateway.orderLoads >= 2 }

    assertEquals(listOf("order-staff-1" to "picking"), gateway.transitions)
    compose.onNodeWithText("Очередь пуста").assertIsDisplayed()
  }

  @Test
  fun shiftOpenRetryKeepsExactIdempotencyKey() {
    val gateway = UiStaffGateway(failFirstOpen = true)
    compose.setContent { MaterialTheme { StaffShiftScreen(session, gateway, {}) } }

    compose.waitUntil(5_000) { runCatching { compose.onNodeWithTag("shift-open").fetchSemanticsNode() }.isSuccess }
    compose.onNodeWithTag("shift-open").assertIsEnabled().performClick()
    compose.waitUntil(5_000) { gateway.openKeys.size == 1 && runCatching { compose.onNodeWithTag("staff-retry").fetchSemanticsNode() }.isSuccess }
    compose.onNodeWithTag("shift-open").performClick()
    compose.waitUntil(5_000) { gateway.openKeys.size == 2 && runCatching { compose.onNodeWithTag("shift-expected").fetchSemanticsNode() }.isSuccess }

    assertEquals(gateway.openKeys[0], gateway.openKeys[1])
    compose.onNodeWithText("Ожидается: 5000 сом").assertIsDisplayed()
  }

  @Test
  fun discrepancyRequiresReasonAndCloseRetryKeepsKey() {
    val shift = CashShift("shift-1", "staff-1", "BISHKEK-1", 5000, null, null, null, "2026-07-13", null)
    val gateway = UiStaffGateway(current = shift, failFirstClose = true)
    compose.setContent { MaterialTheme { StaffShiftScreen(session, gateway, {}) } }

    compose.waitUntil(5_000) { runCatching { compose.onNodeWithTag("shift-close-cash").fetchSemanticsNode() }.isSuccess }
    compose.onNodeWithTag("shift-close-cash").performTextReplacement("4900")
    compose.onNodeWithTag("shift-close").assertIsNotEnabled()
    compose.onNodeWithTag("shift-reason").performTextReplacement("Недостача")
    compose.onNodeWithTag("shift-close").assertIsEnabled().performClick()
    compose.waitUntil(5_000) { gateway.closeKeys.size == 1 }
    compose.onNodeWithTag("shift-close").performClick()
    compose.waitUntil(5_000) { gateway.closeKeys.size == 2 }

    assertEquals(gateway.closeKeys[0], gateway.closeKeys[1])
  }
}

private class UiStaffGateway(
  private var current: CashShift? = null,
  private val orders: MutableList<CustomerOrder> = mutableListOf(),
  private val failFirstOpen: Boolean = false,
  private val failFirstClose: Boolean = false,
) : StaffOperationsGateway {
  val openKeys = mutableListOf<String>()
  val closeKeys = mutableListOf<String>()
  val transitions = mutableListOf<Pair<String, String>>()
  var orderLoads = 0

  override suspend fun currentShift(token: String): CashShift? = current

  override suspend fun openShift(request: OpenShiftRequest, token: String, idempotencyKey: String): CashShift {
    openKeys += idempotencyKey
    if (failFirstOpen && openKeys.size == 1) throw IOException("Сеть недоступна")
    return CashShift("shift-1", request.staffId, request.point, request.openCash, null, null, null, "2026-07-13", null).also { current = it }
  }

  override suspend fun closeShift(shiftId: String, request: CloseShiftRequest, token: String, idempotencyKey: String): CashShift {
    closeKeys += idempotencyKey
    if (failFirstClose && closeKeys.size == 1) throw IOException("Сеть недоступна")
    return current!!.copy(closeCash = request.closeCash, closeReason = request.reason, diff = request.closeCash - current!!.expectedCash, closedAt = "2026-07-13").also { current = null }
  }

  override suspend fun staffOrders(status: String, token: String): List<CustomerOrder> {
    orderLoads += 1
    return orders.filter { it.status == status }
  }

  override suspend fun fulfillOrder(orderId: String, token: String): CustomerOrder {
    val index = orders.indexOfFirst { it.id == orderId }
    return orders[index].copy(status = "reserved").also { orders[index] = it }
  }

  override suspend fun transitionOrder(orderId: String, to: String, token: String): CustomerOrder {
    transitions += orderId to to
    val index = orders.indexOfFirst { it.id == orderId }
    return orders[index].copy(status = to).also { orders[index] = it }
  }
}

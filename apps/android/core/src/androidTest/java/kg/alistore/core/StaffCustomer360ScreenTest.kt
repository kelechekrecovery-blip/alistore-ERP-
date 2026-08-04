package kg.alistore.core

import android.graphics.Bitmap
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.FileOutputStream

class StaffCustomer360ScreenTest {
  @get:Rule val compose = createComposeRule()

  @Test fun adminLoadsCustomerAndRunsAuthoritativeActions() {
    val gateway = UiCustomerGateway()
    val session = StaffSession("staff-token", "admin-1", "admin", "admin", true)
    compose.setContent { MaterialTheme { StaffCustomer360Screen(session, gateway) } }

    compose.onNodeWithTag("staff-customer-id").performTextInput("customer-1")
    compose.onNodeWithTag("staff-customer-load").performClick()
    compose.waitUntil(5_000) { gateway.loads == 1 }
    compose.onNodeWithText("+996 *** ** 12").assertIsDisplayed()
    compose.waitUntil(5_000) { runCatching { compose.onNodeWithTag("staff-customer-profile").fetchSemanticsNode() }.isSuccess }
    if (InstrumentationRegistry.getArguments().getString("visual") == "true") {
      val context = InstrumentationRegistry.getInstrumentation().targetContext
      val image = compose.onRoot().captureToImage().asAndroidBitmap()
      FileOutputStream(File(context.getExternalFilesDir(null), "staff-customer-360.png")).use {
        image.compress(Bitmap.CompressFormat.PNG, 100, it)
      }
      Thread.sleep(10_000)
    }
    compose.onNodeWithTag("staff-warranty-w1-action-0").performClick()
    compose.waitUntil(5_000) { gateway.warrantyTransitions.isNotEmpty() && gateway.loads >= 2 }
    compose.onNodeWithTag("staff-ticket-t1-action-0").performClick()
    compose.waitUntil(5_000) { gateway.supportTransitions.isNotEmpty() && gateway.loads >= 3 }

    assertEquals(listOf(Triple("w1", "diagnostics", "staff-token")), gateway.warrantyTransitions)
    assertEquals(listOf(Triple("t1", "in_progress", "staff-token")), gateway.supportTransitions)
    assertEquals(listOf("staff-token", "staff-token", "staff-token"), gateway.loadTokens)
  }

  @Test fun sellerSeesPermissionStateWithoutPrivilegedActions() {
    val gateway = UiCustomerGateway()
    val session = StaffSession("seller-token", "seller-1", "seller", "seller", false)
    compose.setContent { MaterialTheme { StaffCustomer360Screen(session, gateway) } }

    compose.onNodeWithTag("staff-customer-id").performTextInput("customer-1")
    compose.onNodeWithTag("staff-customer-load").performClick()
    compose.waitUntil(5_000) { gateway.loads == 1 }

    compose.onNodeWithTag("staff-warranty-w1-permission").assertIsDisplayed()
    compose.onNodeWithTag("staff-ticket-t1-permission").assertIsDisplayed()
    compose.onAllNodesWithTag("staff-ticket-t1-action-0").assertCountEquals(0)
  }
}

private class UiCustomerGateway : StaffCustomerGateway {
  var loads = 0
  val loadTokens = mutableListOf<String>()
  val warrantyTransitions = mutableListOf<Triple<String, String, String>>()
  val supportTransitions = mutableListOf<Triple<String, String, String>>()
  private var warrantyStatus = "received"
  private var ticketStatus = "new"

  override suspend fun customerOverview(customerId: String, token: String): Customer360 {
    loads += 1
    loadTokens += token
    return Customer360(
      Customer360Profile(customerId, "Айжан", "+996 *** ** 12", true, listOf("vip"), 120000, "2026-01-01T00:00:00Z"),
      Customer360Orders(2, 100000, listOf(Customer360Order("o1", "completed", 100000, "2026-07-01T00:00:00Z"))),
      Customer360Debts(1, 20000, listOf(Customer360Debt("d1", 20000, "open", "2026-08-01T00:00:00Z"))),
      Customer360Warranties(1, listOf(Customer360Warranty("w1", "123", warrantyStatus, "2026-07-20T00:00:00Z"))),
      Customer360Tickets(1, listOf(Customer360Ticket("t1", "Доставка", ticketStatus, "normal", "2026-07-20T00:00:00Z"))),
    )
  }

  override suspend fun transitionWarranty(caseId: String, to: String, token: String): WarrantyCase {
    warrantyTransitions += Triple(caseId, to, token)
    warrantyStatus = to
    return WarrantyCase(caseId, "123", "customer-1", "Экран", to, "2026-07-20T00:00:00Z")
  }

  override suspend fun supportTickets(status: String, token: String): List<SupportTicket> = emptyList()

  override suspend fun transitionSupport(ticketId: String, to: String, token: String): SupportTicket {
    supportTransitions += Triple(ticketId, to, token)
    ticketStatus = to
    return SupportTicket(ticketId, "customer-1", "app", "Доставка", null, "normal", to, "2026-07-20T00:00:00Z", "2026-07-01T00:00:00Z")
  }

  override suspend fun escalateSupport(ticketId: String, token: String): SupportTicket =
    SupportTicket(ticketId, "customer-1", "app", "Доставка", null, "high", ticketStatus, "2026-07-20T00:00:00Z", "2026-07-01T00:00:00Z")
}

package kg.alistore.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StaffSupportQueueTest {
  @Test
  fun `orders queue includes reserved between created and paid`() {
    assertEquals(listOf("created", "reserved", "paid", "picking", "packed", "ready_for_pickup"), staffOrderStatuses)
    assertEquals("Резерв", staffOrderStatusLabels["reserved"])
  }

  @Test
  fun `support queue statuses follow the server ticket workflow`() {
    assertEquals(listOf("new", "in_progress", "waiting", "resolved"), staffSupportStatuses.map { it.first })
  }

  @Test
  fun `transition labels cover every server transition target`() {
    listOf("in_progress", "waiting", "resolved", "closed").forEach { target ->
      assertTrue(supportTransitionLabel(target).isNotBlank())
    }
    assertEquals("В работу", supportTransitionLabel("in_progress"))
    assertEquals("Закрыть", supportTransitionLabel("closed"))
  }

  @Test
  fun `escalation is blocked for urgent resolved or closed tickets`() {
    assertFalse(canEscalateSupportTicket("new", "urgent"))
    assertFalse(canEscalateSupportTicket("resolved", "high"))
    assertFalse(canEscalateSupportTicket("closed", "normal"))
    assertTrue(canEscalateSupportTicket("new", "high"))
    assertTrue(canEscalateSupportTicket("in_progress", "normal"))
  }

  @Test
  fun `support actions are limited to admin and owner roles`() {
    assertTrue("admin" in supportRoles)
    assertTrue("owner" in supportRoles)
    assertFalse("seller" in supportRoles)
    assertFalse("warehouse" in supportRoles)
  }
}

package kg.alistore.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class StaffCustomerGatewayTest {
  @Test fun parsesCustomer360Contract() {
    val result = JSONObject(
      """{
        "customer":{"id":"c1","name":"Айжан","phone":"+996 *** ** 12","consent":true,"segments":["vip"],"ltv":120000,"createdAt":"2026-01-01T00:00:00Z"},
        "orders":{"total":2,"spent":100000,"recent":[{"id":"o1","status":"completed","total":100000,"createdAt":"2026-07-01T00:00:00Z"}]},
        "debts":{"count":1,"openBalance":20000,"items":[{"id":"d1","balance":20000,"status":"open","dueDate":"2026-08-01T00:00:00Z"}]},
        "warranties":{"open":1,"items":[{"id":"w1","imei":"123","status":"received","sla":"2026-07-20T00:00:00Z"}]},
        "tickets":{"open":1,"items":[{"id":"t1","subject":"Доставка","status":"new","priority":"normal","sla":"2026-07-20T00:00:00Z"}]}
      }"""
    ).customerOverview()

    assertEquals("+996 *** ** 12", result.customer.phone)
    assertEquals(100000, result.orders.spent)
    assertEquals("received", result.warranties.items.single().status)
    assertEquals("new", result.tickets.items.single().status)
  }

  @Test fun transitionMapsMirrorServerStateMachines() {
    assertEquals("diagnostics", nextWarrantyStatus("received"))
    assertEquals(listOf("waiting", "resolved"), nextSupportStatuses("in_progress"))
    assertEquals(emptyList<String>(), nextSupportStatuses("closed"))
  }
}

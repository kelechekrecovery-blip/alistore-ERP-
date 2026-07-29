package kg.alistore.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeSupplyPolicyTest {
  @Test
  fun `owner resolution requires role totp and server capability`() {
    val owner = StaffSession("token", "owner-1", "owner", "owner", true, "MANAS-1")
    assertTrue(NativeSupplyPolicy.canResolveOwnerCancellation(owner, true))
    assertFalse(NativeSupplyPolicy.canResolveOwnerCancellation(owner, false))
    assertFalse(NativeSupplyPolicy.canResolveOwnerCancellation(owner.copy(totpEnabled = false), true))
    assertFalse(NativeSupplyPolicy.canResolveOwnerCancellation(owner.copy(role = "warehouse"), true))
  }

  @Test
  fun `point-bound operations fail closed without staff point`() {
    assertFalse(NativeSupplyPolicy.canUsePointBoundOperations(
      StaffSession("token", "staff-1", "staff", "seller", false),
    ))
    assertTrue(NativeSupplyPolicy.canUsePointBoundOperations(
      StaffSession("token", "staff-1", "staff", "seller", false, "MANAS-1"),
    ))
  }

  @Test
  fun `courier requires all lines and receivables ready`() {
    val ready = CustomerOrderItem(
      sku = "TO-1",
      qty = 1,
      price = 100,
      id = "line-1",
      supplyModeSnapshot = "to_order",
      fulfillmentStatus = "ready",
    )
    val waiting = ready.copy(id = "line-2", fulfillmentStatus = "in_transit")
    val settled = OrderReceivable("r-1", "line-1", "supply_balance", 100, 100, "settled", null)
    val base = CustomerOrder(
      id = "order-1",
      status = "confirmed",
      total = 200,
      fulfillmentType = "courier",
      pickupPoint = null,
      deliveryAddress = "Манас",
      items = listOf(ready, waiting),
      paymentSchedule = listOf(settled),
    )
    assertFalse(NativeSupplyPolicy.allLinesReadyForCourier(base))
    assertTrue(NativeSupplyPolicy.allLinesReadyForCourier(base.copy(items = listOf(ready, ready.copy(id = "line-2")))))
    assertFalse(NativeSupplyPolicy.allLinesReadyForCourier(base.copy(
      items = listOf(ready),
      paymentSchedule = listOf(settled.copy(status = "open", settledAmount = 0)),
    )))
  }
}

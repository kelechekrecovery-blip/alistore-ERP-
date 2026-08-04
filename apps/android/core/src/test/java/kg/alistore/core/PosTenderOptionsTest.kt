package kg.alistore.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PosTenderOptionsTest {
  @Test
  fun `tender options mirror the server payment method enum accepted by pos sale and exchange`() {
    assertEquals(
      listOf("cash", "card", "qr_mbank", "qr_odengi", "bakai_pos", "obank", "installment"),
      posTenderOptions.map { it.first },
    )
  }

  @Test
  fun `every tender option has a cashier facing label`() {
    assertTrue(posTenderOptions.all { (_, label) -> label.isNotBlank() })
    assertEquals("O!Деньги", posTenderOptions.first { it.first == "qr_odengi" }.second)
  }
}

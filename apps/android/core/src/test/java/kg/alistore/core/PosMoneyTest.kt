package kg.alistore.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * Ground truth for every expected value below is the server formula, byte-for-byte,
 * computed with Node's `Math.round` (apps/api/src/pos/margin-control.ts:34):
 *   Math.round(gross * (1 - discountPct / 100))
 */
class PosMoneyTest {
  @Test
  fun `matches server rounding across representative gross-percent pairs`() {
    val cases = listOf(
      Triple(1000, 0, 1000),
      Triple(1000, 100, 0),
      Triple(1000, 50, 500),
      Triple(999999, 33, 669999),
      Triple(123457, 7, 114815),
      Triple(3, 33, 2),
      Triple(7, 14, 6),
      Triple(300000, 99, 3000),
      Triple(1, 1, 1),
      Triple(199999, 1, 197999),
      Triple(269999, 3, 261899),
    )
    cases.forEach { (gross, pct, expected) ->
      assertEquals("gross=$gross pct=$pct", expected, posSaleTotal(gross, pct))
    }
  }

  @Test
  fun `exact half ties round up like server Math_round, not to even`() {
    // 50 * (1 - 1/100) = 49.5 exactly in IEEE 754 double, same bit pattern JS computes.
    // Server Math.round(49.5) = 50 (ties break towards +infinity).
    assertEquals(50, posSaleTotal(50, 1))

    // 25 * (1 - 2/100) = 24.5 exactly. Server Math.round(24.5) = 25.
    // kotlin.math.round(24.5) would give 24 (ties-to-even, since 24 is the even neighbor) —
    // this is precisely the trap the server formula does not have. Assert both facts so a
    // future edit that swaps in kotlin.math.round fails loudly.
    assertEquals(25, posSaleTotal(25, 2))
    assertNotEquals(
      "kotlin.math.round breaks this tie differently than the server; if this ever " +
        "matches, posSaleTotal was rewritten with kotlin.math.round and must be reverted",
      kotlin.math.round(25 * (1.0 - 2 / 100.0)).toInt(),
      posSaleTotal(25, 2),
    )

    // The pre-fix Android formula (integer division, effectively floor) silently
    // undercharges on both ties: floor(50*99/100)=49 and floor(25*98/100)=24.
    assertNotEquals(50 * (100 - 1) / 100, posSaleTotal(50, 1))
    assertNotEquals(25 * (100 - 2) / 100, posSaleTotal(25, 2))
  }

  @Test
  fun `cash equal to total is a full cash tender, never routed to the other method`() {
    val tenders = posTenders(method = "card", total = 5000, cash = 5000)
    assertEquals(listOf(PosTender("cash", 5000)), tenders)
  }

  @Test
  fun `cash short of total splits between cash and the selected method`() {
    val tenders = posTenders(method = "card", total = 5000, cash = 3000)
    assertEquals(listOf(PosTender("cash", 3000), PosTender("card", 2000)), tenders)
  }

  @Test
  fun `no split cash entered uses the selected method for the full total`() {
    val tenders = posTenders(method = "qr_mbank", total = 5000, cash = 0)
    assertEquals(listOf(PosTender("qr_mbank", 5000)), tenders)
  }
}

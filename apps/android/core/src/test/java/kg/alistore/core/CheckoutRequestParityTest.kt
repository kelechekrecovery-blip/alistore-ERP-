package kg.alistore.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckoutRequestParityTest {
  private val baseRequest = CreateOrderRequest(
    customerId = "customer-1",
    fulfillmentType = "courier",
    storePointId = null,
    deliveryAddress = "Бишкек, Киевская 95",
    total = 235450,
    items = listOf(CreateOrderItem("PHONE-1", 2, 125000)),
  )

  @Test
  fun serializesCheckoutParityFieldsWhenSet() {
    val json = baseRequest.copy(
      paymentMode = "cod",
      deliverySlot = "16:00–18:00",
      deliveryZoneId = "zone-1",
      deliverySlotId = "slot-1",
      promoCode = "SALE5000",
      loyaltyPoints = 4800,
    ).toJson()

    assertEquals("cod", json.getString("paymentMode"))
    assertEquals("16:00–18:00", json.getString("deliverySlot"))
    assertEquals("zone-1", json.getString("deliveryZoneId"))
    assertEquals("slot-1", json.getString("deliverySlotId"))
    assertEquals("SALE5000", json.getString("promoCode"))
    assertEquals(4800, json.getInt("loyaltyPoints"))
    assertEquals("mobile", json.getString("channel"))
    assertEquals("courier", json.getString("fulfillmentType"))
  }

  @Test
  fun omitsOptionalParityFieldsAndAttributionWhenAbsent() {
    val json = baseRequest.toJson()

    assertFalse(json.has("paymentMode"))
    assertFalse(json.has("deliverySlot"))
    assertFalse(json.has("deliveryZoneId"))
    assertFalse(json.has("deliverySlotId"))
    assertFalse(json.has("promoCode"))
    assertFalse(json.has("loyaltyPoints"))
    // Attribution is not collected by the Android app and must not be fabricated.
    assertFalse(json.has("attribution"))
  }

  @Test
  fun resolvesCodOnlyForCashPaymentWithCourierDelivery() {
    assertEquals("cod", resolvePaymentMode("cash", "courier"))
    assertEquals("prepaid", resolvePaymentMode("cash", "pickup"))
    assertEquals("prepaid", resolvePaymentMode(OnlinePaymentMethod.CARD.wireValue, "courier"))
    assertEquals("prepaid", resolvePaymentMode(OnlinePaymentMethod.MBANK.wireValue, "pickup"))
  }

  @Test
  fun capsLoyaltyRedemptionByBalanceAndDiscountedSubtotal() {
    assertEquals(4800, loyaltyRedemption(balance = 4800, subtotal = 250000, promoDiscount = 10000))
    assertEquals(240000, loyaltyRedemption(balance = 999999, subtotal = 250000, promoDiscount = 10000))
    assertEquals(0, loyaltyRedemption(balance = 0, subtotal = 250000, promoDiscount = 10000))
    assertEquals(0, loyaltyRedemption(balance = 4800, subtotal = 5000, promoDiscount = 9000))
  }

  @Test
  fun estimatesPayableTotalLikeTheWebCheckout() {
    assertEquals(235450, checkoutPayableEstimate(subtotal = 250000, promoDiscount = 10000, loyaltyPoints = 4800, deliveryFee = 250))
    assertEquals(300, checkoutPayableEstimate(subtotal = 1000, promoDiscount = 2000, loyaltyPoints = 0, deliveryFee = 300))
    assertEquals(250000, checkoutPayableEstimate(subtotal = 250000, promoDiscount = 0, loyaltyPoints = 0, deliveryFee = 0))
  }

  @Test
  fun parsesCheckoutOptionsWithPickupPointsZonesAndSlots() {
    val payload = JSONObject(
      """{
        "pickupPoints": [
          {"id":"point-1","code":"center","name":"AliStore Центр","address":"Киевская 95","inventoryLocation":"CENTER","hours":"09:00-21:00","pickupInstructions":null,"sortOrder":1}
        ],
        "deliveryZones": [
          {"id":"zone-1","code":"bishkek-center","name":"Бишкек Центр","fee":250,"etaMinMinutes":60,"etaMaxMinutes":120,"active":true,
           "slots":[{"id":"slot-1","zoneId":"zone-1","startsAt":"2026-07-18T10:00:00.000Z","endsAt":"2026-07-18T12:00:00.000Z","capacity":5,"reserved":2,"remaining":3,"available":true}]}
        ]
      }""",
    )

    val options = payload.checkoutOptions()

    assertEquals(listOf("point-1"), options.pickupPoints.map(StorePoint::id))
    assertEquals(1, options.deliveryZones.size)
    val zone = options.deliveryZones.single()
    assertEquals("zone-1", zone.id)
    assertEquals("Бишкек Центр", zone.name)
    assertEquals(250, zone.fee)
    val slot = zone.slots.single()
    assertEquals("slot-1", slot.id)
    assertEquals("2026-07-18T10:00:00.000Z", slot.startsAt)
    assertEquals(3, slot.remaining)
    assertTrue(slot.available)
  }

  @Test
  fun parsesPromotionQuoteResponse() {
    val quote = JSONObject(
      """{"id":"promo-1","code":"SALE5000","name":"Летняя распродажа","subtotal":250000,"eligibleSubtotal":250000,"discount":10000,"customerLimitVerified":true,"validUntil":null}""",
    ).promotionQuote()

    assertEquals("SALE5000", quote.code)
    assertEquals("Летняя распродажа", quote.name)
    assertEquals(10000, quote.discount)
    assertEquals(250000, quote.subtotal)
  }

  @Test
  fun serializesPromotionQuoteRequestWithSkuAndQtyOnly() {
    val json = PromotionQuoteRequest(
      code = "sale5000",
      items = listOf(PromotionQuoteItem("PHONE-1", 2), PromotionQuoteItem("CASE-1", 1)),
    ).toJson()

    assertEquals("sale5000", json.getString("code"))
    val items = json.getJSONArray("items")
    assertEquals(2, items.length())
    assertEquals("PHONE-1", items.getJSONObject(0).getString("sku"))
    assertEquals(2, items.getJSONObject(0).getInt("qty"))
    assertFalse(items.getJSONObject(0).has("price"))
  }

  @Test
  fun formatsDeliverySlotLabelAsLocalTimeRange() {
    val label = deliverySlotLabel("2026-07-18T10:00:00.000Z", "2026-07-18T12:00:00.000Z")
    assertTrue(label, label.matches(Regex("""\d{2}:\d{2}–\d{2}:\d{2}""")))
  }
}

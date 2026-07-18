package kg.alistore.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ClientCatalogFilterTest {
  private val products = listOf(
    Product("phone", "PHONE-15", "iPhone 15", 85_000, "phones", 3),
    Product("laptop", "MAC-AIR", "MacBook Air", 120_000, "laptops", 0),
    Product("audio", "AIRPODS", "AirPods Pro", 24_000, "audio", 8),
  )

  @Test
  fun queryMatchesNameAndSkuIgnoringCase() {
    assertEquals(listOf("phone"), filterCatalog(products, CatalogFilter(query = "IPHONE")).map(Product::id))
    assertEquals(listOf("audio"), filterCatalog(products, CatalogFilter(query = "airpods")).map(Product::id))
  }

  @Test
  fun categoryAndStockFiltersCompose() {
    assertEquals(
      emptyList<Product>(),
      filterCatalog(products, CatalogFilter(category = "laptops", inStockOnly = true)),
    )
  }

  @Test
  fun priceSortIsStableAndDoesNotMutateSource() {
    assertEquals(
      listOf("audio", "phone", "laptop"),
      filterCatalog(products, CatalogFilter(sort = CatalogSort.PRICE_ASCENDING)).map(Product::id),
    )
    assertEquals(listOf("phone", "laptop", "audio"), products.map(Product::id))
  }

  @Test
  fun productMediaAcceptsHttpSourcesAndRelativePathsOnly() {
    assertTrue(isAllowedMediaUrl("https://cdn.alistore.kg/products/phone.webp"))
    assertTrue(isAllowedMediaUrl("/media/products/phone.webp"))
    assertFalse(isAllowedMediaUrl("file:///etc/passwd"))
    assertFalse(isAllowedMediaUrl("javascript:alert(1)"))
  }

  @Test
  fun productMediaResolvesRelativePathAgainstConfiguredApiOrigin() {
    assertEquals(
      "https://api.alistore.kg/media/products/phone.webp",
      resolveMediaUrl("https://api.alistore.kg/api", "/media/products/phone.webp"),
    )
    assertEquals(
      "https://cdn.alistore.kg/products/phone.webp",
      resolveMediaUrl("https://api.alistore.kg/api", "https://cdn.alistore.kg/products/phone.webp"),
    )
  }

  @Test
  fun paymentReturnRouteRejectsUntrustedSchemesAndParsesFailure() {
    assertEquals(null, parsePaymentReturnRoute("https://example.com/payment-return?orderId=order-1"))
    assertEquals("order-1", parsePaymentReturnRoute("https://alistore.kg/payment-return?orderId=order-1")?.orderId)
    val route = parsePaymentReturnRoute("alistore://payment-return?orderId=order-1&status=failed&method=card")
    assertEquals("order-1", route?.orderId)
    assertEquals("failed", route?.status)
    assertEquals(OnlinePaymentMethod.CARD, route?.method)
    assertTrue(route?.isFailed() == true)
  }

  @Test
  fun clientPushRouteScopesDestinationsAndRejectsUntrustedLinks() {
    assertEquals(null, parseClientPushRoute("https://example.com/orders/order-1"))
    assertEquals(
      ClientPushRoute(ClientPushDestination.ORDERS, "order-1"),
      parseClientPushRoute("alistore-client://orders/order-1"),
    )
    assertEquals(
      ClientPushRoute(ClientPushDestination.WARRANTY, "IMEI 123"),
      parseClientPushRoute("alistore-client://warranty/IMEI%20123"),
    )
    assertEquals(
      ClientPushRoute(ClientPushDestination.ACCOUNT, "settings"),
      parseClientPushRoute("alistore-client://account/settings"),
    )
    assertEquals(null, parseClientPushRoute("alistore-client://orders"))
  }
}

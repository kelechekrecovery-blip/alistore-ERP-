package kg.alistore.core

import org.junit.Assert.assertEquals
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
}

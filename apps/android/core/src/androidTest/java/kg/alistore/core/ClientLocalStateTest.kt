package kg.alistore.core

import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ClientLocalStateTest {
  @Test
  fun favoritesAndCartSurviveStoreRecreationAndIgnoreInvalidQuantities() {
    val name = UUID.randomUUID().toString()
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val first = ClientLocalStateStore(context, name)
    first.write(ClientLocalState(setOf("product-b", "product-a"), mapOf("product-a" to 2, "product-b" to 0)))

    val restored = ClientLocalStateStore(context, name).read()

    assertEquals(setOf("product-a", "product-b"), restored.favorites)
    assertEquals(mapOf("product-a" to 2), restored.cart)
    assertTrue(restored.cart.values.all { it > 0 })
    first.clear()
  }
}

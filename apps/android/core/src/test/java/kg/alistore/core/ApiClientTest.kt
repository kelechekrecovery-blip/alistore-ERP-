package kg.alistore.core

import org.junit.Assert.assertThrows
import org.junit.Test

class ApiClientTest {
  @Test
  fun rejectsMissingApiBaseUrl() {
    assertThrows(IllegalArgumentException::class.java) {
      ApiClient("   ")
    }
  }
}

package kg.alistore.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class GoogleCredentialSignInProviderTest {
  @Test
  fun nonceContainsThirtyTwoRandomBytesAsUnpaddedBase64Url() {
    val nonces = List(32) { secureGoogleNonce() }

    assertEquals(nonces.size, nonces.toSet().size)
    nonces.forEach { nonce ->
      assertEquals(32, Base64.getUrlDecoder().decode(nonce).size)
      assertTrue(nonce.matches(Regex("^[A-Za-z0-9_-]{43}$")))
    }
  }
}

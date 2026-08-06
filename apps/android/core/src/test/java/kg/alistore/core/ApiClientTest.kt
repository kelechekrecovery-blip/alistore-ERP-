package kg.alistore.core

import org.junit.Assert.assertThrows
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject

class ApiClientTest {
  @Test
  fun rejectsMissingApiBaseUrl() {
    assertThrows(IllegalArgumentException::class.java) {
      ApiClient("   ")
    }
  }

  @Test
  fun otpVerificationPayloadsCarryChallengeIdWhenIssued() {
    val phone = otpVerificationPayload("+996700123456", "123456", "phone-challenge")
    val email = emailOtpVerificationPayload("owner@example.com", "654321", "email-challenge")
    val recovery = recoveryVerificationPayload("+996700123456", "987654", "recovery-challenge")

    assertEquals("phone-challenge", phone.getString("challengeId"))
    assertEquals("email-challenge", email.getString("challengeId"))
    assertEquals("recovery-challenge", recovery.getString("challengeId"))
    assertEquals("+996700123456", recovery.getString("phone"))
    assertEquals("987654", recovery.getString("code"))
  }

  @Test
  fun otpVerificationPayloadRemainsCompatibleWithoutChallengeId() {
    val payload = otpVerificationPayload("+996700123456", "123456", null)

    assertFalse(payload.has("challengeId"))
  }

  @Test
  fun googleLoginPayloadCarriesTokenAndRawNonce() {
    val payload = googleLoginPayload("google-id-token", "raw-nonce")

    assertEquals("google-id-token", payload.getString("identityToken"))
    assertEquals("raw-nonce", payload.getString("nonce"))
  }

  @Test
  fun authMethodsPayloadDecodesServerAuthoritativeAvailability() {
    val methods = JSONObject(
      """{
        "phone":{"enabled":false,"registers":false},
        "email":{"enabled":true,"registers":false},
        "google":{"enabled":true,"registers":false,"clientId":"google-web.apps.googleusercontent.com"},
        "recovery":{"enabled":true},
        "anyLoginAvailable":true,
        "registrationAvailable":false
      }""",
    ).customerAuthMethods()

    assertFalse(methods.phone.enabled)
    assertTrue(methods.email.enabled)
    assertTrue(methods.google.enabled)
    assertTrue(methods.recovery.enabled)
    assertEquals("google-web.apps.googleusercontent.com", methods.google.clientId)
    assertFalse(methods.registrationAvailable)
  }

  @Test
  fun missingOrNullGoogleClientIdDecodesAsUnavailableAudience() {
    fun payload(clientId: String): CustomerAuthMethods = JSONObject(
      """{
        "phone":{"enabled":false,"registers":false},
        "email":{"enabled":false,"registers":false},
        "google":{"enabled":true,"registers":false$clientId},
        "recovery":{"enabled":false},
        "anyLoginAvailable":true,
        "registrationAvailable":false
      }""",
    ).customerAuthMethods()

    assertEquals(null, payload("").google.clientId)
    assertEquals(null, payload(",\"clientId\":null").google.clientId)
  }

  @Test
  fun socialEnrollmentPayloadCarriesMemoryTicketAndOtpChallenge() {
    val payload = socialEnrollmentPayload("enrollment-ticket", "+996700123456", "123456", "challenge-1")

    assertEquals("enrollment-ticket", payload.getString("enrollmentToken"))
    assertEquals("+996700123456", payload.getString("phone"))
    assertEquals("123456", payload.getString("code"))
    assertEquals("challenge-1", payload.getString("challengeId"))
  }

  @Test
  fun staffLoginPayloadOmitsBlankTotpAndCarriesAuthenticatorCode() {
    val withoutTotp = staffLoginPayload("seller", "secret", "  ")
    val withTotp = staffLoginPayload("seller", "secret", " 123456 ")

    assertFalse(withoutTotp.has("totp"))
    assertEquals("123456", withTotp.getString("totp"))
  }
}

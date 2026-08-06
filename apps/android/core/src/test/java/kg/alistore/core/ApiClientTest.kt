package kg.alistore.core

import org.junit.Assert.assertThrows
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

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

    assertEquals("phone-challenge", phone.getString("challengeId"))
    assertEquals("email-challenge", email.getString("challengeId"))
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

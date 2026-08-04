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
}

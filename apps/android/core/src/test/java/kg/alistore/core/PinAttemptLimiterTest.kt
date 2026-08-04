package kg.alistore.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PinAttemptLimiterTest {
  @Test
  fun locksAfterTheFifthFailure() {
    val first = PinAttemptLimiter.afterFailure(4, 0, 1_000)

    assertEquals(0, first.first)
    assertEquals(31_000L, first.second)

    val status = PinAttemptLimiter.status(first.first, first.second, 1_000)
    assertFalse(status.allowed)
    assertEquals(30L, status.retryAfterSeconds)
  }

  @Test
  fun ignoresFailuresDuringLockoutAndAllowsRetryAfterExpiry() {
    val locked = PinAttemptLimiter.afterFailure(4, 0, 1_000)
    val repeated = PinAttemptLimiter.afterFailure(locked.first, locked.second, 2_000)

    assertEquals(locked, repeated)
    assertTrue(PinAttemptLimiter.status(locked.first, locked.second, 31_000).allowed)
  }

  @Test
  fun countsFailuresBeforeLockout() {
    val next = PinAttemptLimiter.afterFailure(2, 0, 1_000)

    assertEquals(3, next.first)
    assertEquals(0L, next.second)
    assertTrue(PinAttemptLimiter.status(next.first, next.second, 1_000).allowed)
  }
}

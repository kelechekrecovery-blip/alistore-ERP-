package kg.alistore.core

import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exercises the real AndroidKeyStore + SharedPreferences backing of QuickUnlockStore —
 * this cannot be a JVM unit test (core has no Robolectric), so it must run instrumented.
 */
class QuickUnlockStoreTest {
  private fun freshStore(): QuickUnlockStore {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    return QuickUnlockStore(context, "test-${UUID.randomUUID()}")
  }

  @Test
  fun firstTimeSetupSucceedsWithoutProvingAnyExistingPin() {
    val store = freshStore()
    assertFalse(store.isPinConfigured)

    assertTrue(store.setInitialPin("111111"))

    assertTrue(store.isPinConfigured)
    assertTrue(store.matches("111111"))
    store.clear()
  }

  @Test
  fun setInitialPinRefusesToOverwriteAnAlreadyConfiguredPin() {
    val store = freshStore()
    store.setInitialPin("111111")

    // This is the exact bug: attacker holding a locked phone types any new PIN into the
    // "Настроить PIN" flow. setInitialPin must refuse once a PIN already exists.
    val overwritten = store.setInitialPin("999999")

    assertFalse(overwritten)
    assertTrue(store.matches("111111"))
    assertFalse(store.matches("999999"))
    store.clear()
  }

  @Test
  fun changePinRefusesWrongCurrentPinAndLeavesOriginalPinIntact() {
    val store = freshStore()
    store.setInitialPin("111111")

    val changed = store.changePin(current = "000000", new = "999999")

    assertFalse(changed)
    assertTrue("original PIN must still work", store.matches("111111"))
    assertFalse("attacker-chosen PIN must not have been written", store.matches("999999"))
    store.clear()
  }

  @Test
  fun changePinSucceedsOnlyWithProofOfTheCurrentPin() {
    val store = freshStore()
    store.setInitialPin("111111")

    val changed = store.changePin(current = "111111", new = "222222")

    assertTrue(changed)
    assertTrue(store.matches("222222"))
    assertFalse("old PIN must stop working after a legitimate change", store.matches("111111"))
    store.clear()
  }

  @Test
  fun repeatedWrongCurrentPinAttemptsLockOutChangePinLikeAFailedUnlock() {
    val store = freshStore()
    store.setInitialPin("111111")

    repeat(PinAttemptLimiter.maxFailures) { store.changePin(current = "000000", new = "222222") }

    val status = store.pinStatus()
    assertFalse("five wrong attempts must lock out further tries, same as unlockPIN", status.allowed)
    assertFalse(store.changePin(current = "111111", new = "222222"))
    assertTrue("PIN must remain the original one while locked out", store.matches("111111"))
    store.clear()
  }
}

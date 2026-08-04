package kg.alistore.core

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class QuickUnlockGateTest {
  @get:Rule val compose = createComposeRule()

  private fun freshConfiguredStore(): QuickUnlockStore {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val store = QuickUnlockStore(context, "gate-test-${UUID.randomUUID()}")
    store.setInitialPin("111111")
    return store
  }

  @Test
  fun changeButtonStaysDisabledWithoutTypingTheCurrentPin() {
    val store = freshConfiguredStore()
    compose.setContent { QuickUnlockGate("AliStore POS", "cashier", store, {}, {}) {} }

    // The "Текущий PIN" field only renders once a PIN already exists — proves the gate
    // knows this is a change, not a first-time setup.
    compose.onNodeWithTag("quick-unlock-current-pin").assertExists()

    // Attacker holding the locked phone does not know the real PIN and leaves it blank.
    compose.onNodeWithTag("quick-unlock-setup-pin").performTextReplacement("222222")
    compose.onNodeWithTag("quick-unlock-confirm-pin").performTextReplacement("222222")
    compose.onNodeWithTag("quick-unlock-pin-change-submit").assertIsNotEnabled()

    assertTrue(store.matches("111111"))
    assertFalse(store.matches("222222"))
    store.clear()
  }

  @Test
  fun typingTheWrongCurrentPinRejectsTheChangeAndKeepsTheOriginal() {
    val store = freshConfiguredStore()
    var unlockedCalls = 0
    compose.setContent { QuickUnlockGate("AliStore POS", "cashier", store, { unlockedCalls++ }, {}) {} }

    compose.onNodeWithTag("quick-unlock-current-pin").performTextReplacement("000000")
    compose.onNodeWithTag("quick-unlock-setup-pin").performTextReplacement("222222")
    compose.onNodeWithTag("quick-unlock-confirm-pin").performTextReplacement("222222")
    compose.onNodeWithTag("quick-unlock-pin-change-submit").performClick()

    compose.onNodeWithText("Неверный текущий PIN").assertExists()
    assertTrue("original PIN must still be the one that unlocks", store.matches("111111"))
    assertFalse("attacker PIN must never have been written", store.matches("222222"))
    assertEquals(0, unlockedCalls)
    store.clear()
  }

  @Test
  fun typingTheCorrectCurrentPinAllowsTheChange() {
    val store = freshConfiguredStore()
    compose.setContent { QuickUnlockGate("AliStore POS", "cashier", store, {}, {}) {} }

    compose.onNodeWithTag("quick-unlock-current-pin").performTextReplacement("111111")
    compose.onNodeWithTag("quick-unlock-setup-pin").performTextReplacement("222222")
    compose.onNodeWithTag("quick-unlock-confirm-pin").performTextReplacement("222222")
    compose.onNodeWithTag("quick-unlock-pin-change-submit").performClick()

    compose.onNodeWithText("PIN сохранён").assertExists()
    assertTrue(store.matches("222222"))
    assertFalse(store.matches("111111"))
    store.clear()
  }
}

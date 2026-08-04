package kg.alistore.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import kotlinx.coroutines.delay

data class PinAttemptStatus(
  val allowed: Boolean,
  val retryAfterSeconds: Long,
  val failures: Int,
  val lockedUntilMillis: Long,
)

internal object PinAttemptLimiter {
  const val maxFailures = 5
  const val lockoutMillis = 30_000L

  fun status(failures: Int, lockedUntilMillis: Long, nowMillis: Long): PinAttemptStatus {
    val remaining = (lockedUntilMillis - nowMillis).coerceAtLeast(0)
    return PinAttemptStatus(remaining == 0L, (remaining + 999) / 1000, failures, lockedUntilMillis)
  }

  fun afterFailure(failures: Int, lockedUntilMillis: Long, nowMillis: Long): Pair<Int, Long> {
    if (!status(failures, lockedUntilMillis, nowMillis).allowed) return failures to lockedUntilMillis
    val next = failures + 1
    return if (next >= maxFailures) 0 to nowMillis + lockoutMillis else next to 0L
  }
}

class QuickUnlockStore(context: Context, private val alias: String) {
  private val prefs = context.getSharedPreferences("alistore-quick-unlock", Context.MODE_PRIVATE)
  private val keyAlias = "alistore.quick.$alias"
  private val pinKey = "$alias.pin"
  private val failuresKey = "$alias.failures"
  private val lockedUntilKey = "$alias.locked-until"

  val isPinConfigured: Boolean
    get() = prefs.getString(pinKey, null)?.startsWith("v1:") == true

  /**
   * First-time PIN setup only. Refuses when a PIN is already configured — the only
   * legitimate way to replace an existing one is [changePin], which proves knowledge of
   * the current PIN. Without this split, anyone holding the phone on the locked gate
   * screen could set their own PIN over the real one and unlock the workspace.
   */
  fun setInitialPin(pin: String): Boolean {
    if (isPinConfigured) return false
    return writePin(pin)
  }

  /**
   * Replaces an existing PIN, but only after [current] is verified against the stored
   * one. A wrong [current] counts as a failed attempt against the same lockout counter
   * as a failed unlock, so this cannot be used to brute-force the PIN without limit.
   */
  fun changePin(current: String, new: String): Boolean {
    if (!pinStatus().allowed) return false
    if (!matches(current)) {
      registerPinFailure()
      return false
    }
    return writePin(new)
  }

  private fun writePin(pin: String): Boolean {
    if (pin.length != 6 || pin.any { !it.isDigit() }) return false
    return runCatching {
      val salt = java.util.UUID.randomUUID().toString()
      val digest = Base64.encodeToString(hmac(salt + pin), Base64.NO_WRAP)
      prefs.edit().putString(pinKey, "v1:$salt:$digest").putInt(failuresKey, 0).remove(lockedUntilKey).apply()
    }.isSuccess
  }

  fun matches(pin: String): Boolean {
    val stored = prefs.getString(pinKey, null) ?: return false
    val parts = stored.split(":", limit = 3)
    if (parts.size != 3 || parts[0] != "v1") return false
    return runCatching {
      val expected = Base64.decode(parts[2], Base64.NO_WRAP)
      MessageDigest.isEqual(expected, hmac(parts[1] + pin))
    }.getOrDefault(false)
  }

  fun pinStatus(nowMillis: Long = System.currentTimeMillis()): PinAttemptStatus = PinAttemptLimiter.status(
    prefs.getInt(failuresKey, 0),
    prefs.getLong(lockedUntilKey, 0L),
    nowMillis,
  )

  fun registerPinFailure(nowMillis: Long = System.currentTimeMillis()): PinAttemptStatus {
    val current = pinStatus(nowMillis)
    if (!current.allowed) return current
    val (failures, lockedUntil) = PinAttemptLimiter.afterFailure(current.failures, current.lockedUntilMillis, nowMillis)
    prefs.edit().putInt(failuresKey, failures).putLong(lockedUntilKey, lockedUntil).apply()
    return pinStatus(nowMillis)
  }

  fun registerPinSuccess() { prefs.edit().remove(failuresKey).remove(lockedUntilKey).apply() }

  fun clear() {
    prefs.edit().remove(pinKey).remove(failuresKey).remove(lockedUntilKey).apply()
    runCatching { KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(keyAlias) } }
  }

  private fun hmac(value: String): ByteArray {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(key())
    return mac.doFinal(value.toByteArray())
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(keyAlias, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore")
    generator.init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_SIGN).setDigests(KeyProperties.DIGEST_SHA256).build())
    return generator.generateKey()
  }
}

@Composable
fun QuickUnlockGate(
  title: String,
  username: String,
  store: QuickUnlockStore,
  onUnlocked: () -> Unit,
  onLogout: () -> Unit,
  content: @Composable () -> Unit,
) {
  val context = LocalContext.current
  // None of these may be rememberSaveable: that writes them into the on-disk
  // savedInstanceState bundle. `unlocked` surviving a process restart would make the lock
  // screen a no-op after the process is recreated, and `pin`/`currentPin`/`setup`/
  // `confirmation` are secrets that must never be persisted outside the encrypted store.
  var unlocked by remember { mutableStateOf(false) }
  var pin by remember { mutableStateOf("") }
  var currentPin by remember { mutableStateOf("") }
  var setup by remember { mutableStateOf("") }
  var confirmation by remember { mutableStateOf("") }
  var message by remember { mutableStateOf<String?>(null) }
  var pinStatus by remember { mutableStateOf(store.pinStatus()) }
  var biometricAvailable by remember { mutableStateOf(false) }

  LaunchedEffect(Unit) {
    val activity = context as? FragmentActivity ?: return@LaunchedEffect
    biometricAvailable = BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS
    if (!biometricAvailable) return@LaunchedEffect
    val executor = androidx.core.content.ContextCompat.getMainExecutor(activity)
    val prompt = BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { unlocked = true; onUnlocked() }
    })
    val info = BiometricPrompt.PromptInfo.Builder()
      .setTitle("$title · быстрый вход")
      .setSubtitle(username)
      .setDescription("Подтвердите личность, чтобы открыть рабочее место")
      .setNegativeButtonText("Использовать PIN")
      .build()
    runCatching { prompt.authenticate(info) }
  }

  LaunchedEffect(pinStatus.lockedUntilMillis) {
    while (!pinStatus.allowed) {
      delay(1_000)
      pinStatus = store.pinStatus()
    }
  }

  if (unlocked) { content(); return }
  Column(
    Modifier.fillMaxSize().background(StaffInk).padding(24.dp),
    verticalArrangement = Arrangement.Center,
  ) {
    Text(title, color = Color.White, style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
    Text(username, color = StaffMuted, modifier = Modifier.padding(top = 6.dp, bottom = 22.dp))
    Text(
      if (biometricAvailable) "Подтвердите биометрию или используйте PIN" else "Биометрия недоступна — используйте PIN",
      color = StaffMuted,
    )
    OutlinedTextField(pin, { pin = it.filter(Char::isDigit).take(6) }, label = { Text("6-значный PIN") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().testTag("quick-unlock-pin"))
    Button(onClick = {
      if (!pinStatus.allowed) pinStatus = store.pinStatus()
      else if (store.matches(pin)) { store.registerPinSuccess(); unlocked = true; onUnlocked() }
      else { pinStatus = store.registerPinFailure(); message = if (pinStatus.allowed) "Неверный PIN" else "Слишком много попыток" }
    }, enabled = pin.length == 6 && pinStatus.allowed, modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag("quick-unlock-pin-submit")) { Text("Открыть по PIN") }
    val pinConfigured = store.isPinConfigured
    if (pinConfigured) {
      // Changing an already-configured PIN must prove knowledge of the current one —
      // otherwise anyone holding the locked phone could set their own PIN here and unlock
      // the workspace with it, without ever passing biometrics or the real PIN.
      OutlinedTextField(currentPin, { currentPin = it.filter(Char::isDigit).take(6) }, label = { Text("Текущий PIN") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().padding(top = 18.dp).testTag("quick-unlock-current-pin"))
    }
    OutlinedTextField(setup, { setup = it.filter(Char::isDigit).take(6) }, label = { Text("Новый PIN") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().padding(top = if (pinConfigured) 8.dp else 18.dp).testTag("quick-unlock-setup-pin"))
    OutlinedTextField(confirmation, { confirmation = it.filter(Char::isDigit).take(6) }, label = { Text("Повторите PIN") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("quick-unlock-confirm-pin"))
    Button(
      onClick = {
        message = when {
          setup != confirmation -> "Введите одинаковые PIN-коды из 6 цифр"
          !pinConfigured -> if (store.setInitialPin(setup)) { pinStatus = store.pinStatus(); setup = ""; confirmation = ""; "PIN сохранён" } else "Введите одинаковые PIN-коды из 6 цифр"
          !pinStatus.allowed -> "Слишком много попыток"
          store.changePin(currentPin, setup) -> { pinStatus = store.pinStatus(); currentPin = ""; setup = ""; confirmation = ""; "PIN сохранён" }
          else -> { pinStatus = store.pinStatus(); "Неверный текущий PIN" }
        }
      },
      enabled = setup.length == 6 && confirmation.length == 6 && (!pinConfigured || (currentPin.length == 6 && pinStatus.allowed)),
      modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("quick-unlock-pin-change-submit"),
    ) { Text(if (pinConfigured) "Изменить PIN" else "Настроить PIN") }
    message?.let { Text(it, color = StaffCoral, modifier = Modifier.padding(top = 12.dp).testTag("quick-unlock-message")) }
    if (!pinStatus.allowed) Text("Слишком много попыток. Повторите через ${pinStatus.retryAfterSeconds} сек.", color = Design3.gold, modifier = Modifier.padding(top = 8.dp))
    Button(onClick = { store.clear(); onLogout() }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Text("Выйти из аккаунта") }
  }
}

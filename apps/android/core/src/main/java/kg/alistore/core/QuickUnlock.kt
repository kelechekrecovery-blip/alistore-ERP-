package kg.alistore.core

import android.content.Context
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import java.security.MessageDigest

class QuickUnlockStore(context: Context, private val alias: String) {
  private val prefs = context.getSharedPreferences("alistore-quick-unlock", Context.MODE_PRIVATE)
  val isPinConfigured: Boolean get() = prefs.contains("$alias.pin")

  fun savePin(pin: String): Boolean {
    if (pin.length != 6 || pin.any { !it.isDigit() }) return false
    val salt = java.util.UUID.randomUUID().toString()
    prefs.edit().putString("$alias.pin", "$salt:${hash(salt + pin)}").apply()
    return true
  }

  fun matches(pin: String): Boolean {
    val stored = prefs.getString("$alias.pin", null) ?: return false
    val parts = stored.split(":", limit = 2)
    return parts.size == 2 && hash(parts[0] + pin) == parts[1]
  }

  private fun hash(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
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
  var unlocked by rememberSaveable { mutableStateOf(false) }
  var pin by rememberSaveable { mutableStateOf("") }
  var setup by rememberSaveable { mutableStateOf("") }
  var confirmation by rememberSaveable { mutableStateOf("") }
  var message by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(Unit) {
    val activity = context as? FragmentActivity ?: return@LaunchedEffect
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

  if (unlocked) { content(); return }
  Column(
    Modifier.fillMaxSize().background(StaffInk).padding(24.dp),
    verticalArrangement = Arrangement.Center,
  ) {
    Text(title, color = Color.White, style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
    Text(username, color = StaffMuted, modifier = Modifier.padding(top = 6.dp, bottom = 22.dp))
    OutlinedTextField(pin, { pin = it.filter(Char::isDigit).take(6) }, label = { Text("6-значный PIN") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
    Button(onClick = { if (store.matches(pin)) { unlocked = true; onUnlocked() } else message = "Неверный PIN" }, enabled = pin.length == 6, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Text("Открыть по PIN") }
    OutlinedTextField(setup, { setup = it.filter(Char::isDigit).take(6) }, label = { Text("Новый PIN") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().padding(top = 18.dp))
    OutlinedTextField(confirmation, { confirmation = it.filter(Char::isDigit).take(6) }, label = { Text("Повторите PIN") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
    Button(onClick = { message = if (setup == confirmation && store.savePin(setup)) "PIN сохранён" else "Введите одинаковые PIN-коды из 6 цифр" }, enabled = setup.length == 6 && confirmation.length == 6, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Настроить PIN") }
    message?.let { Text(it, color = StaffCoral, modifier = Modifier.padding(top = 12.dp)) }
    Button(onClick = onLogout, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Text("Выйти из аккаунта") }
  }
}

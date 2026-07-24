package kg.alistore.core

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

private val EmailInk = Design3.screen
private val EmailSurface = Design3.surface
private val EmailLine = Design3.hairline
private val EmailMuted = Design3.textMuted
private val EmailCoral = Design3.orange
private val EmailLime = Design3.lime

/**
 * Привязка почты как второго канала входа. Адрес пишется в аккаунт только после
 * подтверждения кода из письма — иначе чужую почту можно было бы «занять».
 */
@Composable
internal fun ClientEmailAttachScreen(
  session: AuthState.SignedIn,
  manager: AuthSessionManager,
  onBack: () -> Unit,
  onAuthState: (AuthState) -> Unit = {},
  modifier: Modifier = Modifier,
) {
  val scope = rememberCoroutineScope()
  var form by remember { mutableStateOf(EmailAuthForm()) }

  /** Один повтор со свежим токеном — тот же приём, что и в остальных экранах кабинета. */
  suspend fun <T> withFreshToken(block: suspend (String) -> T): T {
    var attempt = runCatching { block(session.tokens.accessToken) }
    if (attempt.exceptionOrNull().nativeUnauthorized()) {
      val renewed = manager.refresh(session)
      onAuthState(renewed)
      if (renewed is AuthState.SignedIn) attempt = runCatching { block(renewed.tokens.accessToken) }
    }
    return attempt.getOrThrow()
  }

  LazyColumn(
    modifier.fillMaxSize().background(EmailInk).statusBarsPadding().padding(18.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    item {
      Button(onClick = onBack, shape = RoundedCornerShape(8.dp), colors = ButtonDefaults.buttonColors(containerColor = EmailSurface, contentColor = Color.White)) { Text("Назад") }
      Text("Почта для входа", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 14.dp).testTag("email-attach-title"))
      Text(
        "Адрес — второй способ войти в этот же аккаунт. Телефон ${session.user.phone.orEmpty()} остаётся основным.",
        color = EmailMuted,
        fontSize = 13.sp,
        modifier = Modifier.padding(top = 6.dp, bottom = 8.dp),
      )
    }
    item {
      Column(Modifier.fillMaxWidth().background(EmailSurface, RoundedCornerShape(8.dp)).padding(14.dp)) {
        OutlinedTextField(
          value = form.email,
          onValueChange = { form = form.withEmail(it) },
          enabled = !form.busy && !form.codeSent,
          label = { Text("Почта") },
          placeholder = { Text("you@example.com") },
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
          singleLine = true,
          modifier = Modifier.fillMaxWidth().testTag("email-attach-input"),
          colors = emailFieldColors(),
        )
        if (form.codeSent) {
          OutlinedTextField(
            value = form.code,
            onValueChange = { form = form.withCode(it) },
            enabled = !form.busy,
            label = { Text("Код из письма") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("email-attach-code"),
            colors = emailFieldColors(),
          )
        }
        form.error?.let { Text(it, color = EmailCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp).testTag("email-attach-error")) }
        form.hint?.let { Text(it, color = EmailMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp).testTag("email-attach-hint")) }
        Button(
          onClick = {
            val current = form
            form = current.submitting()
            scope.launch {
              form = if (!current.codeSent) {
                runCatching { withFreshToken { token -> manager.requestEmailAttach(current.email, token) } }
                  .fold(onSuccess = { form.challengeIssued(it) }, onFailure = { form.failed(it) })
              } else {
                runCatching { withFreshToken { token -> manager.confirmEmailAttach(current.email, current.code, token) } }
                  .fold(
                    onSuccess = { form.confirmed("Адрес ${current.email} привязан — теперь по нему можно войти") },
                    onFailure = { form.failed(it) },
                  )
              }
            }
          },
          enabled = form.canSubmit,
          modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag("email-attach-action"),
          colors = ButtonDefaults.buttonColors(containerColor = EmailLime, contentColor = EmailInk),
          shape = RoundedCornerShape(8.dp),
        ) { Text(if (form.busy) "Подождите…" else if (form.codeSent) "Подтвердить" else "Отправить код", fontWeight = FontWeight.Bold) }
        if (form.codeSent) {
          Button(
            onClick = { form = form.restart() },
            enabled = !form.busy,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("email-attach-restart"),
            colors = ButtonDefaults.buttonColors(containerColor = EmailInk, contentColor = Color.White),
            shape = RoundedCornerShape(8.dp),
          ) { Text("Изменить адрес") }
        }
      }
    }
  }
}

@Composable
private fun emailFieldColors() = OutlinedTextFieldDefaults.colors(
  focusedTextColor = Color.White,
  unfocusedTextColor = Color.White,
  focusedBorderColor = EmailLime,
  unfocusedBorderColor = EmailLine,
  focusedLabelColor = EmailLime,
  unfocusedLabelColor = EmailMuted,
  cursorColor = EmailLime,
)

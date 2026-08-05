package kg.alistore.core

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.autofill.contentType
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val AuthInk = Design3.screen
private val AuthSurface = Design3.surface
private val AuthLine = Design3.hairline
private val AuthMuted = Design3.textMuted
private val AuthCoral = Design3.orange
private val AuthLime = Design3.lime

@Composable
internal fun ClientAccount(
  state: AuthState,
  manager: AuthSessionManager,
  onState: (AuthState) -> Unit,
  favoriteCount: Int,
  cartCount: Int,
  onLogout: (AuthState.SignedIn) -> Unit,
  modifier: Modifier = Modifier,
  apiBaseUrl: String = "",
  route: String? = null,
  onRoute: (String?) -> Unit = {},
  orderRefreshRevision: Int = 0,
  paymentReturn: PaymentReturnRoute? = null,
  paymentReturnBaseUrl: String = "alistore://payment-return",
  googleSignInProvider: GoogleSignInProvider? = null,
) {
  when (state) {
    AuthState.Restoring -> Column(modifier.fillMaxSize().background(AuthInk), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
      CircularProgressIndicator(color = AuthLime)
      Text("Восстанавливаем сессию", color = AuthMuted, modifier = Modifier.padding(top = 12.dp))
    }
    is AuthState.SignedIn -> SignedInAccount(state, manager, onState, onLogout, favoriteCount, cartCount, modifier, apiBaseUrl, route, onRoute, orderRefreshRevision, paymentReturn, paymentReturnBaseUrl)
    is AuthState.SocialEnrollment -> SocialEnrollmentLogin(state, manager, onState, modifier)
    else -> OtpLogin(state, manager, onState, googleSignInProvider, modifier)
  }
}

@Composable
private fun OtpLogin(
  state: AuthState,
  manager: AuthSessionManager,
  onState: (AuthState) -> Unit,
  googleSignInProvider: GoogleSignInProvider?,
  modifier: Modifier,
) {
  var channel by remember { mutableStateOf(AuthChannel.Phone) }
  val scope = rememberCoroutineScope()
  var googleBusy by remember { mutableStateOf(false) }
  var googleError by remember { mutableStateOf<String?>(null) }
  LazyColumn(modifier.fillMaxSize().background(AuthInk).padding(20.dp), verticalArrangement = Arrangement.Center) {
    item {
      Text("Войти или создать аккаунт", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.Black)
      Text(
        if (channel == AuthChannel.Phone) "Введите телефон и код из SMS. Если аккаунта ещё нет, мы создадим его автоматически."
        else "Почта — дополнительный вход в тот же аккаунт. Код придёт только на ранее привязанный адрес.",
        color = AuthMuted,
        fontSize = 13.sp,
        modifier = Modifier.padding(top = 7.dp, bottom = 14.dp),
      )
      if (googleSignInProvider != null) {
        Button(
          onClick = {
            scope.launch {
              googleBusy = true
              googleError = null
              try {
                val credential = googleSignInProvider.signIn()
                  when (val next = manager.loginWithGoogle(credential)) {
                    is AuthState.SignedIn, is AuthState.SocialEnrollment -> onState(next)
                    is AuthState.Failed -> googleError = next.message
                    else -> Unit
                  }
              } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
              } catch (error: Throwable) {
                googleError = error.message ?: "Не удалось войти через Google"
              } finally {
                googleBusy = false
              }
            }
          },
          enabled = !googleBusy,
          modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp).testTag("auth-google"),
          colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = AuthInk),
          shape = RoundedCornerShape(8.dp),
        ) { Text(if (googleBusy) "Открываем Google…" else "Продолжить с Google", fontWeight = FontWeight.Bold) }
        googleError?.let {
          Text(it, color = AuthCoral, fontSize = 12.sp, modifier = Modifier.padding(bottom = 10.dp).testTag("auth-google-error"))
        }
        Text("или", color = AuthMuted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 10.dp))
      }
      AuthChannelSwitch(channel) { channel = it }
      when (channel) {
        AuthChannel.Phone -> PhoneOtpLogin(state, manager, onState)
        AuthChannel.Email -> EmailOtpLogin(manager, onState)
      }
    }
  }
}

@Composable
private fun SocialEnrollmentLogin(
  state: AuthState.SocialEnrollment,
  manager: AuthSessionManager,
  onState: (AuthState) -> Unit,
  modifier: Modifier,
) {
  val scope = rememberCoroutineScope()
  var phone by remember { mutableStateOf("+996") }
  var code by remember { mutableStateOf("") }
  var codeRequested by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var message by remember { mutableStateOf<String?>(null) }
  var resendAvailableAtMillis by remember { mutableStateOf<Long?>(null) }
  var nowMillis by remember { mutableStateOf(System.currentTimeMillis()) }
  val expired = nowMillis >= state.expiresAtMillis
  val resendSeconds = resendSeconds(resendAvailableAtMillis, nowMillis)
  val validPhone = phone.filter(Char::isDigit).length == 12
  val validCode = code.length == 6 && code.all(Char::isDigit)

  LaunchedEffect(state.expiresAtMillis, resendAvailableAtMillis) {
    val deadline = maxOf(state.expiresAtMillis, resendAvailableAtMillis ?: 0L)
    while (nowMillis < deadline) {
      delay(1_000)
      nowMillis = System.currentTimeMillis()
    }
  }

  LazyColumn(modifier.fillMaxSize().background(AuthInk).padding(20.dp), verticalArrangement = Arrangement.Center) {
    item {
      Text(if (expired) "Срок подтверждения истёк" else "Подтвердите номер телефона", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.Black)
      Text(
        if (expired) "Начните вход через Google заново, чтобы получить новое безопасное подтверждение."
        else "Google-аккаунт подтверждён. Телефон нужен для заказов, доставки и восстановления доступа.",
        color = AuthMuted,
        fontSize = 13.sp,
        modifier = Modifier.padding(top = 7.dp, bottom = 14.dp),
      )
      if (!expired) OutlinedTextField(
        value = phone,
        onValueChange = { phone = it.take(18); message = null },
        enabled = !busy && !codeRequested,
        label = { Text("Телефон") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        singleLine = true,
        modifier = Modifier.fillMaxWidth().testTag("social-enrollment-phone"),
        colors = authFieldColors(),
      )
      if (!expired && codeRequested) {
        OutlinedTextField(
          value = code,
          onValueChange = { code = it.filter(Char::isDigit).take(6); message = null },
          label = { Text("Код из SMS") },
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
          singleLine = true,
          modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
            .contentType(ContentType.SmsOtpCode)
            .testTag("social-enrollment-code"),
          colors = authFieldColors(),
        )
      }
      message?.let { Text(it, color = AuthCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp)) }
      if (!expired) Button(
        onClick = {
          scope.launch {
            busy = true
            try {
              if (!codeRequested) {
                val challenge = manager.requestSocialEnrollmentOtp(phone)
                  codeRequested = true
                  challenge.devCode?.let { code = it }
                  resendAvailableAtMillis = System.currentTimeMillis() + OTP_RESEND_DELAY_MILLIS
                  message = "Код отправлен"
              } else {
                when (val next = manager.completeSocialEnrollment(phone, code)) {
                  is AuthState.SignedIn -> onState(next)
                  is AuthState.Failed -> message = next.message
                  else -> Unit
                }
              }
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
              throw cancelled
            } catch (error: Throwable) {
              message = error.message ?: "Не удалось подтвердить номер"
            } finally {
              busy = false
            }
          }
        },
        enabled = !busy && if (codeRequested) validCode else validPhone,
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp).testTag("social-enrollment-action"),
        colors = ButtonDefaults.buttonColors(containerColor = AuthLime, contentColor = AuthInk),
        shape = RoundedCornerShape(8.dp),
      ) { Text(if (busy) "Подождите…" else if (codeRequested) "Подтвердить" else "Получить код", fontWeight = FontWeight.Bold) }
      if (!expired && codeRequested) {
        Button(
          onClick = {
            scope.launch {
              busy = true
              try {
                val challenge = manager.requestSocialEnrollmentOtp(phone)
                challenge.devCode?.let { code = it }
                resendAvailableAtMillis = System.currentTimeMillis() + OTP_RESEND_DELAY_MILLIS
                message = "Новый код отправлен"
              } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
              } catch (error: Throwable) {
                message = error.message ?: "Не удалось отправить код"
              } finally {
                busy = false
              }
            }
          },
          enabled = !busy && resendSeconds == 0,
          modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("social-enrollment-resend"),
          colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = Color.White),
          shape = RoundedCornerShape(8.dp),
        ) { Text(if (resendSeconds > 0) "Отправить ещё раз через $resendSeconds сек." else "Отправить код ещё раз") }
        Button(
          onClick = { codeRequested = false; code = ""; message = null; resendAvailableAtMillis = null },
          enabled = !busy,
          modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("social-enrollment-change-phone"),
          colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = Color.White),
          shape = RoundedCornerShape(8.dp),
        ) { Text("Изменить номер") }
      }
      Button(
        onClick = { onState(manager.cancelSocialEnrollment()) },
        enabled = !busy,
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("social-enrollment-cancel"),
        colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = Color.White),
        shape = RoundedCornerShape(8.dp),
      ) { Text(if (expired) "Вернуться ко входу" else "Отменить вход через ${state.provider.displayName}") }
    }
  }
}

private val SocialProvider.displayName: String
  get() = when (this) {
    SocialProvider.GOOGLE -> "Google"
  }

@Composable
private fun AuthChannelSwitch(channel: AuthChannel, onChannel: (AuthChannel) -> Unit) {
  Row(Modifier.fillMaxWidth().padding(bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    AuthChannelTab("Телефон", "auth-channel-phone", channel == AuthChannel.Phone, Modifier.weight(1f)) { onChannel(AuthChannel.Phone) }
    AuthChannelTab("Почта", "auth-channel-email", channel == AuthChannel.Email, Modifier.weight(1f)) { onChannel(AuthChannel.Email) }
  }
}

@Composable
private fun AuthChannelTab(label: String, tag: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
  Text(
    label,
    color = if (selected) AuthInk else Color.White,
    fontSize = 13.sp,
    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
    modifier = modifier
      .background(if (selected) AuthLime else AuthSurface, RoundedCornerShape(8.dp))
      .clickable(onClick = onClick)
      .padding(vertical = 11.dp, horizontal = 14.dp)
      .testTag(tag),
  )
}

/**
 * Вход по почте. Экран знает только два шага — адрес и код; вся логика переходов
 * живёт в [EmailAuthForm], поэтому она проверяется юнит-тестами без Compose.
 */
@Composable
private fun EmailOtpLogin(manager: AuthSessionManager, onState: (AuthState) -> Unit) {
  val scope = rememberCoroutineScope()
  var form by remember { mutableStateOf(EmailAuthForm()) }
  var nowMillis by remember { mutableStateOf(System.currentTimeMillis()) }
  val emailResendSeconds = form.resendSeconds(nowMillis)

  LaunchedEffect(form.resendAvailableAtMillis) {
    val deadline = form.resendAvailableAtMillis ?: return@LaunchedEffect
    do {
      nowMillis = System.currentTimeMillis()
      if (nowMillis >= deadline) break
      delay(1_000)
    } while (true)
  }

  OutlinedTextField(
    value = form.email,
    onValueChange = { form = form.withEmail(it) },
    enabled = !form.busy && !form.codeSent,
    label = { Text("Почта") },
    placeholder = { Text("you@example.com") },
    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
    singleLine = true,
    modifier = Modifier.fillMaxWidth().testTag("auth-email"),
    colors = authFieldColors(),
  )
  if (form.codeSent) {
    OutlinedTextField(
      value = form.code,
      onValueChange = { form = form.withCode(it) },
      enabled = !form.busy,
      label = { Text("Код из письма") },
      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
      singleLine = true,
      modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
        .contentType(ContentType.SmsOtpCode)
        .semantics { contentDescription = "Одноразовый код из письма" }
        .testTag("auth-email-code"),
      colors = authFieldColors(),
    )
  }
  form.error?.let { Text(it, color = AuthCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp).testTag("auth-email-error")) }
  form.hint?.let { Text(it, color = AuthMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp).testTag("auth-email-hint")) }
  Button(
    onClick = {
      val current = form
      form = current.submitting()
      scope.launch {
        form = if (!current.codeSent) {
          runCatching { manager.requestEmailOtp(current.email) }
            .fold(onSuccess = { form.challengeIssued(it) }, onFailure = { form.failed(it) })
        } else {
          when (val next = manager.verifyEmail(current.email, current.code)) {
            is AuthState.SignedIn -> { onState(next); form.confirmed("Вход выполнен") }
            else -> form.copy(busy = false, hint = null, error = (next as AuthState.Failed).message)
          }
        }
      }
    },
    enabled = form.canSubmit,
    modifier = Modifier.fillMaxWidth().padding(top = 14.dp).testTag("auth-email-action"),
    colors = ButtonDefaults.buttonColors(containerColor = AuthLime, contentColor = AuthInk),
    shape = RoundedCornerShape(8.dp),
  ) { Text(if (form.busy) "Подождите…" else if (form.codeSent) "Войти" else "Получить код", fontWeight = FontWeight.Bold) }
  if (form.codeSent) {
    Button(
      onClick = {
        val current = form
        form = current.submitting()
        scope.launch {
          form = runCatching { manager.requestEmailOtp(current.email) }
            .fold(onSuccess = { form.challengeIssued(it) }, onFailure = { form.failed(it) })
        }
      },
      enabled = !form.busy && emailResendSeconds == 0,
      modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("auth-email-resend"),
      colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = Color.White),
      shape = RoundedCornerShape(8.dp),
    ) {
      Text(if (emailResendSeconds > 0) "Отправить ещё раз через $emailResendSeconds сек." else "Отправить код ещё раз")
    }
    Button(
      onClick = { form = form.restart() },
      enabled = !form.busy,
      modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("auth-email-restart"),
      colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = Color.White),
      shape = RoundedCornerShape(8.dp),
    ) { Text("Изменить адрес") }
  }
}

@Composable
private fun PhoneOtpLogin(state: AuthState, manager: AuthSessionManager, onState: (AuthState) -> Unit) {
  val scope = rememberCoroutineScope()
  var phone by remember { mutableStateOf("+996") }
  var code by remember { mutableStateOf("") }
  var codeRequested by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var message by remember(state) { mutableStateOf((state as? AuthState.Failed)?.message) }
  var resendAvailableAtMillis by remember { mutableStateOf<Long?>(null) }
  var nowMillis by remember { mutableStateOf(System.currentTimeMillis()) }
  val phoneResendSeconds = resendSeconds(resendAvailableAtMillis, nowMillis)
  val validPhone = phone.filter(Char::isDigit).length == 12
  val validCode = code.length == 6 && code.all(Char::isDigit)

  LaunchedEffect(resendAvailableAtMillis) {
    val deadline = resendAvailableAtMillis ?: return@LaunchedEffect
    do {
      nowMillis = System.currentTimeMillis()
      if (nowMillis >= deadline) break
      delay(1_000)
    } while (true)
  }

  OutlinedTextField(
    value = phone,
    onValueChange = { phone = it.take(18); message = null },
    enabled = !busy && !codeRequested,
    label = { Text("Телефон") },
    placeholder = { Text("+996 700 12 34 56") },
    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
    singleLine = true,
    modifier = Modifier.fillMaxWidth().testTag("auth-phone"),
    colors = authFieldColors(),
  )
  if (codeRequested) {
    OutlinedTextField(
      value = code,
      onValueChange = { code = it.filter(Char::isDigit).take(6); message = null },
      label = { Text("Код из SMS") },
      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
      singleLine = true,
      modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
        .contentType(ContentType.SmsOtpCode)
        .semantics { contentDescription = "Одноразовый код из SMS" }
        .testTag("auth-code"),
      colors = authFieldColors(),
    )
  }
  if (!message.isNullOrBlank()) Text(message!!, color = AuthCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
  Button(
    onClick = {
      scope.launch {
        busy = true
        if (!codeRequested) {
          runCatching { manager.requestOtp(phone) }
            .onSuccess { challenge ->
              codeRequested = true
              challenge.devCode?.let { code = it }
              resendAvailableAtMillis = System.currentTimeMillis() + OTP_RESEND_DELAY_MILLIS
              message = "Код отправлен"
            }
            .onFailure { message = it.message ?: "Не удалось отправить код" }
        } else {
          val next = manager.verify(phone, code)
          if (next is AuthState.SignedIn) onState(next) else message = (next as AuthState.Failed).message
        }
        busy = false
      }
    },
    enabled = !busy && if (codeRequested) validCode else validPhone,
    modifier = Modifier.fillMaxWidth().padding(top = 14.dp).testTag("auth-action"),
    colors = ButtonDefaults.buttonColors(containerColor = AuthLime, contentColor = AuthInk),
    shape = RoundedCornerShape(8.dp),
  ) { Text(if (busy) "Подождите…" else if (codeRequested) "Войти" else "Получить код", fontWeight = FontWeight.Bold) }
  if (codeRequested) {
    Button(
      onClick = {
        scope.launch {
          busy = true
          runCatching { manager.requestOtp(phone) }
            .onSuccess { challenge ->
              challenge.devCode?.let { code = it }
              resendAvailableAtMillis = System.currentTimeMillis() + OTP_RESEND_DELAY_MILLIS
              message = "Новый код отправлен"
            }
            .onFailure { message = it.message ?: "Не удалось отправить код" }
          busy = false
        }
      },
      enabled = !busy && phoneResendSeconds == 0,
      modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("auth-resend"),
      colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = Color.White),
      shape = RoundedCornerShape(8.dp),
    ) {
      Text(if (phoneResendSeconds > 0) "Отправить ещё раз через $phoneResendSeconds сек." else "Отправить код ещё раз")
    }
    Button(
      onClick = {
        codeRequested = false
        code = ""
        message = null
        resendAvailableAtMillis = null
      },
      enabled = !busy,
      modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
      colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = Color.White),
      shape = RoundedCornerShape(8.dp),
    ) { Text("Изменить номер") }
  }
}

internal fun resendSeconds(deadlineMillis: Long?, nowMillis: Long): Int {
  val deadline = deadlineMillis ?: return 0
  return ((deadline - nowMillis).coerceAtLeast(0) + 999).div(1_000).toInt()
}

@Composable
private fun SignedInAccount(
  state: AuthState.SignedIn,
  manager: AuthSessionManager,
  onState: (AuthState) -> Unit,
  onLogout: (AuthState.SignedIn) -> Unit,
  favoriteCount: Int,
  cartCount: Int,
  modifier: Modifier,
  apiBaseUrl: String,
  route: String?,
  onRoute: (String?) -> Unit,
  orderRefreshRevision: Int,
  paymentReturn: PaymentReturnRoute?,
  paymentReturnBaseUrl: String,
) {
  if (route == "orders") {
    ClientOrdersScreen(apiBaseUrl, state, orderRefreshRevision, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState, paymentReturn = paymentReturn, paymentReturnBaseUrl = paymentReturnBaseUrl)
    return
  }
  if (route == "devices") {
    ClientDevicesScreen(apiBaseUrl, state, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
    return
  }
  if (route == "support") {
    ClientSupportScreen(apiBaseUrl, state, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
    return
  }
  if (route == "returns") {
    ClientReturnsScreen(apiBaseUrl, state, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
    return
  }
  if (route == "tradeins") {
    ClientTradeInsScreen(apiBaseUrl, state, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
    return
  }
  if (route == "bonuses") {
    ClientBonusesScreen(apiBaseUrl, state, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
    return
  }
  if (route == "addresses") {
    ClientAddressesScreen(apiBaseUrl, state, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
    return
  }
  if (route == "email") {
    ClientEmailAttachScreen(state, manager, { onRoute(null) }, onState, modifier)
    return
  }
  if (route == "settings") {
    ClientSettingsScreen(apiBaseUrl, state, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
    return
  }
  val scope = rememberCoroutineScope()
  val context = LocalContext.current
  // Null when the base URL is missing (e.g. previews/tests) — data actions then just report.
  val accountGateway = remember(apiBaseUrl) { runCatching { ApiClient(apiBaseUrl) }.getOrNull() }
  var busy by remember { mutableStateOf(false) }
  var dataBusy by remember { mutableStateOf(false) }
  var dataMessage by remember { mutableStateOf<String?>(null) }
  var showDeleteConfirm by remember { mutableStateOf(false) }
  var pendingExport by remember { mutableStateOf<String?>(null) }
  val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
    val content = pendingExport
    pendingExport = null
    if (uri != null && content != null) {
      scope.launch {
        dataMessage = runCatching {
          withContext(Dispatchers.IO) {
            context.contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray()) }
              ?: throw java.io.IOException("Нет доступа к файлу")
          }
        }.fold(onSuccess = { "Данные сохранены в файл" }, onFailure = { it.message ?: "Не удалось сохранить файл" })
      }
    }
  }

  /** Retries an account call once with a refreshed token, mirroring the account screens. */
  suspend fun <T> withFreshToken(block: suspend (String) -> T): T {
    var attempt = runCatching { block(state.tokens.accessToken) }
    if (attempt.exceptionOrNull().nativeUnauthorized()) {
      val renewed = manager.refresh(state); onState(renewed)
      if (renewed is AuthState.SignedIn) attempt = runCatching { block(renewed.tokens.accessToken) }
    }
    return attempt.getOrThrow()
  }

  LazyColumn(modifier.fillMaxSize().background(AuthInk).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    item {
      Text("Кабинет", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.testTag("account-title"))
      Text(state.user.phone ?: "Профиль AliStore", color = AuthLime, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
    }
    items(listOf("Мои заказы", "Бонусы", "Мои устройства", "Гарантия", "Возвраты", "Trade-in", "Адреса", "Почта для входа", "Поддержка", "Настройки")) { title ->
      Text(
        title,
        color = Color.White,
        modifier = Modifier.fillMaxWidth().background(AuthSurface, RoundedCornerShape(8.dp))
          .clickable(enabled = true) {
            onRoute(when (title) {
              "Мои заказы" -> "orders"
              "Возвраты" -> "returns"
              "Trade-in" -> "tradeins"
              "Поддержка" -> "support"
              "Бонусы" -> "bonuses"
              "Адреса" -> "addresses"
              "Почта для входа" -> "email"
              "Настройки" -> "settings"
              else -> "devices"
            })
          }
          .padding(16.dp),
      )
    }
    item {
      Text("Мои данные", color = AuthMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
      Button(
        onClick = {
          val gateway = accountGateway
          if (gateway == null) {
            dataMessage = "Нет адреса API"
          } else scope.launch {
            dataBusy = true; dataMessage = null
            runCatching { withFreshToken { token -> gateway.exportData(token) } }
              .onSuccess { pendingExport = it; exportLauncher.launch("alistore-my-data.json") }
              .onFailure { dataMessage = it.message ?: "Не удалось выгрузить данные" }
            dataBusy = false
          }
        },
        enabled = !busy && !dataBusy,
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("account-export"),
        colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = Color.White),
        shape = RoundedCornerShape(8.dp),
      ) { Text(if (dataBusy) "Подождите…" else "Скачать мои данные", fontWeight = FontWeight.Bold) }
      Button(
        onClick = { showDeleteConfirm = true },
        enabled = !busy && !dataBusy,
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("account-delete"),
        colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = AuthCoral),
        shape = RoundedCornerShape(8.dp),
      ) { Text("Удалить аккаунт", fontWeight = FontWeight.Bold) }
      dataMessage?.let { Text(it, color = AuthMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)) }
    }
    item {
      Text("Избранное: $favoriteCount · Корзина: $cartCount", color = AuthMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
      Button(
        onClick = { onLogout(state) },
        enabled = !busy,
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp).testTag("auth-logout"),
        colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = AuthCoral),
        shape = RoundedCornerShape(8.dp),
      ) { Text(if (busy) "Выходим…" else "Выйти", fontWeight = FontWeight.Bold) }
    }
  }

  if (showDeleteConfirm) {
    AlertDialog(
      onDismissRequest = { if (!dataBusy) showDeleteConfirm = false },
      title = { Text("Удалить аккаунт?") },
      text = { Text("Профиль, адреса и сессии будут удалены без восстановления. Заказы и история покупок останутся у магазина — они нужны для бухгалтерии.") },
      confirmButton = {
        TextButton(
          enabled = !dataBusy,
          onClick = {
            val gateway = accountGateway
            if (gateway == null) {
              showDeleteConfirm = false; dataMessage = "Нет адреса API"
            } else scope.launch {
              dataBusy = true
              runCatching { withFreshToken { token -> gateway.deleteAccount(token) } }
                .onSuccess {
                  showDeleteConfirm = false
                  dataBusy = false
                  onLogout(state)
                }
                .onFailure { dataBusy = false; showDeleteConfirm = false; dataMessage = it.message ?: "Не удалось удалить аккаунт" }
            }
          },
        ) { Text(if (dataBusy) "Удаляем…" else "Удалить навсегда", color = AuthCoral, fontWeight = FontWeight.Bold) }
      },
      dismissButton = {
        TextButton(enabled = !dataBusy, onClick = { showDeleteConfirm = false }) { Text("Отмена") }
      },
    )
  }
}

@Composable
private fun authFieldColors() = OutlinedTextFieldDefaults.colors(
  focusedTextColor = Color.White,
  unfocusedTextColor = Color.White,
  focusedBorderColor = AuthLime,
  unfocusedBorderColor = AuthLine,
  focusedLabelColor = AuthLime,
  unfocusedLabelColor = AuthMuted,
  cursorColor = AuthLime,
)

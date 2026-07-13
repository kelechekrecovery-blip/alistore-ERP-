package kg.alistore.core

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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

private val AuthInk = Color(0xFF16130F)
private val AuthSurface = Color(0xFF221E19)
private val AuthLine = Color(0xFF342E28)
private val AuthMuted = Color(0xFFA79C92)
private val AuthCoral = Color(0xFFFF6B57)
private val AuthLime = Color(0xFFC8F04B)

@Composable
internal fun ClientAccount(
  state: AuthState,
  manager: AuthSessionManager,
  onState: (AuthState) -> Unit,
  favoriteCount: Int,
  cartCount: Int,
  modifier: Modifier = Modifier,
  apiBaseUrl: String = "",
  route: String? = null,
  onRoute: (String?) -> Unit = {},
  orderRefreshRevision: Int = 0,
) {
  when (state) {
    AuthState.Restoring -> Column(modifier.fillMaxSize().background(AuthInk), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
      CircularProgressIndicator(color = AuthLime)
      Text("Восстанавливаем сессию", color = AuthMuted, modifier = Modifier.padding(top = 12.dp))
    }
    is AuthState.SignedIn -> SignedInAccount(state, manager, onState, favoriteCount, cartCount, modifier, apiBaseUrl, route, onRoute, orderRefreshRevision)
    else -> OtpLogin(state, manager, onState, modifier)
  }
}

@Composable
private fun OtpLogin(state: AuthState, manager: AuthSessionManager, onState: (AuthState) -> Unit, modifier: Modifier) {
  val scope = rememberCoroutineScope()
  var phone by remember { mutableStateOf("+996") }
  var code by remember { mutableStateOf("") }
  var codeRequested by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var message by remember(state) { mutableStateOf((state as? AuthState.Failed)?.message) }
  val validPhone = phone.filter(Char::isDigit).length == 12
  val validCode = code.length == 6 && code.all(Char::isDigit)

  LazyColumn(modifier.fillMaxSize().background(AuthInk).padding(20.dp), verticalArrangement = Arrangement.Center) {
    item {
      Text("Вход в AliStore", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.Black)
      Text("Заказы, гарантия и бонусы привязаны к номеру телефона", color = AuthMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 7.dp, bottom = 20.dp))
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
          modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("auth-code"),
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
                .onSuccess { challenge -> codeRequested = true; challenge.devCode?.let { code = it }; message = "Код отправлен" }
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
          onClick = { codeRequested = false; code = ""; message = null },
          enabled = !busy,
          modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
          colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = Color.White),
          shape = RoundedCornerShape(8.dp),
        ) { Text("Изменить номер") }
      }
    }
  }
}

@Composable
private fun SignedInAccount(
  state: AuthState.SignedIn,
  manager: AuthSessionManager,
  onState: (AuthState) -> Unit,
  favoriteCount: Int,
  cartCount: Int,
  modifier: Modifier,
  apiBaseUrl: String,
  route: String?,
  onRoute: (String?) -> Unit,
  orderRefreshRevision: Int,
) {
  if (route == "orders") {
    ClientOrdersScreen(apiBaseUrl, state, orderRefreshRevision, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
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
  if (route == "bonuses") {
    ClientBonusesScreen(apiBaseUrl, state, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
    return
  }
  if (route == "addresses") {
    ClientAddressesScreen(apiBaseUrl, state, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
    return
  }
  if (route == "settings") {
    ClientSettingsScreen(apiBaseUrl, state, { onRoute(null) }, modifier, authManager = manager, onAuthState = onState)
    return
  }
  val scope = rememberCoroutineScope()
  var busy by remember { mutableStateOf(false) }
  LazyColumn(modifier.fillMaxSize().background(AuthInk).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    item {
      Text("Кабинет", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.testTag("account-title"))
      Text(state.user.phone ?: "Профиль AliStore", color = AuthLime, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
    }
    items(listOf("Мои заказы", "Бонусы", "Мои устройства", "Гарантия", "Возвраты", "Адреса", "Поддержка", "Настройки")) { title ->
      Text(
        title,
        color = Color.White,
        modifier = Modifier.fillMaxWidth().background(AuthSurface, RoundedCornerShape(8.dp))
          .clickable(enabled = true) {
            onRoute(when (title) {
              "Мои заказы" -> "orders"
              "Возвраты" -> "returns"
              "Поддержка" -> "support"
              "Бонусы" -> "bonuses"
              "Адреса" -> "addresses"
              "Настройки" -> "settings"
              else -> "devices"
            })
          }
          .padding(16.dp),
      )
    }
    item {
      Text("Избранное: $favoriteCount · Корзина: $cartCount", color = AuthMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
      Button(
        onClick = { scope.launch { busy = true; onState(manager.logout(state)); busy = false } },
        enabled = !busy,
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp).testTag("auth-logout"),
        colors = ButtonDefaults.buttonColors(containerColor = AuthSurface, contentColor = AuthCoral),
        shape = RoundedCornerShape(8.dp),
      ) { Text(if (busy) "Выходим…" else "Выйти", fontWeight = FontWeight.Bold) }
    }
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

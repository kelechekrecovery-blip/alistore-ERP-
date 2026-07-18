package kg.alistore.core

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.UUID
import kotlinx.coroutines.launch

interface CustomerAccountGateway {
  suspend fun loyalty(token: String): CustomerLoyalty
  suspend fun addresses(token: String): List<CustomerAddress>
  suspend fun createAddress(request: CreateCustomerAddressRequest, token: String, idempotencyKey: String): CustomerAddress
  suspend fun updateAddress(id: String, request: UpdateCustomerAddressRequest, token: String): CustomerAddress
  suspend fun deleteAddress(id: String, token: String)
  suspend fun settings(token: String): CustomerSettings
  suspend fun updateSettings(request: UpdateCustomerSettingsRequest, token: String): CustomerSettings
  /** Pretty-printed JSON document with all personal data (self-service export). */
  suspend fun exportData(token: String): String
  /** Anonymizes PII and revokes sessions; orders stay for accounting. */
  suspend fun deleteAccount(token: String)
}

private val AccountInk = Design3.screen
private val AccountSurface = Design3.surface
private val AccountLine = Design3.hairline
private val AccountMuted = Design3.textMuted
private val AccountCoral = Design3.orange
private val AccountLime = Design3.lime

@Composable
internal fun ClientBonusesScreen(
  apiBaseUrl: String,
  session: AuthState.SignedIn,
  onBack: () -> Unit,
  modifier: Modifier = Modifier,
  providedGateway: CustomerAccountGateway? = null,
  authManager: AuthSessionManager? = null,
  onAuthState: (AuthState) -> Unit = {},
) {
  val gateway = remember(apiBaseUrl, providedGateway) { providedGateway ?: ApiClient(apiBaseUrl) }
  var loyalty by remember { mutableStateOf<CustomerLoyalty?>(null) }
  var error by remember { mutableStateOf<String?>(null) }
  var revision by remember { mutableIntStateOf(0) }
  LaunchedEffect(session.tokens.accessToken, revision) {
    var attempt = runCatching { gateway.loyalty(session.tokens.accessToken) }
    if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
      val renewed = authManager.refresh(session); onAuthState(renewed)
      if (renewed is AuthState.SignedIn) attempt = runCatching { gateway.loyalty(renewed.tokens.accessToken) }
    }
    attempt.onSuccess { loyalty = it; error = null }.onFailure { error = it.message ?: "Не удалось загрузить бонусы" }
  }

  AccountList("Бонусы и купоны", onBack, modifier, "bonuses-title") {
    when {
      error != null -> item { AccountError("Бонусы недоступны", error!!) { revision += 1 } }
      loyalty == null -> item { AccountLoading() }
      else -> {
        val data = loyalty!!
        item {
          Column(Modifier.fillMaxWidth().background(AccountCoral, RoundedCornerShape(8.dp)).padding(22.dp).testTag("bonus-balance"), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Доступно бонусов", color = Color(0xFFFFE0D5), fontSize = 13.sp)
            Text(data.balance.toString(), color = Color.White, fontSize = 40.sp, fontWeight = FontWeight.Black)
            Text("1 бонус = ${data.conversion} сом · ${data.level}-уровень", color = Color(0xFFFFE0D5), fontSize = 12.sp)
          }
        }
        item { AccountSection("Мои купоны") }
        if (data.coupons.isEmpty()) item { AccountEmpty("Активных купонов пока нет") }
        else items(data.coupons, key = { it.id }) { coupon ->
          Row(Modifier.fillMaxWidth().background(AccountSurface, RoundedCornerShape(8.dp)).padding(14.dp).testTag("coupon-${coupon.id}"), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
              Text(coupon.title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
              Text(coupon.code, color = AccountMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
            }
            Text(coupon.valueLabel, color = AccountInk, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.background(AccountLime, RoundedCornerShape(7.dp)).padding(horizontal = 11.dp, vertical = 7.dp))
          }
        }
        item { AccountSection("История") }
        if (data.history.isEmpty()) item { AccountEmpty("Начислений пока нет") }
        else items(data.history, key = { it.id }) { entry ->
          Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(entry.label, color = AccountMuted, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text(if (entry.amount > 0) "+${entry.amount}" else entry.amount.toString(), color = if (entry.amount >= 0) AccountLime else AccountCoral, fontSize = 13.sp, fontWeight = FontWeight.Bold)
          }
        }
      }
    }
  }
}

@Composable
internal fun ClientAddressesScreen(
  apiBaseUrl: String,
  session: AuthState.SignedIn,
  onBack: () -> Unit,
  modifier: Modifier = Modifier,
  providedGateway: CustomerAccountGateway? = null,
  authManager: AuthSessionManager? = null,
  onAuthState: (AuthState) -> Unit = {},
) {
  val gateway = remember(apiBaseUrl, providedGateway) { providedGateway ?: ApiClient(apiBaseUrl) }
  val scope = rememberCoroutineScope()
  var rows by remember { mutableStateOf<List<CustomerAddress>?>(null) }
  var error by remember { mutableStateOf<String?>(null) }
  var revision by remember { mutableIntStateOf(0) }
  var title by remember { mutableStateOf("") }
  var text by remember { mutableStateOf("") }
  var comment by remember { mutableStateOf("") }
  var key by remember { mutableStateOf(UUID.randomUUID().toString()) }
  var saving by remember { mutableStateOf(false) }
  var actionError by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(session.tokens.accessToken, revision) {
    var attempt = runCatching { gateway.addresses(session.tokens.accessToken) }
    if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
      val renewed = authManager.refresh(session); onAuthState(renewed)
      if (renewed is AuthState.SignedIn) attempt = runCatching { gateway.addresses(renewed.tokens.accessToken) }
    }
    attempt.onSuccess { rows = it; error = null }.onFailure { error = it.message ?: "Не удалось загрузить адреса" }
  }

  fun newCommand() { key = UUID.randomUUID().toString(); actionError = null }
  suspend fun tokenAfterRefresh(error: Throwable): String? {
    if (!error.nativeUnauthorized() || authManager == null) return null
    val renewed = authManager.refresh(session); onAuthState(renewed)
    return (renewed as? AuthState.SignedIn)?.tokens?.accessToken
  }

  AccountList("Адреса доставки", onBack, modifier, "addresses-title") {
    when {
      error != null -> item { AccountError("Адреса недоступны", error!!) { revision += 1 } }
      rows == null -> item { AccountLoading() }
      rows!!.isEmpty() -> item { AccountEmpty("Сохранённых адресов пока нет") }
      else -> items(rows!!, key = { it.id }) { address ->
        Column(Modifier.fillMaxWidth().background(AccountSurface, RoundedCornerShape(8.dp)).padding(15.dp).testTag("address-${address.id}")) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(address.title, color = Color.White, fontWeight = FontWeight.Bold)
            if (address.isPrimary) Text("основной", color = AccountLime, fontSize = 10.sp)
          }
          Text(address.text, color = AccountMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 5.dp))
          address.comment?.let { Text(it, color = AccountMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp)) }
          Row(Modifier.fillMaxWidth().padding(top = 9.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!address.isPrimary) Text("Сделать основным", color = AccountLime, fontSize = 12.sp, modifier = Modifier.clickable {
              scope.launch {
                var attempt = runCatching { gateway.updateAddress(address.id, UpdateCustomerAddressRequest(isPrimary = true), session.tokens.accessToken) }
                attempt.exceptionOrNull()?.let { tokenAfterRefresh(it)?.let { token -> attempt = runCatching { gateway.updateAddress(address.id, UpdateCustomerAddressRequest(isPrimary = true), token) } } }
                attempt.onSuccess { revision += 1 }.onFailure { actionError = it.message }
              }
            }.padding(vertical = 5.dp))
            Text("Удалить", color = AccountCoral, fontSize = 12.sp, modifier = Modifier.clickable {
              scope.launch {
                var attempt = runCatching { gateway.deleteAddress(address.id, session.tokens.accessToken) }
                attempt.exceptionOrNull()?.let { tokenAfterRefresh(it)?.let { token -> attempt = runCatching { gateway.deleteAddress(address.id, token) } } }
                attempt.onSuccess { rows = rows?.filterNot { it.id == address.id }; revision += 1 }.onFailure { actionError = it.message }
              }
            }.padding(vertical = 5.dp))
          }
        }
      }
    }
    item {
      AccountSection("Добавить адрес")
      OutlinedTextField(title, { title = it.take(40); newCommand() }, label = { Text("Название") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("address-title"), colors = accountFields())
      OutlinedTextField(text, { text = it.take(240); newCommand() }, label = { Text("Город, улица, дом, квартира") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("address-text"), colors = accountFields())
      OutlinedTextField(comment, { comment = it.take(200); newCommand() }, label = { Text("Комментарий курьеру") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), colors = accountFields())
      actionError?.let { Text(it, color = AccountCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp)) }
      Button(onClick = {
        scope.launch {
          saving = true
          val command = CreateCustomerAddressRequest(title.trim(), text.trim(), comment.trim().ifBlank { null })
          var attempt = runCatching { gateway.createAddress(command, session.tokens.accessToken, key) }
          attempt.exceptionOrNull()?.let { tokenAfterRefresh(it)?.let { token -> attempt = runCatching { gateway.createAddress(command, token, key) } } }
          attempt.onSuccess { created -> rows = (rows.orEmpty().filterNot { it.id == created.id } + created).sortedByDescending { it.isPrimary }; title = ""; text = ""; comment = ""; newCommand() }
            .onFailure { actionError = it.message ?: "Не удалось сохранить адрес" }
          saving = false
        }
      }, enabled = !saving && title.isNotBlank() && text.isNotBlank(), modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("address-submit"),
        colors = ButtonDefaults.buttonColors(containerColor = AccountLime, contentColor = AccountInk), shape = RoundedCornerShape(8.dp)) {
        Text(if (saving) "Сохраняем…" else "Сохранить адрес", fontWeight = FontWeight.Bold)
      }
    }
  }
}

@Composable
internal fun ClientSettingsScreen(
  apiBaseUrl: String,
  session: AuthState.SignedIn,
  onBack: () -> Unit,
  modifier: Modifier = Modifier,
  providedGateway: CustomerAccountGateway? = null,
  authManager: AuthSessionManager? = null,
  onAuthState: (AuthState) -> Unit = {},
) {
  val gateway = remember(apiBaseUrl, providedGateway) { providedGateway ?: ApiClient(apiBaseUrl) }
  val scope = rememberCoroutineScope()
  var settings by remember { mutableStateOf<CustomerSettings?>(null) }
  var name by remember { mutableStateOf("") }
  var error by remember { mutableStateOf<String?>(null) }
  var saving by remember { mutableStateOf(false) }
  var saved by remember { mutableStateOf(false) }
  var revision by remember { mutableIntStateOf(0) }
  LaunchedEffect(session.tokens.accessToken, revision) {
    var attempt = runCatching { gateway.settings(session.tokens.accessToken) }
    if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
      val renewed = authManager.refresh(session); onAuthState(renewed)
      if (renewed is AuthState.SignedIn) attempt = runCatching { gateway.settings(renewed.tokens.accessToken) }
    }
    attempt.onSuccess { settings = it; name = it.name; error = null }.onFailure { error = it.message ?: "Не удалось загрузить настройки" }
  }

  fun toggle(key: String) {
    settings = settings?.let { value -> when (key) {
      "consent" -> value.copy(consent = !value.consent); "push" -> value.copy(push = !value.push)
      "whatsapp" -> value.copy(whatsapp = !value.whatsapp); "service" -> value.copy(service = !value.service)
      else -> value.copy(promos = !value.promos)
    } }; saved = false
  }

  AccountList("Настройки", onBack, modifier, "settings-title") {
    when {
      error != null -> item { AccountError("Настройки недоступны", error!!) { revision += 1 } }
      settings == null -> item { AccountLoading() }
      else -> {
        val value = settings!!
        item {
          Text(value.phone, color = AccountLime, fontSize = 13.sp)
          OutlinedTextField(name, { name = it.take(120); saved = false }, label = { Text("Имя") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("settings-name"), colors = accountFields())
          AccountSection("Каналы и согласия")
        }
        item { SettingToggle("Маркетинговое согласие", value.consent) { toggle("consent") } }
        item { SettingToggle("Push в приложении", value.push) { toggle("push") } }
        item { SettingToggle("WhatsApp", value.whatsapp) { toggle("whatsapp") } }
        item { SettingToggle("Сервисные статусы", value.service) { toggle("service") } }
        item { SettingToggle("Акции и промокоды", value.promos) { toggle("promos") } }
        item {
          Button(onClick = {
            scope.launch {
              saving = true
              val command = UpdateCustomerSettingsRequest(name.trim(), value.consent, value.push, value.whatsapp, value.service, value.promos)
              var attempt = runCatching { gateway.updateSettings(command, session.tokens.accessToken) }
              if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
                val renewed = authManager.refresh(session); onAuthState(renewed)
                if (renewed is AuthState.SignedIn) attempt = runCatching { gateway.updateSettings(command, renewed.tokens.accessToken) }
              }
              attempt.onSuccess { settings = it; name = it.name; saved = true; error = null }.onFailure { error = it.message ?: "Не удалось сохранить" }
              saving = false
            }
          }, enabled = !saving && name.isNotBlank(), modifier = Modifier.fillMaxWidth().testTag("settings-submit"),
            colors = ButtonDefaults.buttonColors(containerColor = AccountLime, contentColor = AccountInk), shape = RoundedCornerShape(8.dp)) {
            Text(if (saving) "Сохраняем…" else if (saved) "Сохранено" else "Сохранить", fontWeight = FontWeight.Bold)
          }
        }
      }
    }
  }
}

@Composable
private fun AccountList(title: String, onBack: () -> Unit, modifier: Modifier, tag: String, content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
  LazyColumn(modifier.fillMaxSize().background(AccountInk).statusBarsPadding().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    item {
      Button(onClick = onBack, shape = RoundedCornerShape(8.dp), colors = ButtonDefaults.buttonColors(containerColor = AccountSurface, contentColor = Color.White)) { Text("Назад") }
      Text(title, color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 14.dp).testTag(tag))
    }
    content()
  }
}

@Composable private fun AccountLoading() = Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(color = AccountLime) }
@Composable private fun AccountEmpty(text: String) = Text(text, color = AccountMuted, modifier = Modifier.fillMaxWidth().background(AccountSurface, RoundedCornerShape(8.dp)).padding(17.dp))
@Composable private fun AccountSection(text: String) = Text(text, color = AccountMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp, bottom = 2.dp))

@Composable private fun AccountError(title: String, detail: String, retry: () -> Unit) = Column(Modifier.fillMaxWidth().background(AccountSurface, RoundedCornerShape(8.dp)).padding(16.dp)) {
  Text(title, color = AccountCoral, fontWeight = FontWeight.Bold)
  Text(detail, color = AccountMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
  Button(onClick = retry, modifier = Modifier.padding(top = 8.dp)) { Text("Повторить") }
}

@Composable private fun SettingToggle(label: String, checked: Boolean, onToggle: () -> Unit) =
  Row(Modifier.fillMaxWidth().background(AccountSurface, RoundedCornerShape(8.dp)).clickable(onClick = onToggle).padding(horizontal = 14.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
    Text(label, color = Color.White, fontSize = 13.sp, modifier = Modifier.weight(1f))
    Switch(checked = checked, onCheckedChange = { onToggle() }, colors = SwitchDefaults.colors(checkedThumbColor = AccountInk, checkedTrackColor = AccountLime, uncheckedThumbColor = AccountMuted, uncheckedTrackColor = AccountLine))
  }

@Composable private fun accountFields() = OutlinedTextFieldDefaults.colors(
  focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = AccountLime,
  unfocusedBorderColor = AccountLine, focusedLabelColor = AccountLime, unfocusedLabelColor = AccountMuted,
)

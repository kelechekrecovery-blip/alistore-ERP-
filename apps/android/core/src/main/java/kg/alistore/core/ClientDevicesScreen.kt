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

interface CustomerDevicesGateway {
  suspend fun devices(token: String): List<CustomerDevice>
  suspend fun openWarranty(request: OpenWarrantyRequest, token: String, idempotencyKey: String): WarrantyCase
}

private val DevicesInk = Design3.screen
private val DevicesSurface = Design3.surface
private val DevicesLine = Design3.hairline
private val DevicesMuted = Design3.textMuted
private val DevicesCoral = Design3.orange
private val DevicesLime = Design3.lime

@Composable
internal fun ClientDevicesScreen(
  apiBaseUrl: String,
  session: AuthState.SignedIn,
  onBack: () -> Unit,
  modifier: Modifier = Modifier,
  providedGateway: CustomerDevicesGateway? = null,
  authManager: AuthSessionManager? = null,
  onAuthState: (AuthState) -> Unit = {},
) {
  val gateway = remember(apiBaseUrl, providedGateway) { providedGateway ?: ApiClient(apiBaseUrl) }
  var devices by remember { mutableStateOf<List<CustomerDevice>>(emptyList()) }
  var selected by remember { mutableStateOf<CustomerDevice?>(null) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var refresh by remember { mutableIntStateOf(0) }

  if (selected != null) {
    DeviceWarrantyScreen(selected!!, session, gateway, { selected = null }, modifier, authManager, onAuthState)
    return
  }

  LaunchedEffect(session.tokens.accessToken, refresh) {
    loading = true
    var attempt = runCatching { gateway.devices(session.tokens.accessToken) }
    if (attempt.exceptionOrNull().isUnauthorized() && authManager != null) {
      val refreshed = authManager.refresh(session)
      onAuthState(refreshed)
      if (refreshed is AuthState.SignedIn) attempt = runCatching { gateway.devices(refreshed.tokens.accessToken) }
    }
    attempt.onSuccess { devices = it; error = null }
      .onFailure { error = it.message ?: "Не удалось загрузить устройства" }
    loading = false
  }

  LazyColumn(modifier.fillMaxSize().background(DevicesInk).statusBarsPadding().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    item {
      BackButton(onBack)
      Text("Мои устройства", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 14.dp).testTag("devices-title"))
      Text("Гарантия привязана к оплаченному IMEI", color = DevicesMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
    }
    when {
      loading -> item { LoadingDevices() }
      error != null -> item { ErrorCard("Устройства недоступны", error!!) { refresh += 1 } }
      devices.isEmpty() -> item {
        Text("Устройств пока нет. Они появятся после продажи и привязки IMEI к заказу.", color = DevicesMuted,
          modifier = Modifier.fillMaxWidth().background(DevicesSurface, RoundedCornerShape(8.dp)).padding(20.dp))
      }
      else -> items(devices, key = { it.imei }) { device ->
        Column(
          Modifier.fillMaxWidth().background(DevicesSurface, RoundedCornerShape(8.dp)).clickable { selected = device }
            .padding(15.dp).testTag("device-${device.imei}"),
        ) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(device.product, color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(device.warranty?.status?.warrantyLabel() ?: "Гарантия", color = DevicesLime, fontSize = 11.sp)
          }
          Text("IMEI ${device.imei}", color = DevicesMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 7.dp))
          device.daysLeft?.let { days ->
            Text(if (days > 0) "Осталось $days дн." else "Гарантия завершена", color = DevicesMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
          }
        }
      }
    }
  }
}

@Composable
private fun DeviceWarrantyScreen(
  device: CustomerDevice,
  session: AuthState.SignedIn,
  gateway: CustomerDevicesGateway,
  onBack: () -> Unit,
  modifier: Modifier,
  authManager: AuthSessionManager?,
  onAuthState: (AuthState) -> Unit,
) {
  val scope = rememberCoroutineScope()
  var problem by remember(device.imei) { mutableStateOf("") }
  var key by remember(device.imei) { mutableStateOf(UUID.randomUUID().toString()) }
  var created by remember(device.imei) { mutableStateOf<WarrantyCase?>(null) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  val existingStatus = device.warranty?.status

  LazyColumn(modifier.fillMaxSize().background(DevicesInk).statusBarsPadding().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    item {
      BackButton(onBack)
      Text("Гарантия", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 14.dp).testTag("warranty-title"))
    }
    item {
      Column(Modifier.fillMaxWidth().background(DevicesSurface, RoundedCornerShape(8.dp)).padding(15.dp)) {
        Text(device.product, color = Color.White, fontWeight = FontWeight.Bold)
        Text("IMEI ${device.imei}", color = DevicesMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
        device.daysLeft?.let { Text("Покрытие: ${if (it > 0) "$it дн." else "завершено"}", color = DevicesMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp)) }
      }
    }
    val warranty = created
    if (existingStatus != null || warranty != null) {
      item {
        Column(Modifier.fillMaxWidth().background(DevicesSurface, RoundedCornerShape(8.dp)).padding(16.dp).testTag("warranty-status")) {
          Text("Обращение принято", color = DevicesLime, fontWeight = FontWeight.Bold)
          Text((warranty?.status ?: existingStatus!!).warrantyLabel(), color = Color.White, modifier = Modifier.padding(top = 6.dp))
          val sla = warranty?.sla ?: device.warranty?.sla
          sla?.take(10)?.let { Text("SLA до $it", color = DevicesMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp)) }
          Text("Статус меняет только сервисный центр", color = DevicesMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
        }
      }
    } else {
      item {
        OutlinedTextField(
          value = problem,
          onValueChange = { problem = it.take(500); key = UUID.randomUUID().toString(); error = null },
          label = { Text("Опишите неисправность") },
          minLines = 3,
          modifier = Modifier.fillMaxWidth().testTag("warranty-problem"),
          colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = Color.White, unfocusedTextColor = Color.White,
            focusedBorderColor = DevicesLime, unfocusedBorderColor = DevicesLine,
            focusedLabelColor = DevicesLime, unfocusedLabelColor = DevicesMuted,
          ),
        )
        error?.let { Text(it, color = DevicesCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp)) }
        Button(
          onClick = {
            scope.launch {
              busy = true
              error = null
              val request = OpenWarrantyRequest(device.imei, session.user.customerId, problem.trim())
              var attempt = runCatching { gateway.openWarranty(request, session.tokens.accessToken, key) }
              if (attempt.exceptionOrNull().isUnauthorized() && authManager != null) {
                val refreshed = authManager.refresh(session)
                onAuthState(refreshed)
                if (refreshed is AuthState.SignedIn) attempt = runCatching { gateway.openWarranty(request, refreshed.tokens.accessToken, key) }
              }
              attempt.onSuccess { created = it }.onFailure { error = it.message ?: "Не удалось открыть обращение" }
              busy = false
            }
          },
          enabled = !busy && problem.trim().isNotEmpty(),
          modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("warranty-submit"),
          colors = ButtonDefaults.buttonColors(containerColor = DevicesLime, contentColor = DevicesInk),
          shape = RoundedCornerShape(8.dp),
        ) { Text(if (busy) "Отправляем…" else "Открыть обращение", fontWeight = FontWeight.Bold) }
      }
    }
  }
}

@Composable private fun BackButton(onBack: () -> Unit) =
  Button(onClick = onBack, colors = ButtonDefaults.buttonColors(containerColor = DevicesSurface, contentColor = Color.White)) { Text("Назад") }

@Composable private fun LoadingDevices() =
  Column(Modifier.fillMaxWidth().padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    CircularProgressIndicator(color = DevicesLime)
    Text("Загружаем устройства", color = DevicesMuted, modifier = Modifier.padding(top = 10.dp))
  }

@Composable private fun ErrorCard(title: String, detail: String, retry: () -> Unit) =
  Column(Modifier.fillMaxWidth().background(DevicesSurface, RoundedCornerShape(8.dp)).padding(16.dp)) {
    Text(title, color = DevicesCoral, fontWeight = FontWeight.Bold)
    Text(detail, color = DevicesMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
    Button(onClick = retry, modifier = Modifier.padding(top = 10.dp)) { Text("Повторить") }
  }

private fun Throwable?.isUnauthorized() = this is ApiException && status == 401

private fun String.warrantyLabel(): String = when (this) {
  "created" -> "Создано"
  "received" -> "Принято"
  "diagnostics" -> "Диагностика"
  "waiting_supplier" -> "Ожидает поставщика"
  "approved" -> "Одобрено"
  "rejected" -> "Отклонено"
  "repaired" -> "Отремонтировано"
  "replaced" -> "Заменено"
  "closed" -> "Закрыто"
  else -> this
}

package kg.alistore.core

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.launch
import org.json.JSONObject

private val CourierInk = Color(0xFF151515)
private val CourierSurface = Color(0xFF242424)
private val CourierMuted = Color(0xFFA7A7A7)
private val CourierCoral = Color(0xFFFF6B57)
private val CourierLime = Color(0xFFC8F04B)

sealed interface CourierCommandResult {
  data object Sent : CourierCommandResult
  data class Queued(val id: String) : CourierCommandResult
}

class CourierCommandManager(
  private val gateway: CourierGateway,
  private val queue: MutationQueue,
) {
  suspend fun start(orderId: String, token: String, key: String): CourierCommandResult = submit(
    endpoint = "courier/orders/$orderId/start",
    body = JSONObject(),
    key = key,
    online = { gateway.startDelivery(orderId, token, key) },
  )

  suspend fun deliver(orderId: String, codAmount: Int, token: String, key: String): CourierCommandResult = submit(
    endpoint = "courier/orders/$orderId/deliver",
    body = JSONObject().put("codAmount", codAmount),
    key = key,
    online = { gateway.completeDelivery(orderId, codAmount, token, key) },
  )

  suspend fun fail(orderId: String, reason: String, token: String, key: String): CourierCommandResult = submit(
    endpoint = "deliveries/$orderId/fail",
    body = JSONObject().put("reason", reason),
    key = key,
    online = { gateway.failDelivery(orderId, reason, token, key) },
  )

  private suspend fun submit(
    endpoint: String,
    body: JSONObject,
    key: String,
    online: suspend () -> Any?,
  ): CourierCommandResult {
    require(key.isNotBlank()) { "Idempotency key is required" }
    return try {
      online()
      CourierCommandResult.Sent
    } catch (error: Exception) {
      if (error is ApiException && error.status < 500) throw error
      if (error !is IOException && error !is ApiException) throw error
      CourierCommandResult.Queued(queue.enqueue(endpoint, "POST", body.toString(), key))
    }
  }
}

@Composable
fun CourierApp(apiBaseUrl: String) {
  val context = LocalContext.current.applicationContext
  val api = remember(apiBaseUrl) { ApiClient(apiBaseUrl) }
  val manager = remember(apiBaseUrl) { StaffSessionManager(api, SecureTokenStore(context, "alistore-courier-session")) }
  var state by remember { mutableStateOf<StaffAuthState>(StaffAuthState.Restoring) }
  LaunchedEffect(manager) { state = manager.restore() }
  MaterialTheme {
    when (val current = state) {
      StaffAuthState.Restoring -> CourierLoading()
      StaffAuthState.SignedOut -> CourierLogin(manager) { state = it }
      is StaffAuthState.Failed -> CourierLogin(manager, current.message) { state = it }
      is StaffAuthState.SignedIn -> if (current.session.role == "courier") {
        CourierWorkspace(current.session, api, apiBaseUrl) { state = manager.logout() }
      } else {
        CourierLogin(manager, "Эта учётная запись не является курьером") { state = manager.logout() }
      }
    }
  }
}

@Composable
private fun CourierLogin(manager: StaffSessionManager, initialError: String? = null, onState: (StaffAuthState) -> Unit) {
  var username by rememberSaveable { mutableStateOf("") }
  var password by rememberSaveable { mutableStateOf("") }
  var error by remember { mutableStateOf(initialError) }
  var busy by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  Column(Modifier.fillMaxSize().background(CourierInk).statusBarsPadding().padding(24.dp), verticalArrangement = Arrangement.Center) {
    Text("AliStore Courier", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
    Text("Доставки и расчёты COD", color = CourierMuted, modifier = Modifier.padding(top = 4.dp, bottom = 22.dp))
    OutlinedTextField(username, { username = it }, label = { Text("Логин") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("courier-username"))
    OutlinedTextField(
      password,
      { password = it },
      label = { Text("Пароль") },
      singleLine = true,
      visualTransformation = PasswordVisualTransformation(),
      modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("courier-password"),
    )
    error?.let { Text(it, color = CourierCoral, modifier = Modifier.padding(top = 10.dp)) }
    Button(
      onClick = {
        busy = true
        scope.launch {
          val result = manager.login(username, password)
          if (result is StaffAuthState.Failed) error = result.message else onState(result)
          busy = false
        }
      },
      enabled = !busy && username.isNotBlank() && password.isNotBlank(),
      colors = ButtonDefaults.buttonColors(containerColor = CourierLime, contentColor = CourierInk),
      modifier = Modifier.fillMaxWidth().height(58.dp).padding(top = 12.dp).testTag("courier-login"),
    ) { if (busy) CircularProgressIndicator(Modifier.size(20.dp)) else Text("Войти", fontWeight = FontWeight.Bold) }
  }
}

@Composable
private fun CourierWorkspace(session: StaffSession, api: ApiClient, apiBaseUrl: String, onLogout: () -> Unit) {
  val context = LocalContext.current.applicationContext
  val queue = remember { OfflineQueueDb(context, COURIER_QUEUE_DB) }
  val commands = remember(api) { CourierCommandManager(api, queue) }
  var selected by rememberSaveable { mutableStateOf(0) }
  var deliveries by remember { mutableStateOf<List<CourierDelivery>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var message by remember { mutableStateOf<String?>(null) }
  var revision by remember { mutableStateOf(0) }
  LaunchedEffect(revision, session.accessToken) {
    runCatching { api.courierDeliveries(session.accessToken) }
      .onSuccess { deliveries = it; message = null }
      .onFailure { message = it.message }
    loading = false
  }
  Scaffold(
    containerColor = CourierInk,
    bottomBar = {
      NavigationBar(containerColor = CourierSurface) {
        listOf("Маршрут", "COD", "Профиль").forEachIndexed { index, label ->
          NavigationBarItem(
            selected = selected == index,
            onClick = { selected = index },
            icon = { Icon(if (index == 0) Icons.Default.Home else if (index == 1) Icons.Default.ShoppingCart else Icons.Default.AccountCircle, label) },
            label = { Text(label, fontSize = 10.sp) },
          )
        }
      }
    },
  ) { padding ->
    when {
      loading -> CourierLoading(Modifier.padding(padding))
      selected == 0 -> CourierRoute(deliveries, message, session, commands, apiBaseUrl, { revision++ }, Modifier.padding(padding))
      selected == 1 -> CourierCod(deliveries, queue.pending(), session, api, apiBaseUrl, { revision++ }, Modifier.padding(padding))
      else -> CourierProfile(session, queue.pending(), onLogout, Modifier.padding(padding))
    }
  }
}

@Composable
private fun CourierRoute(
  deliveries: List<CourierDelivery>,
  error: String?,
  session: StaffSession,
  commands: CourierCommandManager,
  apiBaseUrl: String,
  onRefresh: () -> Unit,
  modifier: Modifier,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  LazyColumn(modifier.fillMaxSize().background(CourierInk).statusBarsPadding(), contentPadding = PaddingValues(16.dp)) {
    item {
      Text("Мой маршрут", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
      Text("${deliveries.count { it.status != "delivered" }} активных доставок", color = CourierMuted, modifier = Modifier.padding(bottom = 14.dp))
      error?.let { Text(it, color = CourierCoral, modifier = Modifier.padding(bottom = 10.dp)) }
    }
    if (deliveries.isEmpty()) item { Text("Назначенных доставок пока нет", color = CourierMuted, modifier = Modifier.padding(top = 48.dp)) }
    items(deliveries, key = CourierDelivery::id) { delivery ->
      var failureReason by rememberSaveable(delivery.id) { mutableStateOf("") }
      var busy by remember(delivery.id) { mutableStateOf(false) }
      var statusMessage by remember(delivery.id) { mutableStateOf<String?>(null) }
      Card(colors = CardDefaults.cardColors(containerColor = CourierSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(16.dp)) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(delivery.customer.name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(delivery.status, color = CourierLime, fontSize = 11.sp)
          }
          Text(delivery.address ?: "Адрес не указан", color = CourierMuted, modifier = Modifier.padding(top = 5.dp))
          delivery.slot?.let { Text(it, color = CourierMuted, fontSize = 12.sp) }
          Text("${delivery.items.sumOf { it.qty }} шт. · ${delivery.outstandingCod} сом COD", color = Color.White, modifier = Modifier.padding(top = 10.dp))
          Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { delivery.address?.let { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(it)}"))) } }, modifier = Modifier.weight(1f)) { Text("Маршрут") }
            OutlinedButton(onClick = { if (delivery.customer.phone.isNotBlank()) context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${delivery.customer.phone}"))) }, modifier = Modifier.weight(1f)) { Text("Позвонить") }
          }
          if (delivery.status == "courier_assigned") CourierActionButton("Начать доставку", busy) {
            busy = true
            scope.launch {
              runCatching { commands.start(delivery.id, session.accessToken, UUID.randomUUID().toString()) }
                .onSuccess { statusMessage = if (it is CourierCommandResult.Queued) "Сохранено офлайн" else "Доставка начата"; scheduleCourierSync(context.applicationContext, apiBaseUrl); onRefresh() }
                .onFailure { statusMessage = it.message }
              busy = false
            }
          }
          if (delivery.status == "out_for_delivery") {
            CourierActionButton("Доставлено · ${delivery.outstandingCod} сом", busy) {
              busy = true
              scope.launch {
                runCatching { commands.deliver(delivery.id, delivery.outstandingCod, session.accessToken, UUID.randomUUID().toString()) }
                  .onSuccess { statusMessage = if (it is CourierCommandResult.Queued) "Сохранено офлайн" else "Доставка завершена"; scheduleCourierSync(context.applicationContext, apiBaseUrl); onRefresh() }
                  .onFailure { statusMessage = it.message }
                busy = false
              }
            }
            OutlinedTextField(failureReason, { failureReason = it }, label = { Text("Причина неудачи") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
            OutlinedButton(
              onClick = {
                busy = true
                scope.launch {
                  runCatching { commands.fail(delivery.id, failureReason, session.accessToken, UUID.randomUUID().toString()) }
                    .onSuccess { statusMessage = if (it is CourierCommandResult.Queued) "Сохранено офлайн" else "Попытка записана"; scheduleCourierSync(context.applicationContext, apiBaseUrl) }
                    .onFailure { statusMessage = it.message }
                  busy = false
                }
              },
              enabled = !busy && failureReason.isNotBlank(),
              modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            ) { Text("Не удалось доставить") }
          }
          statusMessage?.let { Text(it, color = CourierLime, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp)) }
        }
      }
    }
  }
}

@Composable
private fun CourierActionButton(label: String, busy: Boolean, action: () -> Unit) {
  Button(action, enabled = !busy, colors = ButtonDefaults.buttonColors(containerColor = CourierLime, contentColor = CourierInk), modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
    Text(label, fontWeight = FontWeight.Bold)
  }
}

@Composable
private fun CourierCod(
  deliveries: List<CourierDelivery>,
  pending: List<PendingMutation>,
  session: StaffSession,
  api: CourierGateway,
  apiBaseUrl: String,
  onRefresh: () -> Unit,
  modifier: Modifier,
) {
  val context = LocalContext.current.applicationContext
  val scope = rememberCoroutineScope()
  val runs = deliveries.mapNotNull(CourierDelivery::run).distinctBy(CourierRunSummary::id)
  LazyColumn(modifier.fillMaxSize().background(CourierInk).statusBarsPadding(), contentPadding = PaddingValues(18.dp)) {
    item {
      Text("Сверка COD", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
      Text("Офлайн-команд: ${pending.size}", color = CourierMuted, modifier = Modifier.padding(bottom = 14.dp))
    }
    items(runs, key = CourierRunSummary::id) { run ->
      var message by remember(run.id) { mutableStateOf<String?>(null) }
      Card(colors = CardDefaults.cardColors(containerColor = CourierSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(16.dp)) {
          Text("Рейс ${run.id.takeLast(6)}", color = Color.White, fontWeight = FontWeight.Bold)
          Text("Собрано ${run.collectedTotal} из ${run.codTotal} сом", color = CourierMuted, modifier = Modifier.padding(top = 5.dp))
          if (!run.handedOver) Button(
            onClick = { scope.launch { runCatching { api.handoverCourierRun(run.id, run.collectedTotal, session.accessToken) }.onSuccess { message = "Наличные сданы"; onRefresh() }.onFailure { message = it.message } } },
            enabled = run.collectedTotal == run.codTotal,
            colors = ButtonDefaults.buttonColors(containerColor = CourierLime, contentColor = CourierInk),
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
          ) { Text("Сдать ${run.collectedTotal} сом") }
          else Text("Сверено", color = CourierLime, modifier = Modifier.padding(top = 10.dp))
          message?.let { Text(it, color = CourierCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp)) }
        }
      }
    }
    item { OutlinedButton(onClick = { scheduleCourierSync(context, apiBaseUrl) }, modifier = Modifier.fillMaxWidth()) { Text("Повторить офлайн-команды") } }
  }
}

@Composable
private fun CourierProfile(session: StaffSession, pending: List<PendingMutation>, onLogout: () -> Unit, modifier: Modifier) {
  Column(modifier.fillMaxSize().background(CourierInk).statusBarsPadding().padding(24.dp)) {
    Text(session.username, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black)
    Text("Курьер · ${session.staffId.takeLast(6)}", color = CourierMuted)
    Spacer(Modifier.height(24.dp))
    Text("Очередь: ${pending.count { it.state == "queued" }} · Конфликты: ${pending.count { it.state == "conflict" }}", color = Color.White)
    OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth().padding(top = 24.dp)) { Text("Выйти") }
  }
}

@Composable
private fun CourierLoading(modifier: Modifier = Modifier) {
  Column(modifier.fillMaxSize().background(CourierInk), verticalArrangement = Arrangement.Center) {
    CircularProgressIndicator(color = CourierLime, modifier = Modifier.padding(24.dp))
  }
}

private fun scheduleCourierSync(context: android.content.Context, apiBaseUrl: String) {
  val request = OneTimeWorkRequestBuilder<CourierSyncWorker>()
    .setInputData(Data.Builder().putString("apiBaseUrl", apiBaseUrl).build())
    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
    .build()
  WorkManager.getInstance(context).enqueueUniqueWork("alistore-courier-sync", ExistingWorkPolicy.KEEP, request)
}

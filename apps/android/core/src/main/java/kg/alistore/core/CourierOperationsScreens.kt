package kg.alistore.core

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.launch
import org.json.JSONObject

private val CourierInk = Design3.screen
private val CourierSurface = Design3.surface
private val CourierMuted = Design3.textMuted
private val CourierCoral = Design3.orange
private val CourierLime = Design3.lime

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

  suspend fun deliver(orderId: String, codAmount: Int, reason: String?, token: String, key: String): CourierCommandResult = submit(
    endpoint = "courier/orders/$orderId/deliver",
    body = JSONObject().put("codAmount", codAmount).putOpt("reason", reason),
    key = key,
    online = { gateway.completeDelivery(orderId, codAmount, reason, token, key) },
  )

  suspend fun fail(orderId: String, reason: String, token: String, key: String): CourierCommandResult = submit(
    endpoint = "deliveries/$orderId/fail",
    body = JSONObject().put("reason", reason),
    key = key,
    online = { gateway.failDelivery(orderId, reason, token, key) },
  )

  suspend fun handover(runId: String, amount: Int, reason: String?, token: String, key: String): CourierCommandResult = submit(
    endpoint = "courier/handover",
    body = JSONObject().put("runId", runId).put("amount", amount).putOpt("reason", reason),
    key = key,
    online = { gateway.handoverCourierRun(runId, amount, reason, token, key) },
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
fun CourierApp(
  apiBaseUrl: String,
  deepLinkUrl: String? = null,
  deepLinkRevision: Long = 0,
  pushRegistrar: StaffPushRegistrar? = null,
) {
  val context = LocalContext.current.applicationContext
  val api = remember(apiBaseUrl) { ApiClient(apiBaseUrl) }
  val manager = remember(apiBaseUrl) { StaffSessionManager(api, SecureTokenStore(context, "alistore-courier-session")) }
  val quickUnlock = remember { QuickUnlockStore(context, "courier") }
  var state by remember { mutableStateOf<StaffAuthState>(StaffAuthState.Restoring) }
  LaunchedEffect(manager) { state = manager.restore() }
  val logout: () -> Unit = { quickUnlock.clear(); state = manager.logout() }
  Design3Theme {
    when (val current = state) {
      StaffAuthState.Restoring -> CourierLoading()
      StaffAuthState.SignedOut -> CourierLogin(manager) { state = it }
      is StaffAuthState.Failed -> CourierLogin(manager, current.message) { state = it }
      is StaffAuthState.SignedIn -> if (current.session.role == "courier") {
        val workspace: @Composable () -> Unit = { CourierWorkspace(current.session, api, apiBaseUrl, deepLinkUrl, deepLinkRevision, pushRegistrar, logout) }
        if (manager.requiresQuickUnlock) QuickUnlockGate("AliStore Courier", current.session.username, quickUnlock, manager::unlock, logout, workspace) else workspace()
      } else {
        CourierLogin(manager, "Эта учётная запись не является курьером") { logout() }
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
private fun CourierWorkspace(
  session: StaffSession,
  api: ApiClient,
  apiBaseUrl: String,
  deepLinkUrl: String?,
  deepLinkRevision: Long,
  pushRegistrar: StaffPushRegistrar?,
  onLogout: () -> Unit,
) {
  val context = LocalContext.current.applicationContext
  val queue = remember { OfflineQueueDb(context, COURIER_QUEUE_DB) }
  val commands = remember(api) { CourierCommandManager(api, queue) }
  var selected by rememberSaveable { mutableStateOf(0) }
  var deliveries by remember { mutableStateOf<List<CourierDelivery>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var message by remember { mutableStateOf<String?>(null) }
  var revision by remember { mutableStateOf(0) }
  var focusedDeliveryId by rememberSaveable { mutableStateOf<String?>(null) }
  LaunchedEffect(session.accessToken, pushRegistrar) {
    if (pushRegistrar != null) runCatching { pushRegistrar.register(session) }
  }
  LaunchedEffect(deepLinkUrl, deepLinkRevision) {
    parseCourierPushRoute(deepLinkUrl)?.let { route -> selected = 0; focusedDeliveryId = route.orderId; revision++ }
  }
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
      selected == 0 -> CourierRoute(deliveries, focusedDeliveryId, message, session, commands, api, apiBaseUrl, { revision++ }, Modifier.padding(padding))
      selected == 1 -> CourierCod(deliveries, queue.pending(includeConflicts = true), session, commands, apiBaseUrl, { revision++ }, Modifier.padding(padding))
      else -> CourierProfile(session, queue.pending(includeConflicts = true), onLogout, Modifier.padding(padding))
    }
  }
}

@Composable
private fun CourierRoute(
  deliveries: List<CourierDelivery>,
  focusedDeliveryId: String?,
  error: String?,
  session: StaffSession,
  commands: CourierCommandManager,
  evidenceGateway: StaffEvidenceGateway,
  apiBaseUrl: String,
  onRefresh: () -> Unit,
  modifier: Modifier,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val orderedDeliveries = remember(deliveries, focusedDeliveryId) {
    if (focusedDeliveryId == null) deliveries
    else deliveries.sortedBy { if (it.id == focusedDeliveryId) 0 else 1 }
  }
  LazyColumn(modifier.fillMaxSize().background(CourierInk).statusBarsPadding(), contentPadding = PaddingValues(16.dp)) {
    item {
      Text("Мой маршрут", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
      Text("${deliveries.count { it.status != "delivered" }} активных доставок", color = CourierMuted, modifier = Modifier.padding(bottom = 14.dp))
      error?.let { Text(it, color = CourierCoral, modifier = Modifier.padding(bottom = 10.dp)) }
    }
    if (deliveries.isEmpty()) item { Text("Назначенных доставок пока нет", color = CourierMuted, modifier = Modifier.padding(top = 48.dp)) }
    items(orderedDeliveries, key = CourierDelivery::id) { delivery ->
      var failureReason by rememberSaveable(delivery.id) { mutableStateOf("") }
      var collectedCodText by rememberSaveable(delivery.id) { mutableStateOf(delivery.outstandingCod.toString()) }
      var partialCodReason by rememberSaveable(delivery.id) { mutableStateOf("") }
      var busy by remember(delivery.id) { mutableStateOf(false) }
      var statusMessage by remember(delivery.id) { mutableStateOf<String?>(null) }
      val collectedCod = collectedCodText.toIntOrNull()
      val validCollectedCod = collectedCod != null && collectedCod in 0..delivery.outstandingCod
      val partialReasonRequired = collectedCod != null && collectedCod < delivery.outstandingCod
      Card(colors = CardDefaults.cardColors(containerColor = CourierSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(16.dp)) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(delivery.customer.name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(delivery.status, color = CourierLime, fontSize = 11.sp)
          }
          Text(delivery.address ?: "Адрес не указан", color = CourierMuted, modifier = Modifier.padding(top = 5.dp))
          delivery.slot?.let { Text(it, color = CourierMuted, fontSize = 12.sp) }
          Text("${delivery.items.sumOf { it.qty }} шт. · ${delivery.outstandingCod} сом COD", color = Color.White, modifier = Modifier.padding(top = 10.dp))
          if (focusedDeliveryId == delivery.id) Text("Открыто из уведомления", color = CourierCoral, fontSize = 11.sp, modifier = Modifier.padding(top = 5.dp))
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
            CourierEvidencePicker(delivery.id, session, evidenceGateway, Modifier.fillMaxWidth().padding(top = 8.dp))
            OutlinedTextField(
              collectedCodText,
              { collectedCodText = it.filter(Char::isDigit) },
              label = { Text("Получено COD") },
              keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
              singleLine = true,
              modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("courier-cod-amount"),
            )
            if (partialReasonRequired) {
              OutlinedTextField(
                partialCodReason,
                { partialCodReason = it },
                label = { Text("Причина частичной оплаты") },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("courier-cod-reason"),
              )
            }
            CourierActionButton("Доставлено · ${collectedCod ?: delivery.outstandingCod} сом", busy || !validCollectedCod || (partialReasonRequired && partialCodReason.isBlank())) {
              busy = true
              scope.launch {
                runCatching { commands.deliver(delivery.id, collectedCod ?: 0, partialCodReason.trim().ifEmpty { null }, session.accessToken, UUID.randomUUID().toString()) }
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
internal fun CourierEvidencePicker(
  orderId: String,
  session: StaffSession,
  gateway: StaffEvidenceGateway,
  modifier: Modifier,
  initialEvidence: StaffEvidenceDraft? = null,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var draft by remember(orderId) { mutableStateOf(initialEvidence) }
  var message by remember(orderId) { mutableStateOf<String?>(null) }
  var busy by remember(orderId) { mutableStateOf(false) }
  val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
    draft = bitmap?.courierEvidenceDraft()
    if (bitmap != null) message = "Фото готово к загрузке"
  }
  val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (granted) camera.launch(null) else message = "Разрешите камеру для фото доставки"
  }
  val gallery = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    if (uri != null) runCatching {
      StaffEvidenceDraft(
        context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("Файл не читается"),
        context.contentResolver.getType(uri) ?: "image/jpeg",
        "courier-evidence.jpg",
      )
    }.onSuccess { draft = it; message = "Фото готово к загрузке" }.onFailure { message = it.message }
  }
  Column(modifier) {
    Text("Evidence доставки", color = Color.White, fontWeight = FontWeight.Bold)
    Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
      OutlinedButton(onClick = {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) camera.launch(null)
        else permission.launch(Manifest.permission.CAMERA)
      }, modifier = Modifier.weight(1f).testTag("courier-evidence-camera")) { Text("Фото") }
      OutlinedButton(onClick = { gallery.launch("image/*") }, modifier = Modifier.weight(1f)) { Text("Галерея") }
    }
    Button(
      onClick = {
        val file = draft ?: return@Button
        busy = true
        scope.launch {
          runCatching { gateway.uploadStaffEvidence("order", orderId, "Подтверждение доставки", file.fileName, file.mimeType, file.bytes, session.accessToken) }
            .onSuccess { draft = null; message = "Evidence сохранён" }
            .onFailure { message = it.message ?: "Ошибка Evidence" }
          busy = false
        }
      },
      enabled = draft != null && !busy,
      colors = ButtonDefaults.buttonColors(containerColor = CourierCoral, contentColor = Color.White),
      modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("courier-evidence-upload"),
    ) { if (busy) CircularProgressIndicator(Modifier.size(18.dp)) else Text("Сохранить фото") }
    message?.let { Text(it, color = if (it == "Evidence сохранён") CourierLime else CourierMuted, fontSize = 11.sp) }
  }
}

private fun Bitmap.courierEvidenceDraft(): StaffEvidenceDraft {
  val output = ByteArrayOutputStream()
  compress(Bitmap.CompressFormat.JPEG, 88, output)
  return StaffEvidenceDraft(output.toByteArray(), "image/jpeg", "courier-evidence.jpg")
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
  commands: CourierCommandManager,
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
      var amountText by rememberSaveable(run.id) { mutableStateOf(run.collectedTotal.toString()) }
      var reason by rememberSaveable(run.id) { mutableStateOf("") }
      var busy by remember(run.id) { mutableStateOf(false) }
      var message by remember(run.id) { mutableStateOf<String?>(null) }
      val amount = amountText.toIntOrNull()
      val reasonRequired = amount != null && handoverReasonRequired(run, amount)
      Card(colors = CardDefaults.cardColors(containerColor = CourierSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(16.dp)) {
          Text("Рейс ${run.id.takeLast(6)}", color = Color.White, fontWeight = FontWeight.Bold)
          Text("Собрано ${run.collectedTotal} из ${run.codTotal} сом", color = CourierMuted, modifier = Modifier.padding(top = 5.dp))
          if (!run.handedOver) {
            OutlinedTextField(
              amountText,
              { amountText = it.filter(Char::isDigit) },
              label = { Text("Сумма сдачи") },
              keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
              singleLine = true,
              modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("courier-handover-amount"),
            )
            if (reasonRequired) {
              OutlinedTextField(
                reason,
                { reason = it },
                label = { Text("Причина расхождения") },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("courier-handover-reason"),
              )
            }
            Button(
              onClick = {
                busy = true
                scope.launch {
                  runCatching { commands.handover(run.id, amount ?: 0, reason.trim().ifEmpty { null }, session.accessToken, "courier-handover-${run.id}") }
                    .onSuccess {
                      message = if (it is CourierCommandResult.Queued) "Сохранено офлайн" else "Наличные сданы"
                      if (it is CourierCommandResult.Queued) scheduleCourierSync(context, apiBaseUrl)
                      onRefresh()
                    }
                    .onFailure { message = it.message }
                  busy = false
                }
              },
              enabled = !busy && amount != null && (!reasonRequired || reason.isNotBlank()),
              colors = ButtonDefaults.buttonColors(containerColor = CourierLime, contentColor = CourierInk),
              modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("courier-handover-submit"),
            ) { Text("Сдать ${amount ?: run.collectedTotal} сом") }
          } else Text("Сверено", color = CourierLime, modifier = Modifier.padding(top = 10.dp))
          message?.let { Text(it, color = CourierCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp)) }
        }
      }
    }
    item { OutlinedButton(onClick = { scheduleCourierSync(context, apiBaseUrl) }, modifier = Modifier.fillMaxWidth()) { Text("Повторить офлайн-команды") } }
  }
}

@Composable
private fun CourierProfile(session: StaffSession, pending: List<PendingMutation>, onLogout: () -> Unit, modifier: Modifier) {
  val conflicts = pending.filter { it.state == "conflict" }
  Column(modifier.fillMaxSize().background(CourierInk).statusBarsPadding().padding(24.dp)) {
    Text(session.username, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black)
    Text("Курьер · ${session.staffId.takeLast(6)}", color = CourierMuted)
    Spacer(Modifier.height(24.dp))
    Text("Очередь: ${pending.count { it.state == "queued" }} · Конфликты: ${conflicts.size}", color = Color.White)
    if (conflicts.isNotEmpty()) {
      Text(
        "Сервер отклонил эти команды (не доставлено автоматически) — нужен диспетчер:",
        color = CourierCoral,
        fontSize = 12.sp,
        modifier = Modifier.padding(top = 10.dp),
      )
      conflicts.forEach { command ->
        Text(
          "${command.endpoint} · ${command.lastError ?: "конфликт"} · ${command.idempotencyKey.takeLast(8)}",
          color = CourierCoral,
          fontSize = 11.sp,
          modifier = Modifier.padding(top = 5.dp).testTag("courier-conflict-row"),
        )
      }
    }
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

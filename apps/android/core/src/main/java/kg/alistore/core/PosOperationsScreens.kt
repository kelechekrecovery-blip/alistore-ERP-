package kg.alistore.core

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
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
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.launch

private val PosInk = Design3.screen
private val PosSurface = Design3.surface
private val PosMuted = Design3.textMuted
private val PosCoral = Design3.orange
private val PosLime = Design3.lime

sealed interface PosSubmitResult {
  data class Online(val result: PosSaleResult) : PosSubmitResult
  data class Queued(val id: String) : PosSubmitResult
}

class PosSaleManager(private val gateway: PosGateway, private val queue: MutationQueue) {
  suspend fun submit(request: PosSaleRequest, token: String): PosSubmitResult {
    require(request.clientSaleId.isNotBlank()) { "clientSaleId is required" }
    return try {
      PosSubmitResult.Online(gateway.posSale(request, token))
    } catch (error: Exception) {
      if (error is ApiException && error.status < 500) throw error
      if (error !is IOException && error !is ApiException) throw error
      PosSubmitResult.Queued(queue.enqueue("pos/sale", "POST", request.toJson().toString(), request.clientSaleId))
    }
  }
}

@Composable
fun PosApp(apiBaseUrl: String) {
  val context = LocalContext.current.applicationContext
  val api = remember(apiBaseUrl) { ApiClient(apiBaseUrl) }
  val auth = remember(apiBaseUrl) { StaffSessionManager(api, SecureTokenStore(context, "alistore-pos-session")) }
  val quickUnlock = remember { QuickUnlockStore(context, "pos") }
  var state by remember { mutableStateOf<StaffAuthState>(StaffAuthState.Restoring) }
  LaunchedEffect(auth) { state = auth.restore() }
  val logout: () -> Unit = { quickUnlock.clear(); state = auth.logout() }
  Design3Theme {
    when (val current = state) {
      StaffAuthState.Restoring -> PosLoading()
      StaffAuthState.SignedOut -> PosLogin(auth) { state = it }
      is StaffAuthState.Failed -> PosLogin(auth, current.message) { state = it }
      is StaffAuthState.SignedIn -> if (current.session.role in setOf("cashier", "admin", "owner")) {
        val workspace: @Composable () -> Unit = { PosWorkspace(current.session, api, apiBaseUrl, logout) }
        if (auth.requiresQuickUnlock) QuickUnlockGate("AliStore POS", current.session.username, quickUnlock, auth::unlock, logout, workspace) else workspace()
      } else PosLogin(auth, "У роли ${current.session.role} нет доступа к кассе") { logout() }
    }
  }
}

@Composable
private fun PosLogin(manager: StaffSessionManager, initialError: String? = null, onState: (StaffAuthState) -> Unit) {
  var username by rememberSaveable { mutableStateOf("") }
  var password by rememberSaveable { mutableStateOf("") }
  var error by remember { mutableStateOf(initialError) }
  var busy by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  Column(Modifier.fillMaxSize().background(PosInk).statusBarsPadding().padding(24.dp), verticalArrangement = Arrangement.Center) {
    Text("AliStore POS", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Black)
    Text("Нативная касса", color = PosMuted, modifier = Modifier.padding(bottom = 22.dp))
    OutlinedTextField(username, { username = it }, label = { Text("Логин") }, modifier = Modifier.fillMaxWidth().testTag("pos-username"))
    OutlinedTextField(password, { password = it }, label = { Text("Пароль") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("pos-password"))
    error?.let { Text(it, color = PosCoral, modifier = Modifier.padding(top = 8.dp)) }
    Button(
      onClick = { busy = true; scope.launch { val result = manager.login(username, password); if (result is StaffAuthState.Failed) error = result.message else onState(result); busy = false } },
      enabled = !busy && username.isNotBlank() && password.isNotBlank(),
      colors = ButtonDefaults.buttonColors(containerColor = PosLime, contentColor = PosInk),
      modifier = Modifier.fillMaxWidth().height(54.dp).padding(top = 10.dp).testTag("pos-login"),
    ) { if (busy) CircularProgressIndicator(Modifier.size(20.dp)) else Text("Открыть кассу", fontWeight = FontWeight.Bold) }
  }
}

@Composable
private fun PosWorkspace(session: StaffSession, api: ApiClient, apiBaseUrl: String, onLogout: () -> Unit) {
  val context = LocalContext.current.applicationContext
  val queue = remember { OfflineQueueDb(context, POS_QUEUE_DB) }
  val manager = remember(api) { PosSaleManager(api, queue) }
  var selected by rememberSaveable { mutableStateOf(0) }
  var products by remember { mutableStateOf<List<Product>>(emptyList()) }
  var shift by remember { mutableStateOf<CashShift?>(null) }
  var error by remember { mutableStateOf<String?>(null) }
  LaunchedEffect(apiBaseUrl) {
    runCatching { api.catalog() }.onSuccess { products = it }.onFailure { error = it.message }
    runCatching { api.currentShift(session.accessToken) }.onSuccess { shift = it }.onFailure { error = it.message }
  }
  Scaffold(containerColor = PosInk, bottomBar = {
    NavigationBar(containerColor = PosSurface) {
      listOf("Продажа", "Офлайн", "Смена", "Операции").forEachIndexed { index, label ->
        NavigationBarItem(selected == index, { selected = index }, { Icon(if (index == 0) Icons.Default.Home else if (index == 1) Icons.Default.ShoppingCart else Icons.Default.AccountCircle, label) }, label = { Text(label) })
      }
    }
  }) { padding ->
    when (selected) {
      0 -> PosSaleScreen(products, error, shift, session, api, manager, apiBaseUrl, { selected = 2 }, Modifier.padding(padding))
      1 -> PosOfflineScreen(queue, apiBaseUrl, Modifier.padding(padding))
      2 -> StaffShiftScreen(
        session, api, onLogout, Modifier.padding(padding),
        onShiftChanged = { shift = it }, apiBaseUrl = apiBaseUrl,
      )
      else -> PosAfterSaleScreen(products, session, api, onLogout, Modifier.padding(padding))
    }
  }
}

@Composable
private fun PosSaleScreen(
  products: List<Product>,
  error: String?,
  shift: CashShift?,
  session: StaffSession,
  gateway: PosGateway,
  manager: PosSaleManager,
  apiBaseUrl: String,
  onOpenShift: () -> Unit,
  modifier: Modifier,
) {
  val context = LocalContext.current.applicationContext
  val scope = rememberCoroutineScope()
  var cart by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
  var selectedImeis by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
  var scannerCode by rememberSaveable { mutableStateOf("") }
  var scanning by remember { mutableStateOf(false) }
  var scannerBusy by remember { mutableStateOf(false) }
  var discount by rememberSaveable { mutableStateOf("0") }
  var method by rememberSaveable { mutableStateOf("cash") }
  var splitCash by rememberSaveable { mutableStateOf("") }
  var activeSaleId by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var approvalId by rememberSaveable { mutableStateOf<String?>(null) }
  var receipt by remember { mutableStateOf<PosReceipt?>(null) }
  var message by remember { mutableStateOf<String?>(null) }
  var busy by remember { mutableStateOf(false) }
  fun applyScannerCode(raw: String) {
    val code = normalizeStaffCode(raw)
    if (code.isBlank()) return
    scannerCode = code
    val product = products.firstOrNull { it.sku.equals(code, ignoreCase = true) }
    if (product != null) {
      val qty = cart[product.id] ?: 0
      if (qty < product.availableUnits) cart = cart + (product.id to qty + 1)
      message = if (qty < product.availableUnits) "${product.name} добавлен" else "Нет доступного остатка"
      scannerCode = ""
      return
    }
    scannerBusy = true
    scope.launch {
      runCatching { gateway.lookupPosUnit(code, session.accessToken) }
        .onSuccess { unit ->
          val matched = products.firstOrNull { it.id == unit.productId }
          when {
            unit.status != "in_stock" -> message = "IMEI недоступен: ${unit.status}"
            matched == null -> message = "Товар IMEI отсутствует в каталоге кассы"
            else -> {
              cart = cart + (matched.id to 1)
              selectedImeis = selectedImeis + (matched.id to unit.imei)
              message = "IMEI ${unit.imei.takeLast(6)} привязан к ${matched.name}"
              scannerCode = ""
            }
          }
        }
        .onFailure { message = it.message }
      scannerBusy = false
    }
  }
  val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (granted) scanning = true else message = "Разрешите камеру для сканера"
  }
  fun openScanner() {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) scanning = true
    else cameraPermission.launch(Manifest.permission.CAMERA)
  }
  val gross = products.sumOf { (cart[it.id] ?: 0) * it.price }
  val pct = discount.toIntOrNull()?.coerceIn(0, 100) ?: 0
  val total = gross * (100 - pct) / 100
  LazyColumn(modifier.fillMaxSize().background(PosInk).statusBarsPadding(), contentPadding = PaddingValues(14.dp)) {
    item {
      Text("Продажа", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
      Text("Чек: ${cart.values.sum()} поз. · $total сом", color = PosMuted, modifier = Modifier.padding(bottom = 12.dp))
      error?.let { Text(it, color = PosCoral) }
      if (shift == null) {
        Card(colors = CardDefaults.cardColors(containerColor = PosSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
          Column(Modifier.padding(14.dp)) {
            Text("Смена закрыта", color = PosCoral, fontWeight = FontWeight.Bold)
            Text("Откройте кассовую смену до первой продажи", color = PosMuted, fontSize = 12.sp)
            OutlinedButton(onClick = onOpenShift, modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("pos-open-shift")) { Text("Перейти к смене") }
          }
        }
      }
      OutlinedTextField(
        scannerCode,
        { scannerCode = normalizeStaffCode(it) },
        label = { Text("SKU, штрихкод или IMEI") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().testTag("pos-scanner-code"),
      )
      Row(Modifier.fillMaxWidth().padding(top = 7.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        OutlinedButton(onClick = { applyScannerCode(scannerCode) }, enabled = scannerCode.isNotBlank() && !scannerBusy, modifier = Modifier.weight(1f).testTag("pos-use-code")) { Text("Добавить") }
        OutlinedButton(onClick = { openScanner() }, enabled = !scannerBusy, modifier = Modifier.weight(1f).testTag("pos-open-scanner")) { Text("Камера") }
      }
    }
    items(products, key = Product::id) { product ->
      val qty = cart[product.id] ?: 0
      val selectedImei = selectedImeis[product.id]
      Card(colors = CardDefaults.cardColors(containerColor = PosSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 7.dp)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
          Column(Modifier.weight(1f)) {
            Text(product.name, color = Color.White, fontWeight = FontWeight.Bold)
            Text("${product.sku} · ${product.price} сом · ${product.availableUnits} шт.", color = PosMuted, fontSize = 11.sp)
            selectedImei?.let { Text("IMEI ${it.takeLast(8)}", color = PosLime, fontSize = 11.sp) }
          }
          Row {
            if (qty > 0) {
              IconButton(
                onClick = {
                  cart = if (qty == 1) cart - product.id else cart + (product.id to qty - 1)
                  if (qty == 1) selectedImeis = selectedImeis - product.id
                },
                modifier = Modifier.semantics { contentDescription = "Уменьшить ${product.name}" },
              ) { Text("-", color = Color.White, fontSize = 24.sp) }
              Text("$qty", color = Color.White, modifier = Modifier.padding(top = 12.dp))
            }
            IconButton(
              onClick = { if (qty < product.availableUnits && selectedImei == null) cart = cart + (product.id to qty + 1) },
              enabled = qty < product.availableUnits && selectedImei == null,
            ) { Icon(Icons.Default.Add, "Добавить ${product.name}", tint = PosLime) }
          }
        }
      }
    }
    item {
      OutlinedTextField(discount, { discount = it.filter(Char::isDigit).take(3) }, label = { Text("Скидка, %") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
      Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        posTenderOptions.take(4).forEach { (wire, label) ->
          OutlinedButton(onClick = { method = wire }, modifier = Modifier.weight(1f)) { Text(if (method == wire) "✓ $label" else label, fontSize = 11.sp) }
        }
      }
      Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        posTenderOptions.drop(4).forEach { (wire, label) ->
          OutlinedButton(onClick = { method = wire }, modifier = Modifier.weight(1f)) { Text(if (method == wire) "✓ $label" else label, fontSize = 11.sp) }
        }
      }
      OutlinedTextField(splitCash, { splitCash = it.filter(Char::isDigit) }, label = { Text("Наличные в split (необязательно)") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
      approvalId?.let { Text("Ожидается approval #${it.takeLast(8)}. После одобрения нажмите повторно.", color = PosCoral, modifier = Modifier.padding(top = 8.dp)) }
      Button(
        onClick = {
          val cash = splitCash.toIntOrNull()?.coerceIn(0, total) ?: 0
          val tenders = if (cash in 1 until total) listOf(PosTender("cash", cash), PosTender(method.takeUnless { it == "cash" } ?: "card", total - cash)) else listOf(PosTender(method, total))
          val request = PosSaleRequest(
            point = shift?.point ?: "BISHKEK-1", lines = products.mapNotNull { product -> cart[product.id]?.takeIf { it > 0 }?.let { PosLine(product.id, product.sku, product.price, it, selectedImeis[product.id]) } },
            tenders = tenders, discountPct = pct, clientSaleId = activeSaleId, approvalId = approvalId,
          )
          busy = true
          scope.launch {
            runCatching { manager.submit(request, session.accessToken) }
              .onSuccess { result -> when (result) {
                is PosSubmitResult.Queued -> { message = "Продажа сохранена офлайн"; schedulePosSync(context, apiBaseUrl) }
                is PosSubmitResult.Online -> when (val sale = result.result) {
                  is PosSaleResult.ApprovalRequired -> { approvalId = sale.approvalId; message = "Запрошено одобрение" }
                  is PosSaleResult.Completed -> {
                    message = "${sale.receiptNo} · оплачено ${sale.total} сом"
                    receipt = runCatching { gateway.renderPosReceipt(sale.orderId, session.accessToken) }.getOrNull()
                    cart = emptyMap(); selectedImeis = emptyMap(); approvalId = null; activeSaleId = UUID.randomUUID().toString()
                  }
                }
              } }
              .onFailure { message = it.message }
            busy = false
          }
        },
        enabled = !busy && shift != null && cart.isNotEmpty() && total > 0,
        colors = ButtonDefaults.buttonColors(containerColor = PosLime, contentColor = PosInk),
        modifier = Modifier.fillMaxWidth().height(58.dp).padding(top = 10.dp).testTag("pos-submit"),
      ) { Text("Оплатить $total сом", fontWeight = FontWeight.Bold) }
      message?.let { Text(it, color = PosLime, modifier = Modifier.padding(top = 8.dp)) }
      receipt?.let { rendered ->
        Card(
          colors = CardDefaults.cardColors(containerColor = Color.White),
          shape = RoundedCornerShape(8.dp),
          modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag("pos-receipt"),
        ) {
          Column(Modifier.padding(14.dp)) {
            Text("Чек с сервера", color = PosInk, fontWeight = FontWeight.Bold)
            Text(rendered.markup, color = PosInk, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
            Text("ESC/POS готов к печати", color = Design3.lime, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
          }
        }
      }
    }
  }
  if (scanning) BarcodeCamera(
    onCode = { applyScannerCode(it); scanning = false },
    onClose = { scanning = false },
    previewTag = "pos-camera-preview",
    closeTag = "pos-close-scanner",
  )
}

@Composable
private fun PosOfflineScreen(queue: OfflineQueueDb, apiBaseUrl: String, modifier: Modifier) {
  val context = LocalContext.current.applicationContext
  var revision by remember { mutableStateOf(0) }
  val pending = remember(revision) { queue.pending(includeConflicts = true) }
  LazyColumn(modifier.fillMaxSize().background(PosInk).statusBarsPadding(), contentPadding = PaddingValues(18.dp)) {
    item { Text("Офлайн-очередь", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black); Text("${pending.size} команд", color = PosMuted) }
    items(pending, key = PendingMutation::id) { command ->
      val approvalId = approvalIdFromQueueError(command.lastError)
      Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Text("${command.state} · ${command.idempotencyKey.takeLast(8)} · попыток ${command.attempts}", color = if (command.state == "conflict") PosCoral else Color.White)
        if (approvalId != null) {
          Text("Approval #${approvalId.takeLast(8)}", color = PosMuted, fontSize = 11.sp)
          OutlinedButton(onClick = {
            queue.replaceBodyAndRetry(command.id, attachPosApproval(command.body, approvalId))
            schedulePosSync(context, apiBaseUrl)
            revision += 1
          }, modifier = Modifier.fillMaxWidth().testTag("pos-approval-retry")) { Text("Повторить после одобрения") }
        } else if (command.state == "failed") {
          OutlinedButton(onClick = { queue.retry(command.id); schedulePosSync(context, apiBaseUrl); revision += 1 }, modifier = Modifier.fillMaxWidth()) { Text("Повторить") }
        }
      }
    }
    item { OutlinedButton(onClick = { schedulePosSync(context, apiBaseUrl) }, modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) { Text("Синхронизировать") } }
  }
}

@Composable
private fun PosAfterSaleScreen(
  products: List<Product>,
  session: StaffSession,
  gateway: PosGateway,
  onLogout: () -> Unit,
  modifier: Modifier,
) {
  val scope = rememberCoroutineScope()
  val context = LocalContext.current
  var returns by remember { mutableStateOf<List<PosReturn>>(emptyList()) }
  var orderId by rememberSaveable { mutableStateOf("") }
  var receipt by remember { mutableStateOf<PosReceipt?>(null) }
  var payments by remember { mutableStateOf<List<PosPayment>>(emptyList()) }
  var paymentId by rememberSaveable { mutableStateOf("") }
  var refundAmount by rememberSaveable { mutableStateOf("") }
  var refundReason by rememberSaveable { mutableStateOf("") }
  var oldImei by rememberSaveable { mutableStateOf("") }
  var newProductId by rememberSaveable { mutableStateOf("") }
  var exchangeMethod by rememberSaveable { mutableStateOf("cash") }
  var exchangeKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var exchangeEvidence by remember { mutableStateOf<StaffEvidenceDraft?>(null) }
  var busy by remember { mutableStateOf(false) }
  var message by remember { mutableStateOf<String?>(null) }
  var restockLocation by rememberSaveable { mutableStateOf("RETURNS-BISHKEK") }
  val exchangeEvidencePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    if (uri != null) {
      val bytes = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
      if (bytes != null) {
        exchangeEvidence = StaffEvidenceDraft(
          bytes = bytes,
          mimeType = context.contentResolver.getType(uri) ?: "image/jpeg",
          fileName = "exchange-condition.jpg",
        )
      }
    }
  }

  fun refreshReturns() {
    scope.launch {
      runCatching { gateway.posReturns(session.accessToken) }
        .onSuccess { returns = it }
        .onFailure { message = it.message }
    }
  }
  LaunchedEffect(Unit) { refreshReturns() }

  LazyColumn(modifier.fillMaxSize().background(PosInk).statusBarsPadding(), contentPadding = PaddingValues(16.dp)) {
    item {
      Text("Операции", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
      Text("Чеки, возвраты, refund и обмен", color = PosMuted, modifier = Modifier.padding(bottom = 12.dp))
      OutlinedTextField(orderId, { orderId = it.trim() }, label = { Text("ID заказа") }, modifier = Modifier.fillMaxWidth().testTag("pos-operation-order"))
      Button(
        onClick = {
          busy = true
          scope.launch {
            runCatching {
              receipt = gateway.renderPosReceipt(orderId, session.accessToken)
              payments = gateway.posPayments(orderId, session.accessToken)
            }.onSuccess {
              paymentId = payments.firstOrNull { it.amount > 0 }?.id.orEmpty()
              refundAmount = payments.firstOrNull { it.amount > 0 }?.amount?.toString().orEmpty()
              message = "Заказ загружен"
            }.onFailure { message = it.message }
            busy = false
          }
        },
        enabled = !busy && orderId.isNotBlank(),
        colors = ButtonDefaults.buttonColors(containerColor = PosLime, contentColor = PosInk),
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("pos-load-order"),
      ) { Text("Загрузить чек и платежи") }
      receipt?.let { Text(it.markup, color = Color.White, fontSize = 11.sp, modifier = Modifier.padding(top = 10.dp)) }
      payments.forEach { payment ->
        Text("${payment.method} · ${payment.amount} сом · ${payment.status} · ${payment.id.takeLast(8)}", color = PosMuted, fontSize = 11.sp)
      }

      Text("Refund через approval", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 22.dp))
      OutlinedTextField(paymentId, { paymentId = it.trim() }, label = { Text("ID платежа") }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
      OutlinedTextField(refundAmount, { refundAmount = it.filter(Char::isDigit) }, label = { Text("Сумма") }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
      OutlinedTextField(refundReason, { refundReason = it }, label = { Text("Причина") }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
      OutlinedButton(
        onClick = {
          busy = true
          scope.launch {
            runCatching { gateway.requestPosRefund(paymentId, refundAmount.toInt(), refundReason, session.accessToken) }
              .onSuccess { message = "Refund ожидает approval #${it.takeLast(8)}" }
              .onFailure { message = it.message }
            busy = false
          }
        },
        enabled = !busy && paymentId.isNotBlank() && (refundAmount.toIntOrNull() ?: 0) > 0 && refundReason.isNotBlank(),
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("pos-request-refund"),
      ) { Text("Запросить возврат денег") }

      Text("Обмен устройства", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 22.dp))
      OutlinedTextField(oldImei, { oldImei = normalizeStaffCode(it) }, label = { Text("Старый IMEI") }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
      OutlinedTextField(newProductId, { newProductId = it.trim() }, label = { Text("ID нового товара") }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
      Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        posTenderOptions.take(4).forEach { (wire, label) ->
          OutlinedButton(onClick = { exchangeMethod = wire }, modifier = Modifier.weight(1f)) { Text(if (exchangeMethod == wire) "✓ $label" else label, fontSize = 10.sp) }
        }
      }
      Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        posTenderOptions.drop(4).forEach { (wire, label) ->
          OutlinedButton(onClick = { exchangeMethod = wire }, modifier = Modifier.weight(1f)) { Text(if (exchangeMethod == wire) "✓ $label" else label, fontSize = 10.sp) }
        }
      }
      products.take(4).forEach { product ->
        OutlinedButton(onClick = { newProductId = product.id }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
          Text("${product.name} · ${product.price} сом", fontSize = 11.sp)
        }
      }
      OutlinedButton(
        onClick = { exchangeEvidencePicker.launch("image/*") },
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("pos-exchange-evidence"),
      ) { Text(if (exchangeEvidence == null) "Выбрать фото состояния" else "Фото состояния выбрано") }
      Button(
        onClick = {
          busy = true
          scope.launch {
            runCatching {
              val result = gateway.exchangePosDevice(
                PosExchangeRequest(orderId, oldImei, newProductId, exchangeMethod),
                session.accessToken,
                exchangeKey,
              )
              gateway.uploadPosExchangeEvidence(result.exchangeRequestId, requireNotNull(exchangeEvidence), session.accessToken)
              result
            }.onSuccess {
              message = "Ожидает согласования #${it.approvalId.takeLast(8)} · IMEI ${it.newImei.takeLast(8)} · доплата ${it.surchargeAmount} сом"
              exchangeKey = UUID.randomUUID().toString(); exchangeEvidence = null; oldImei = ""; newProductId = ""; refreshReturns()
            }.onFailure { message = it.message }
            busy = false
          }
        },
        enabled = !busy && orderId.isNotBlank() && oldImei.isNotBlank() && newProductId.isNotBlank() && exchangeEvidence != null,
        colors = ButtonDefaults.buttonColors(containerColor = PosLime, contentColor = PosInk),
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("pos-exchange"),
      ) { Text("Создать заявку на обмен") }

      Text("Очередь возвратов", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 22.dp))
      if (returns.any { it.status == "paid" }) {
        OutlinedTextField(restockLocation, { restockLocation = it.trim() }, label = { Text("Склад возврата") }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
      }
    }
    items(returns, key = PosReturn::id) { ret ->
      Card(colors = CardDefaults.cardColors(containerColor = PosSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().padding(top = 7.dp)) {
        Column(Modifier.padding(12.dp)) {
          Text("${ret.status} · заказ ${ret.orderId.takeLast(8)}", color = Color.White, fontWeight = FontWeight.Bold)
          Text(ret.reason, color = PosMuted, fontSize = 11.sp)
          if (ret.status == "processing") {
            Text("Ожидает выплаты", color = PosMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 7.dp))
          } else {
            Row(Modifier.fillMaxWidth().padding(top = 7.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
              nextReturnStatuses(ret.status).forEach { next ->
                OutlinedButton(onClick = {
                  busy = true
                  scope.launch {
                    runCatching { gateway.transitionPosReturn(ret.id, next, session.accessToken, location = if (next == "reconciled") restockLocation.trim() else null) }
                      .onSuccess { updated -> returns = returns.map { if (it.id == updated.id) updated else it }; message = "Возврат: ${updated.status}" }
                      .onFailure { message = it.message }
                    busy = false
                  }
                }, enabled = !busy, modifier = Modifier.weight(1f)) { Text(returnStatusLabel(next), fontSize = 10.sp) }
              }
            }
          }
        }
      }
    }
    item {
      message?.let { Text(it, color = PosLime, modifier = Modifier.padding(top = 12.dp).testTag("pos-operation-message")) }
      Text("${session.username} · ${session.role}", color = PosMuted, modifier = Modifier.padding(top = 24.dp))
      OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Выйти") }
    }
  }
}

private fun nextReturnStatuses(status: String): List<String> = when (status) {
  "requested" -> listOf("under_review", "rejected")
  "under_review" -> listOf("approved", "rejected")
  "approved" -> listOf("processing", "rejected")
  "paid" -> listOf("reconciled")
  else -> emptyList()
}

private fun returnStatusLabel(status: String): String = when (status) {
  "under_review" -> "Проверка"
  "approved" -> "Одобрить"
  "rejected" -> "Отклонить"
  "processing" -> "Принять"
  "reconciled" -> "Сверить"
  else -> status
}

@Composable private fun PosLoading() { Column(Modifier.fillMaxSize().background(PosInk), verticalArrangement = Arrangement.Center) { CircularProgressIndicator(color = PosLime, modifier = Modifier.padding(24.dp)) } }

private fun schedulePosSync(context: android.content.Context, apiBaseUrl: String) {
  val request = OneTimeWorkRequestBuilder<PosSyncWorker>()
    .setInputData(Data.Builder().putString("apiBaseUrl", apiBaseUrl).build())
    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
    .build()
  WorkManager.getInstance(context).enqueueUniqueWork("alistore-pos-sync", ExistingWorkPolicy.KEEP, request)
}

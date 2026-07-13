package kg.alistore.core

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

private val PosInk = Color(0xFF171411)
private val PosSurface = Color(0xFF24201C)
private val PosMuted = Color(0xFFA79C92)
private val PosCoral = Color(0xFFFF6B57)
private val PosLime = Color(0xFFC8F04B)

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
  var state by remember { mutableStateOf<StaffAuthState>(StaffAuthState.Restoring) }
  LaunchedEffect(auth) { state = auth.restore() }
  MaterialTheme {
    when (val current = state) {
      StaffAuthState.Restoring -> PosLoading()
      StaffAuthState.SignedOut -> PosLogin(auth) { state = it }
      is StaffAuthState.Failed -> PosLogin(auth, current.message) { state = it }
      is StaffAuthState.SignedIn -> if (current.session.role in setOf("cashier", "admin", "owner")) {
        PosWorkspace(current.session, api, apiBaseUrl) { state = auth.logout() }
      } else PosLogin(auth, "У роли ${current.session.role} нет доступа к кассе") { state = auth.logout() }
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
  var error by remember { mutableStateOf<String?>(null) }
  LaunchedEffect(apiBaseUrl) { runCatching { api.catalog() }.onSuccess { products = it }.onFailure { error = it.message } }
  Scaffold(containerColor = PosInk, bottomBar = {
    NavigationBar(containerColor = PosSurface) {
      listOf("Продажа", "Офлайн", "Профиль").forEachIndexed { index, label ->
        NavigationBarItem(selected == index, { selected = index }, { Icon(if (index == 0) Icons.Default.Home else if (index == 1) Icons.Default.ShoppingCart else Icons.Default.AccountCircle, label) }, label = { Text(label) })
      }
    }
  }) { padding ->
    when (selected) {
      0 -> PosSaleScreen(products, error, session, manager, apiBaseUrl, Modifier.padding(padding))
      1 -> PosOfflineScreen(queue, apiBaseUrl, Modifier.padding(padding))
      else -> PosProfile(session, onLogout, Modifier.padding(padding))
    }
  }
}

@Composable
private fun PosSaleScreen(products: List<Product>, error: String?, session: StaffSession, manager: PosSaleManager, apiBaseUrl: String, modifier: Modifier) {
  val context = LocalContext.current.applicationContext
  val scope = rememberCoroutineScope()
  var cart by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
  var discount by rememberSaveable { mutableStateOf("0") }
  var method by rememberSaveable { mutableStateOf("cash") }
  var splitCash by rememberSaveable { mutableStateOf("") }
  var activeSaleId by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var approvalId by rememberSaveable { mutableStateOf<String?>(null) }
  var message by remember { mutableStateOf<String?>(null) }
  var busy by remember { mutableStateOf(false) }
  val gross = products.sumOf { (cart[it.id] ?: 0) * it.price }
  val pct = discount.toIntOrNull()?.coerceIn(0, 100) ?: 0
  val total = gross * (100 - pct) / 100
  LazyColumn(modifier.fillMaxSize().background(PosInk).statusBarsPadding(), contentPadding = PaddingValues(14.dp)) {
    item {
      Text("Продажа", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
      Text("Чек: ${cart.values.sum()} поз. · $total сом", color = PosMuted, modifier = Modifier.padding(bottom = 12.dp))
      error?.let { Text(it, color = PosCoral) }
    }
    items(products, key = Product::id) { product ->
      val qty = cart[product.id] ?: 0
      Card(colors = CardDefaults.cardColors(containerColor = PosSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 7.dp)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
          Column(Modifier.weight(1f)) { Text(product.name, color = Color.White, fontWeight = FontWeight.Bold); Text("${product.sku} · ${product.price} сом · ${product.availableUnits} шт.", color = PosMuted, fontSize = 11.sp) }
          Row {
            if (qty > 0) {
              IconButton(
                onClick = {
                  cart = if (qty == 1) cart - product.id else cart + (product.id to qty - 1)
                },
                modifier = Modifier.semantics { contentDescription = "Уменьшить ${product.name}" },
              ) { Text("-", color = Color.White, fontSize = 24.sp) }
              Text("$qty", color = Color.White, modifier = Modifier.padding(top = 12.dp))
            }
            IconButton(
              onClick = { if (qty < product.availableUnits) cart = cart + (product.id to qty + 1) },
              enabled = qty < product.availableUnits,
            ) { Icon(Icons.Default.Add, "Добавить ${product.name}", tint = PosLime) }
          }
        }
      }
    }
    item {
      OutlinedTextField(discount, { discount = it.filter(Char::isDigit).take(3) }, label = { Text("Скидка, %") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
      Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("cash" to "Наличные", "card" to "Карта", "qr_mbank" to "MBank").forEach { (wire, label) ->
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
            point = "BISHKEK-1", lines = products.mapNotNull { product -> cart[product.id]?.takeIf { it > 0 }?.let { PosLine(product.id, product.sku, product.price, it) } },
            tenders = tenders, discountPct = pct, clientSaleId = activeSaleId, approvalId = approvalId,
          )
          busy = true
          scope.launch {
            runCatching { manager.submit(request, session.accessToken) }
              .onSuccess { result -> when (result) {
                is PosSubmitResult.Queued -> { message = "Продажа сохранена офлайн"; schedulePosSync(context, apiBaseUrl) }
                is PosSubmitResult.Online -> when (val sale = result.result) {
                  is PosSaleResult.ApprovalRequired -> { approvalId = sale.approvalId; message = "Запрошено одобрение" }
                  is PosSaleResult.Completed -> { message = "${sale.receiptNo} · оплачено ${sale.total} сом"; cart = emptyMap(); approvalId = null; activeSaleId = UUID.randomUUID().toString() }
                }
              } }
              .onFailure { message = it.message }
            busy = false
          }
        },
        enabled = !busy && cart.isNotEmpty() && total > 0,
        colors = ButtonDefaults.buttonColors(containerColor = PosLime, contentColor = PosInk),
        modifier = Modifier.fillMaxWidth().height(58.dp).padding(top = 10.dp).testTag("pos-submit"),
      ) { Text("Оплатить $total сом", fontWeight = FontWeight.Bold) }
      message?.let { Text(it, color = PosLime, modifier = Modifier.padding(top = 8.dp)) }
    }
  }
}

@Composable
private fun PosOfflineScreen(queue: OfflineQueueDb, apiBaseUrl: String, modifier: Modifier) {
  val context = LocalContext.current.applicationContext
  val pending = queue.pending()
  LazyColumn(modifier.fillMaxSize().background(PosInk).statusBarsPadding(), contentPadding = PaddingValues(18.dp)) {
    item { Text("Офлайн-очередь", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black); Text("${pending.size} команд", color = PosMuted) }
    items(pending, key = PendingMutation::id) { command -> Text("${command.state} · ${command.idempotencyKey.takeLast(8)} · попыток ${command.attempts}", color = if (command.state == "conflict") PosCoral else Color.White, modifier = Modifier.padding(top = 12.dp)) }
    item { OutlinedButton(onClick = { schedulePosSync(context, apiBaseUrl) }, modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) { Text("Синхронизировать") } }
  }
}

@Composable
private fun PosProfile(session: StaffSession, onLogout: () -> Unit, modifier: Modifier) {
  Column(modifier.fillMaxSize().background(PosInk).statusBarsPadding().padding(24.dp)) {
    Text(session.username, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
    Text(session.role, color = PosMuted)
    OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth().padding(top = 24.dp)) { Text("Выйти") }
  }
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

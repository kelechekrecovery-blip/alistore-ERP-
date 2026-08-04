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

interface CustomerReturnsGateway : CustomerEvidenceGateway {
  suspend fun orders(token: String): List<CustomerOrder>
  suspend fun returns(token: String): List<CustomerReturn>
  suspend fun openReturn(request: CreateReturnRequest, token: String, idempotencyKey: String): CustomerReturn
}

private val ReturnsInk = Design3.screen
private val ReturnsSurface = Design3.surface
private val ReturnsLine = Design3.hairline
private val ReturnsMuted = Design3.textMuted
private val ReturnsCoral = Design3.orange
private val ReturnsLime = Design3.lime

private val returnReasons = listOf(
  "Не подошёл / передумал",
  "Брак / не работает",
  "Не соответствует описанию",
  "Пришёл не тот товар",
)

@Composable
internal fun ClientReturnsScreen(
  apiBaseUrl: String,
  session: AuthState.SignedIn,
  onBack: () -> Unit,
  modifier: Modifier = Modifier,
  providedGateway: CustomerReturnsGateway? = null,
  authManager: AuthSessionManager? = null,
  onAuthState: (AuthState) -> Unit = {},
) {
  val gateway = remember(apiBaseUrl, providedGateway) { providedGateway ?: ApiClient(apiBaseUrl) }
  val scope = rememberCoroutineScope()
  var orders by remember { mutableStateOf<List<CustomerOrder>>(emptyList()) }
  var returns by remember { mutableStateOf<List<CustomerReturn>>(emptyList()) }
  var selectedOrder by remember { mutableStateOf<String?>(null) }
  var selectedReason by remember { mutableStateOf<String?>(null) }
  var key by remember { mutableStateOf(UUID.randomUUID().toString()) }
  var loading by remember { mutableStateOf(true) }
  var loadError by remember { mutableStateOf<String?>(null) }
  var submitError by remember { mutableStateOf<String?>(null) }
  var submitting by remember { mutableStateOf(false) }
  var created by remember { mutableStateOf<CustomerReturn?>(null) }
  var refresh by remember { mutableIntStateOf(0) }

  LaunchedEffect(session.tokens.accessToken, refresh) {
    loading = true
    var token = session.tokens.accessToken
    var attempt = runCatching { gateway.orders(token) to gateway.returns(token) }
    if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
      val renewed = authManager.refresh(session)
      onAuthState(renewed)
      if (renewed is AuthState.SignedIn) {
        token = renewed.tokens.accessToken
        attempt = runCatching { gateway.orders(token) to gateway.returns(token) }
      }
    }
    attempt.onSuccess { (loadedOrders, loadedReturns) ->
      orders = loadedOrders.filter { it.status in setOf("paid", "ready_for_pickup", "delivered", "completed") }
      returns = loadedReturns
      selectedOrder = selectedOrder ?: orders.firstOrNull { order -> loadedReturns.none { it.orderId == order.id } }?.id
      loadError = null
    }.onFailure { loadError = it.message ?: "Не удалось загрузить возвраты" }
    loading = false
  }

  fun resetCommand() { key = UUID.randomUUID().toString(); submitError = null; created = null }
  val availableOrders = orders.filter { order -> returns.none { it.orderId == order.id } }

  LazyColumn(
    modifier.fillMaxSize().background(ReturnsInk).statusBarsPadding().padding(18.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    item {
      Button(onClick = onBack, shape = RoundedCornerShape(8.dp), colors = ButtonDefaults.buttonColors(containerColor = ReturnsSurface, contentColor = Color.White)) { Text("Назад") }
      Text("Возврат товара", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 14.dp).testTag("returns-title"))
      Text("Статус и возврат денег подтверждает только AliStore", color = ReturnsMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
    }
    when {
      loading -> item { Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(color = ReturnsLime) } }
      loadError != null -> item { ReturnError(loadError!!) { refresh += 1 } }
      else -> {
        if (created != null) {
          item {
            Column(Modifier.fillMaxWidth().background(ReturnsSurface, RoundedCornerShape(8.dp)).padding(16.dp).testTag("return-created")) {
              Text("Заявка отправлена", color = ReturnsLime, fontWeight = FontWeight.Bold, fontSize = 18.sp)
              Text("RET-${created!!.id.takeLast(6)} · рассмотрим за 24 часа", color = ReturnsMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp))
              Text("Заявка принята  ·  Проверка товара  ·  Возврат денег", color = ReturnsMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 10.dp))
              CustomerEvidencePicker("return", created!!.id, session, gateway, authManager, onAuthState, Modifier.fillMaxWidth().padding(top = 10.dp))
            }
          }
        } else if (availableOrders.isNotEmpty()) {
          item { Text("Выберите заказ", color = ReturnsMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 5.dp)) }
          items(availableOrders, key = { "eligible-${it.id}" }) { order ->
            Column(
              Modifier.fillMaxWidth().background(ReturnsSurface, RoundedCornerShape(8.dp))
                .clickable { selectedOrder = order.id; resetCommand() }
                .padding(14.dp).testTag("return-order-${order.id}"),
            ) {
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Заказ #${order.id.takeLast(8)}", color = Color.White, fontWeight = FontWeight.Bold)
                Text(if (selectedOrder == order.id) "Выбран" else "Выбрать", color = ReturnsLime, fontSize = 11.sp)
              }
              Text(order.items.joinToString { "${it.sku} × ${it.qty}" }.ifBlank { "${order.total} сом" }, color = ReturnsMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
            }
          }
          item { Text("Причина возврата", color = ReturnsMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 7.dp)) }
          items(returnReasons, key = { it }) { reason ->
            Text(
              reason,
              color = Color.White,
              modifier = Modifier.fillMaxWidth().background(ReturnsSurface, RoundedCornerShape(8.dp))
                .clickable { selectedReason = reason; resetCommand() }
                .padding(14.dp).testTag("return-reason-${returnReasons.indexOf(reason)}"),
            )
          }
          item {
            submitError?.let { Text(it, color = ReturnsCoral, fontSize = 12.sp) }
            Button(
              onClick = {
                val orderId = selectedOrder ?: return@Button
                val reason = selectedReason ?: return@Button
                scope.launch {
                  submitting = true
                  val command = CreateReturnRequest(orderId, reason)
                  var attempt = runCatching { gateway.openReturn(command, session.tokens.accessToken, key) }
                  if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
                    val renewed = authManager.refresh(session)
                    onAuthState(renewed)
                    if (renewed is AuthState.SignedIn) attempt = runCatching { gateway.openReturn(command, renewed.tokens.accessToken, key) }
                  }
                  attempt.onSuccess { result ->
                    created = result
                    returns = listOf(result) + returns.filterNot { it.id == result.id }
                    submitError = null
                  }.onFailure { submitError = it.message ?: "Не удалось отправить заявку" }
                  submitting = false
                }
              },
              enabled = !submitting && selectedOrder != null && selectedReason != null,
              modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("return-submit"),
              colors = ButtonDefaults.buttonColors(containerColor = ReturnsLime, contentColor = ReturnsInk),
              shape = RoundedCornerShape(8.dp),
            ) { Text(if (submitting) "Отправляем…" else "Отправить заявку", fontWeight = FontWeight.Bold) }
          }
        } else if (returns.isEmpty()) {
          item { Text("Нет заказов, доступных для возврата", color = ReturnsMuted, modifier = Modifier.fillMaxWidth().background(ReturnsSurface, RoundedCornerShape(8.dp)).padding(18.dp)) }
        }
        if (returns.isNotEmpty()) {
          item { Text("Мои заявки", color = ReturnsMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 12.dp)) }
          items(returns, key = { "existing-${it.id}" }) { ret ->
            Column(Modifier.fillMaxWidth().background(ReturnsSurface, RoundedCornerShape(8.dp)).padding(14.dp).testTag("return-${ret.id}")) {
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("RET-${ret.id.takeLast(6)}", color = Color.White, fontWeight = FontWeight.Bold)
                Text(ret.status.returnLabel(), color = ReturnsLime, fontSize = 11.sp)
              }
              Text(ret.reason, color = ReturnsMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
              ret.order?.let { Text("${it.total} сом · ${it.createdAt.take(10)}", color = ReturnsMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp)) }
            }
          }
        }
      }
    }
  }
}

@Composable private fun ReturnError(detail: String, retry: () -> Unit) =
  Column(Modifier.fillMaxWidth().background(ReturnsSurface, RoundedCornerShape(8.dp)).padding(16.dp)) {
    Text("Возвраты недоступны", color = ReturnsCoral, fontWeight = FontWeight.Bold)
    Text(detail, color = ReturnsMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
    Button(onClick = retry, modifier = Modifier.padding(top = 8.dp)) { Text("Повторить") }
  }

private fun String.returnLabel() = when (this) {
  "requested" -> "Заявка принята"; "under_review" -> "Проверка"; "approved" -> "Одобрено";
  "rejected" -> "Отклонено"; "processing" -> "Возврат денег"; "paid" -> "Выплачено"; "reconciled" -> "Завершено"; else -> this
}

package kg.alistore.core

import androidx.compose.foundation.background
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalUriHandler
import java.util.UUID
import kotlinx.coroutines.launch

interface CustomerOrdersGateway {
  suspend fun orders(token: String): List<CustomerOrder>
}

private val OrdersInk = Design3.screen
private val OrdersSurface = Design3.surface
private val OrdersMuted = Design3.textMuted
private val OrdersCoral = Design3.orange
private val OrdersLime = Design3.lime

@Composable
internal fun ClientOrdersScreen(
  apiBaseUrl: String,
  session: AuthState.SignedIn,
  refreshRevision: Int,
  onBack: () -> Unit,
  modifier: Modifier = Modifier,
  providedGateway: CustomerOrdersGateway? = null,
  authManager: AuthSessionManager? = null,
  onAuthState: (AuthState) -> Unit = {},
  paymentReturn: PaymentReturnRoute? = null,
  paymentReturnBaseUrl: String = "alistore://payment-return",
) {
  val gateway = remember(apiBaseUrl, providedGateway) { providedGateway ?: ApiClient(apiBaseUrl) }
  val paymentApi = paymentGateway(gateway)
  val supplyApi = gateway as? SupplyParityGateway
  val scope = rememberCoroutineScope()
  val context = LocalContext.current.applicationContext
  val intentStore = remember(context, session.user.customerId) {
    StableCommandIntentStore(context, QueueOwner.client(session.user.customerId))
  }
  val uriHandler = LocalUriHandler.current
  var orders by remember { mutableStateOf<List<CustomerOrder>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var manualRefresh by remember { mutableStateOf(0) }
  var paymentBusy by remember { mutableStateOf(false) }
  var paymentError by remember { mutableStateOf<String?>(null) }
  var cancellationPreviews by remember { mutableStateOf<Map<String, OrderCancellationPreview>>(emptyMap()) }
  var cancellations by remember { mutableStateOf<Map<String, OrderCancellation>>(emptyMap()) }

  LaunchedEffect(session.tokens.accessToken, refreshRevision, manualRefresh) {
    loading = true
    var attempt = runCatching { gateway.orders(session.tokens.accessToken) }
    if (attempt.exceptionOrNull() is ApiException &&
      (attempt.exceptionOrNull() as ApiException).status == 401 && authManager != null) {
      val refreshed = authManager.refresh(session)
      onAuthState(refreshed)
      if (refreshed is AuthState.SignedIn) attempt = runCatching { gateway.orders(refreshed.tokens.accessToken) }
    }
    attempt
      .onSuccess {
        orders = it
        error = null
        if (supplyApi != null) {
          cancellationPreviews = it.mapNotNull { order ->
            runCatching { supplyApi.cancellationPreview(order.id, session.tokens.accessToken) }
              .getOrNull()?.let { preview -> order.id to preview }
          }.toMap()
          cancellations = it.mapNotNull { order ->
            runCatching { supplyApi.currentCancellation(order.id, session.tokens.accessToken) }
              .getOrNull()?.let { cancellation -> order.id to cancellation }
          }.toMap()
        }
      }
      .onFailure { error = it.message ?: "Не удалось загрузить заказы" }
    loading = false
  }

  LazyColumn(
    modifier.fillMaxSize().background(OrdersInk).padding(18.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    item {
      Button(onClick = onBack, colors = ButtonDefaults.buttonColors(containerColor = OrdersSurface, contentColor = Color.White)) {
        Text("Назад")
      }
      Text("Мои заказы", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 14.dp).testTag("orders-title"))
      Text("Статусы загружаются с сервера", color = OrdersMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
    }
    if (paymentReturn != null) {
      val route = paymentReturn
      val order = orders.firstOrNull { it.id == route.orderId }
      item {
        PaymentReturnCard(
          route = route,
          order = order,
          retryAvailable = paymentApi != null && order != null && route.method != null,
          busy = paymentBusy,
          error = paymentError,
          onRetry = {
            val retryOrder = order ?: return@PaymentReturnCard
            val retryMethod = route.method ?: return@PaymentReturnCard
            val api = paymentApi ?: return@PaymentReturnCard
            scope.launch {
              paymentBusy = true
              paymentError = null
              val retryKey = UUID.randomUUID().toString()
              var attempt = runCatching {
                api.createPaymentIntent(
                  CreatePaymentIntentRequest(
                    orderId = retryOrder.id,
                    method = retryMethod,
                    amount = retryOrder.total,
                    returnUrl = paymentReturnBaseUrl.withPaymentQuery(retryOrder.id, retryMethod.wireValue),
                  ),
                  session.tokens.accessToken,
                  retryKey,
                )
              }
              if (attempt.exceptionOrNull() is ApiException &&
                (attempt.exceptionOrNull() as ApiException).status == 401 && authManager != null) {
                val refreshed = authManager.refresh(session)
                onAuthState(refreshed)
                if (refreshed is AuthState.SignedIn) {
                  attempt = runCatching {
                    api.createPaymentIntent(
                      CreatePaymentIntentRequest(
                        orderId = retryOrder.id,
                        method = retryMethod,
                        amount = retryOrder.total,
                        returnUrl = paymentReturnBaseUrl.withPaymentQuery(retryOrder.id, retryMethod.wireValue),
                      ),
                      refreshed.tokens.accessToken,
                      retryKey,
                    )
                  }
                }
              }
              attempt
                .onSuccess { intent -> uriHandler.openUri(resolvePaymentUrl(apiBaseUrl, intent.paymentUrl)) }
                .onFailure { paymentError = it.message ?: "Не удалось повторить оплату" }
              paymentBusy = false
            }
          },
        )
      }
    }
    when {
      loading -> item {
        Column(Modifier.fillMaxWidth().padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally) {
          CircularProgressIndicator(color = OrdersLime)
          Text("Загружаем заказы", color = OrdersMuted, modifier = Modifier.padding(top = 10.dp))
        }
      }
      error != null -> item {
        Column(Modifier.fillMaxWidth().background(OrdersSurface, RoundedCornerShape(8.dp)).padding(16.dp)) {
          Text("Заказы недоступны", color = OrdersCoral, fontWeight = FontWeight.Bold)
          Text(error!!, color = OrdersMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
          Button(onClick = { manualRefresh += 1 }, modifier = Modifier.padding(top = 10.dp)) { Text("Повторить") }
        }
      }
      orders.isEmpty() -> item {
        Text("Заказов пока нет", color = OrdersMuted, modifier = Modifier.fillMaxWidth().background(OrdersSurface, RoundedCornerShape(8.dp)).padding(22.dp))
      }
      else -> items(orders, key = { it.id }) { order ->
        Column(Modifier.fillMaxWidth().background(OrdersSurface, RoundedCornerShape(8.dp)).padding(15.dp).testTag("order-${order.id}")) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Заказ #${order.id.takeLast(8)}", color = Color.White, fontWeight = FontWeight.Bold)
            Text(order.statusLabel(), color = OrdersLime, fontSize = 11.sp, fontWeight = FontWeight.Bold)
          }
          Text("${order.items.sumOf { it.qty }} тов. · ${order.total} сом", color = OrdersMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp))
          order.createdAt?.take(10)?.let { Text(it, color = OrdersMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp)) }
          order.items.forEach { line ->
            Text(
              "${line.sku} · ${line.qty} шт. · ${line.fulfillmentStatus.supplyStatusLabel()}",
              color = Color.White,
              fontSize = 12.sp,
              modifier = Modifier.padding(top = 8.dp),
            )
            line.promisedDate?.take(10)?.let { eta ->
              Text("Обещанная дата: $eta", color = OrdersMuted, fontSize = 11.sp)
            }
          }
          if (order.paymentSchedule.isNotEmpty()) {
            Text("График оплаты", color = OrdersLime, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
            order.paymentSchedule.forEach { receivable ->
              Text(
                "${receivable.kind.receivableLabel()}: ${receivable.settledAmount}/${receivable.amount} сом · ${receivable.status}",
                color = OrdersMuted,
                fontSize = 11.sp,
              )
            }
          }
          cancellations[order.id]?.let { cancellation ->
            Text(
              "Отмена/возврат: ${cancellation.status} · ${cancellation.approvedRefundAmount ?: cancellation.requestedRefundAmount} сом",
              color = OrdersCoral,
              fontSize = 12.sp,
              modifier = Modifier.padding(top = 10.dp).testTag("cancellation-status-${order.id}"),
            )
          }
          val preview = cancellationPreviews[order.id]
          if (preview != null && cancellations[order.id] == null) {
            CancellationControls(
              orderId = order.id,
              preview = preview,
              enabled = supplyApi != null,
              onRequest = { reason ->
                supplyApi?.let { api ->
                  scope.launch {
                    val intent = intentStore.cancellation(order.id, reason)
                    runCatching {
                      api.requestCancellation(
                        order.id,
                        reason,
                        session.tokens.accessToken,
                        intent.idempotencyKey,
                      )
                    }.onSuccess { cancellation ->
                      intentStore.close(intent)
                      cancellations = cancellations + (order.id to cancellation)
                    }.onFailure { failure ->
                      error = failure.message ?: "Не удалось отправить отмену"
                    }
                  }
                }
              },
            )
          }
        }
      }
    }
  }
}

@Composable
private fun CancellationControls(
  orderId: String,
  preview: OrderCancellationPreview,
  enabled: Boolean,
  onRequest: (String) -> Unit,
) {
  var reason by remember(orderId) { mutableStateOf("") }
  Text(
    "Возврат задатка: ${preview.estimatedRefundAmount} сом · ${if (preview.ownerReviewRequired) "решение владельца" else "автоматически"}",
    color = OrdersMuted,
    fontSize = 11.sp,
    modifier = Modifier.padding(top = 10.dp),
  )
  if (preview.canCancel && preview.requestEnabled && enabled) {
    OutlinedTextField(
      value = reason,
      onValueChange = { reason = it },
      label = { Text("Причина отмены") },
      modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("cancellation-reason-$orderId"),
    )
    Button(
      onClick = { onRequest(reason.trim()) },
      enabled = reason.trim().length >= 3,
      colors = ButtonDefaults.buttonColors(containerColor = OrdersCoral),
      modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("cancellation-request-$orderId"),
    ) { Text("Запросить отмену") }
  } else if (!preview.blockedReason.isNullOrBlank()) {
    Text("Отмена недоступна: ${preview.blockedReason}", color = OrdersMuted, fontSize = 11.sp)
  }
}

private fun String?.supplyStatusLabel(): String = when (this) {
  "awaiting_deposit" -> "ожидает задатка"
  "procurement_draft" -> "закупка проверяется"
  "supplier_ordered" -> "заказан поставщику"
  "in_transit" -> "в пути"
  "received", "quality_check" -> "поступил, проверяем"
  "ready" -> "готов"
  "handed_over" -> "выдан"
  "quarantined" -> "на решении владельца"
  "customer_cancelled", "cancelled" -> "отменён"
  else -> this ?: "обрабатывается"
}

private fun String.receivableLabel(): String = when (this) {
  "supply_deposit" -> "Задаток"
  "stock_sale" -> "Складской товар"
  "supply_balance" -> "Остаток заказного товара"
  "delivery" -> "Доставка"
  else -> this
}

private fun String.withPaymentQuery(orderId: String, method: String): String {
  val separator = if (contains('?')) '&' else '?'
  return "$this${separator}orderId=$orderId&method=$method"
}

private fun paymentGateway(gateway: CustomerOrdersGateway): PaymentGateway? = gateway as? PaymentGateway

@Composable
private fun PaymentReturnCard(
  route: PaymentReturnRoute,
  order: CustomerOrder?,
  retryAvailable: Boolean,
  busy: Boolean,
  error: String?,
  onRetry: () -> Unit,
) {
  val confirmed = order?.status in setOf("paid", "completed")
  val failed = route.isFailed()
  val title = when {
    failed -> "Оплата не прошла"
    confirmed -> "Оплата подтверждена"
    else -> "Вернулись из оплаты"
  }
  val detail = when {
    failed -> "Провайдер не подтвердил платёж. Заказ и деньги изменятся только после серверной проверки."
    confirmed -> "Сервер подтвердил оплату. Актуальный статус заказа показан ниже."
    else -> "Проверяем результат оплаты на сервере. Не повторяйте оплату, пока статус не обновился."
  }
  Column(Modifier.fillMaxWidth().background(OrdersSurface, RoundedCornerShape(8.dp)).padding(16.dp)) {
    Text(title, color = if (failed) OrdersCoral else OrdersLime, fontWeight = FontWeight.Bold, modifier = Modifier.testTag("payment-return-title"))
    Text(detail, color = OrdersMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
    route.orderId?.let { Text("Заказ #${it.takeLast(8)}", color = Color.White, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)) }
    if (!error.isNullOrBlank()) Text(error, color = OrdersCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp).testTag("payment-return-error"))
    if (failed && retryAvailable) {
      Button(onClick = onRetry, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag("payment-return-retry")) {
        Text(if (busy) "Открываем оплату…" else "Повторить оплату")
      }
    } else if (failed) {
      Text("Если заказ не изменился, обратитесь в поддержку.", color = OrdersMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
    }
  }
}

private fun CustomerOrder.statusLabel(): String = when (status) {
  "created" -> "Создан"
  "reserved" -> "Зарезервирован"
  "awaiting_payment" -> "Ожидает оплаты"
  "paid" -> "Оплачен"
  "completed" -> "Завершён"
  "cancelled" -> "Отменён"
  else -> status
}

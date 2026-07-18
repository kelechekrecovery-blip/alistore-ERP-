package kg.alistore.core

import android.content.Context
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.UUID
import java.net.URL
import kotlinx.coroutines.launch

private val CheckoutInk = Color(0xFF16130F)
private val CheckoutSurface = Color(0xFF221E19)
private val CheckoutLine = Color(0xFF342E28)
private val CheckoutMuted = Color(0xFFA79C92)
private val CheckoutCoral = Color(0xFFFF6B57)
private val CheckoutLime = Color(0xFFC8F04B)

@Composable
internal fun ClientCheckout(
  apiBaseUrl: String,
  products: List<Product>,
  cart: Map<String, Int>,
  authState: AuthState,
  onQuantity: (String, Int) -> Unit,
  onClear: () -> Unit,
  onLogin: () -> Unit,
  modifier: Modifier = Modifier,
  authManager: AuthSessionManager? = null,
  onAuthState: (AuthState) -> Unit = {},
  paymentReturnBaseUrl: String = "alistore://payment-return",
) {
  val context = LocalContext.current.applicationContext
  val scope = rememberCoroutineScope()
  val checkout = remember(apiBaseUrl) { CheckoutManager(ApiClient(apiBaseUrl), OfflineQueueDb(context)) }
  val api = remember(apiBaseUrl) { ApiClient(apiBaseUrl) }
  var fulfillment by rememberSaveable { mutableStateOf("pickup") }
  var paymentMethod by rememberSaveable { mutableStateOf("cash") }
  var address by rememberSaveable { mutableStateOf("") }
  var pickupPoints by remember { mutableStateOf<List<StorePoint>>(emptyList()) }
  var selectedStorePointId by rememberSaveable { mutableStateOf("") }
  var pointError by remember { mutableStateOf<String?>(null) }
  var idempotencyKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var paymentIdempotencyKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  var result by remember { mutableStateOf<CheckoutResult?>(null) }
  val lines = cart.mapNotNull { (id, quantity) -> products.firstOrNull { it.id == id }?.let { it to quantity.coerceAtMost(it.availableUnits) } }
  val total = lines.sumOf { (product, quantity) -> product.price * quantity }

  LaunchedEffect(apiBaseUrl) {
    runCatching { api.checkoutStorePoints() }
      .onSuccess { points ->
        pickupPoints = points
        if (points.none { it.id == selectedStorePointId }) selectedStorePointId = points.firstOrNull()?.id.orEmpty()
        pointError = if (points.isEmpty()) "Самовывоз временно недоступен" else null
      }
      .onFailure { failure -> pointError = failure.message; pickupPoints = emptyList(); selectedStorePointId = "" }
  }

  if (result != null) {
    CheckoutResultScreen(result!!, apiBaseUrl, modifier) {
      result = null
      idempotencyKey = UUID.randomUUID().toString()
      paymentIdempotencyKey = UUID.randomUUID().toString()
    }
    return
  }
  if (lines.isEmpty()) {
    CheckoutMessage("Корзина пуста", "Добавьте товары из каталога", modifier)
    return
  }

  LazyColumn(
    modifier.fillMaxSize().background(CheckoutInk),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    item { Text("Корзина", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(18.dp, 18.dp, 18.dp, 4.dp)) }
    items(lines, key = { it.first.id }) { (product, quantity) ->
      Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).background(CheckoutSurface, RoundedCornerShape(8.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        Column(Modifier.weight(1f)) {
          Text(product.name, color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 2)
          Text("${product.price} сом · доступно ${product.availableUnits}", color = CheckoutMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
        }
        QuantityButton("−", quantity > 0) { onQuantity(product.id, quantity - 1) }
        Text(quantity.toString(), color = Color.White, modifier = Modifier.padding(top = 10.dp).testTag("cart-qty-${product.id}"))
        QuantityButton("+", quantity < product.availableUnits) { onQuantity(product.id, quantity + 1) }
      }
    }
    item {
      Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).background(CheckoutSurface, RoundedCornerShape(8.dp)).padding(14.dp)) {
        Text("Получение", color = Color.White, fontWeight = FontWeight.Bold)
        Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          FulfillmentButton("Самовывоз", fulfillment == "pickup", Modifier.weight(1f)) { fulfillment = "pickup" }
          FulfillmentButton("Курьер", fulfillment == "courier", Modifier.weight(1f)) { fulfillment = "courier" }
        }
        if (fulfillment == "courier") {
          OutlinedTextField(
            value = address,
            onValueChange = { address = it; error = null },
            label = { Text("Адрес доставки") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("checkout-address"),
            colors = OutlinedTextFieldDefaults.colors(
              focusedTextColor = Color.White, unfocusedTextColor = Color.White,
              focusedBorderColor = CheckoutLime, unfocusedBorderColor = CheckoutLine,
              focusedLabelColor = CheckoutLime, unfocusedLabelColor = CheckoutMuted,
            ),
          )
        } else {
          if (pickupPoints.isEmpty()) {
            Text(pointError ?: "Загружаем точки…", color = CheckoutMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp))
          } else {
            pickupPoints.forEach { point ->
              FulfillmentButton(
                "${point.name} · ${point.address}",
                selectedStorePointId == point.id,
                Modifier.fillMaxWidth().padding(top = 8.dp),
              ) { selectedStorePointId = point.id; error = null }
            }
          }
        }
      }
    }
    item {
      Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).background(CheckoutSurface, RoundedCornerShape(8.dp)).padding(14.dp)) {
        Text("Оплата", color = Color.White, fontWeight = FontWeight.Bold)
        listOf(
          "cash" to "При получении",
          OnlinePaymentMethod.CARD.wireValue to "Карта",
          OnlinePaymentMethod.MBANK.wireValue to "MBank QR",
          OnlinePaymentMethod.ODENGI.wireValue to "O!Деньги QR",
          OnlinePaymentMethod.INSTALLMENT.wireValue to "Рассрочка",
        ).chunked(2).forEach { row ->
          Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { (value, label) ->
              PaymentMethodButton(label, paymentMethod == value, Modifier.weight(1f)) { paymentMethod = value; error = null }
            }
            if (row.size == 1) androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
          }
        }
      }
    }
    item {
      Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
          Text("Итого", color = CheckoutMuted)
          Text("$total сом", color = CheckoutLime, fontSize = 20.sp, fontWeight = FontWeight.Black, modifier = Modifier.testTag("checkout-total"))
        }
        if (authState !is AuthState.SignedIn) {
          Text("Войдите по SMS-коду, чтобы оформить заказ", color = CheckoutCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
          Button(onClick = onLogin, modifier = Modifier.fillMaxWidth().padding(top = 10.dp), colors = ButtonDefaults.buttonColors(containerColor = CheckoutSurface, contentColor = Color.White)) { Text("Перейти ко входу") }
        } else {
          if (!error.isNullOrBlank()) Text(error!!, color = CheckoutCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
          Button(
            onClick = {
              scope.launch {
                busy = true
                error = null
                val request = CreateOrderRequest(
                  customerId = authState.user.customerId,
                  fulfillmentType = fulfillment,
                  storePointId = if (fulfillment == "pickup") selectedStorePointId else null,
                  deliveryAddress = if (fulfillment == "courier") address.trim() else null,
                  total = total,
                  items = lines.map { (product, quantity) -> CreateOrderItem(product.sku, quantity, product.price) },
                )
                val onlineMethod = OnlinePaymentMethod.entries.firstOrNull { it.wireValue == paymentMethod }
                suspend fun submit(token: String) = checkout.submit(
                  request,
                  token,
                  idempotencyKey,
                  onlineMethod,
                  if (onlineMethod == null) null else paymentIdempotencyKey,
                  paymentReturnBaseUrl,
                )
                var attempt = runCatching {
                  submit(authState.tokens.accessToken)
                }
                if (attempt.exceptionOrNull() is ApiException &&
                  (attempt.exceptionOrNull() as ApiException).status == 401 && authManager != null) {
                  val refreshed = authManager.refresh(authState)
                  onAuthState(refreshed)
                  if (refreshed is AuthState.SignedIn) attempt = runCatching { submit(refreshed.tokens.accessToken) }
                }
                attempt
                  .onSuccess { next ->
                    result = next
                    onClear()
                    if (next is CheckoutResult.Queued) scheduleOfflineSync(context, apiBaseUrl)
                  }
                  .onFailure { error = it.message ?: "Не удалось оформить заказ" }
                busy = false
              }
            },
            enabled = !busy && (fulfillment != "pickup" || selectedStorePointId.isNotBlank()) && (fulfillment != "courier" || address.isNotBlank()),
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag("checkout-submit"),
            colors = ButtonDefaults.buttonColors(containerColor = CheckoutLime, contentColor = CheckoutInk),
            shape = RoundedCornerShape(8.dp),
          ) { Text(if (busy) "Оформляем…" else "Оформить заказ", fontWeight = FontWeight.Bold) }
        }
      }
    }
  }
}

@Composable
private fun QuantityButton(label: String, enabled: Boolean, onClick: () -> Unit) {
  Button(onClick = onClick, enabled = enabled, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp), colors = ButtonDefaults.buttonColors(containerColor = CheckoutLine, contentColor = Color.White)) { Text(label) }
}

@Composable
private fun FulfillmentButton(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
  Button(onClick = onClick, modifier = modifier, colors = ButtonDefaults.buttonColors(containerColor = if (selected) CheckoutLime else CheckoutLine, contentColor = if (selected) CheckoutInk else Color.White), shape = RoundedCornerShape(7.dp)) { Text(label) }
}

@Composable
private fun PaymentMethodButton(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
  Button(
    onClick = onClick,
    modifier = modifier,
    colors = ButtonDefaults.buttonColors(
      containerColor = if (selected) CheckoutCoral else CheckoutLine,
      contentColor = Color.White,
    ),
    shape = RoundedCornerShape(7.dp),
  ) { Text(label, fontSize = 11.sp, maxLines = 1) }
}

@Composable
private fun CheckoutResultScreen(result: CheckoutResult, apiBaseUrl: String, modifier: Modifier, onContinue: () -> Unit) {
  val created = result as? CheckoutResult.Created
  val uriHandler = LocalUriHandler.current
  val intent = created?.paymentIntent
  Column(modifier.fillMaxSize().background(CheckoutInk).padding(24.dp), verticalArrangement = Arrangement.Center) {
    Text(if (intent != null) "Ожидает оплаты" else if (created != null) "Заказ оформлен" else "Заказ сохранён офлайн", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Black)
    Text(if (created != null) "#${created.order.id.takeLast(8)} · ${created.order.total} сом · ${created.order.status}" else "Отправим автоматически, когда появится сеть", color = CheckoutMuted, modifier = Modifier.padding(top = 8.dp))
    if (intent != null) {
      Button(
        onClick = { uriHandler.openUri(resolvePaymentUrl(apiBaseUrl, intent.paymentUrl)) },
        modifier = Modifier.fillMaxWidth().padding(top = 16.dp).testTag("payment-open"),
        colors = ButtonDefaults.buttonColors(containerColor = CheckoutCoral, contentColor = Color.White),
      ) { Text("Перейти к оплате", fontWeight = FontWeight.Bold) }
      intent.qrPayload?.let { Text(it, color = CheckoutMuted, fontSize = 10.sp, modifier = Modifier.padding(top = 8.dp)) }
    }
    if (created != null) Text("Статус оплаты и выдачи подтвердит только сервер", color = CheckoutLime, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
    Button(onClick = onContinue, modifier = Modifier.fillMaxWidth().padding(top = 18.dp), colors = ButtonDefaults.buttonColors(containerColor = CheckoutLime, contentColor = CheckoutInk)) { Text("Продолжить") }
  }
}

internal fun resolvePaymentUrl(apiBaseUrl: String, paymentUrl: String): String =
  runCatching { URL(URL(apiBaseUrl), paymentUrl).toString() }.getOrDefault(paymentUrl)

@Composable
private fun CheckoutMessage(title: String, detail: String, modifier: Modifier) {
  Column(modifier.fillMaxSize().background(CheckoutInk).padding(24.dp), verticalArrangement = Arrangement.Center) {
    Text(title, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black)
    Text(detail, color = CheckoutMuted, modifier = Modifier.padding(top = 8.dp))
  }
}

private fun scheduleOfflineSync(context: Context, apiBaseUrl: String) {
  val request = OneTimeWorkRequestBuilder<OfflineSyncWorker>()
    .setInputData(workDataOf("apiBaseUrl" to apiBaseUrl))
    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
    .build()
  WorkManager.getInstance(context).enqueueUniqueWork("alistore-offline-sync", ExistingWorkPolicy.KEEP, request)
}

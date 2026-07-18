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

private val CheckoutInk = Design3.screen
private val CheckoutSurface = Design3.surface
private val CheckoutLine = Design3.hairline
private val CheckoutMuted = Design3.textMuted
private val CheckoutCoral = Design3.orange
private val CheckoutLime = Design3.lime

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
  var deliveryZones by remember { mutableStateOf<List<DeliveryZone>>(emptyList()) }
  var selectedZoneId by rememberSaveable { mutableStateOf("") }
  var selectedSlotId by rememberSaveable { mutableStateOf("") }
  var promoInput by rememberSaveable { mutableStateOf("") }
  var appliedPromo by remember { mutableStateOf<PromotionQuote?>(null) }
  var promoBusy by remember { mutableStateOf(false) }
  var promoError by remember { mutableStateOf<String?>(null) }
  var loyaltyBalance by remember { mutableStateOf<Int?>(null) }
  var redeemLoyalty by rememberSaveable { mutableStateOf(false) }
  var idempotencyKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var paymentIdempotencyKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  var result by remember { mutableStateOf<CheckoutResult?>(null) }
  val lines = cart.mapNotNull { (id, quantity) -> products.firstOrNull { it.id == id }?.let { it to quantity.coerceAtMost(it.availableUnits) } }
  val total = lines.sumOf { (product, quantity) -> product.price * quantity }
  val selectedZone = deliveryZones.firstOrNull { it.id == selectedZoneId }
  val selectedSlot = selectedZone?.slots?.firstOrNull { it.id == selectedSlotId }
  val promoDiscount = appliedPromo?.discount ?: 0
  val loyaltyAmount = if (redeemLoyalty) loyaltyRedemption(loyaltyBalance ?: 0, total, promoDiscount) else 0
  val deliveryFee = if (fulfillment == "courier") selectedZone?.fee ?: 0 else 0
  val payable = checkoutPayableEstimate(total, promoDiscount, loyaltyAmount, deliveryFee)

  LaunchedEffect(apiBaseUrl) {
    runCatching { api.checkoutOptions() }
      .onSuccess { options ->
        pickupPoints = options.pickupPoints
        if (options.pickupPoints.none { it.id == selectedStorePointId }) selectedStorePointId = options.pickupPoints.firstOrNull()?.id.orEmpty()
        pointError = if (options.pickupPoints.isEmpty()) "Самовывоз временно недоступен" else null
        deliveryZones = options.deliveryZones
        if (options.deliveryZones.none { it.id == selectedZoneId }) {
          selectedZoneId = options.deliveryZones.firstOrNull()?.id.orEmpty()
          selectedSlotId = ""
        }
      }
      .onFailure { failure ->
        pointError = failure.message; pickupPoints = emptyList(); selectedStorePointId = ""
        deliveryZones = emptyList(); selectedZoneId = ""; selectedSlotId = ""
      }
  }

  LaunchedEffect(authState) {
    val signedIn = authState as? AuthState.SignedIn
    loyaltyBalance = null
    redeemLoyalty = false
    if (signedIn != null) {
      runCatching { api.loyalty(signedIn.tokens.accessToken) }
        .onSuccess { loyaltyBalance = it.balance }
    }
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
          if (deliveryZones.isNotEmpty()) {
            deliveryZones.forEach { zone ->
              FulfillmentButton(
                "${zone.name} · доставка ${zone.fee} сом",
                selectedZoneId == zone.id,
                Modifier.fillMaxWidth().padding(top = 8.dp).testTag("checkout-zone-${zone.id}"),
              ) { selectedZoneId = zone.id; selectedSlotId = ""; error = null }
            }
            val zoneSlots = selectedZone?.slots.orEmpty()
            if (selectedZone != null && zoneSlots.isEmpty()) {
              Text("Нет доступных слотов доставки", color = CheckoutMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
            }
            zoneSlots.forEach { slot ->
              val slotTitle = "${deliverySlotLabel(slot.startsAt, slot.endsAt)} · осталось ${slot.remaining}"
              FulfillmentButton(
                slotTitle,
                selectedSlotId == slot.id,
                Modifier.fillMaxWidth().padding(top = 8.dp).testTag("checkout-slot-${slot.id}"),
              ) { if (slot.available) { selectedSlotId = slot.id; error = null } }
            }
          }
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
        Text("Промокод и бонусы", color = Color.White, fontWeight = FontWeight.Bold)
        val applied = appliedPromo
        if (applied == null) {
          Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
              value = promoInput,
              onValueChange = { promoInput = it; promoError = null },
              label = { Text("Промокод") },
              singleLine = true,
              modifier = Modifier.weight(1f).testTag("checkout-promo-input"),
              colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                focusedBorderColor = CheckoutLime, unfocusedBorderColor = CheckoutLine,
                focusedLabelColor = CheckoutLime, unfocusedLabelColor = CheckoutMuted,
              ),
            )
            Button(
              onClick = {
                val code = promoInput.trim()
                if (code.isEmpty()) return@Button
                scope.launch {
                  promoBusy = true
                  promoError = null
                  runCatching {
                    api.quotePromotion(
                      PromotionQuoteRequest(code, lines.map { (product, quantity) -> PromotionQuoteItem(product.sku, quantity) }),
                      (authState as? AuthState.SignedIn)?.tokens?.accessToken,
                    )
                  }
                    .onSuccess { quote -> appliedPromo = quote; promoInput = quote.code }
                    .onFailure { failure -> appliedPromo = null; promoError = failure.message ?: "Промокод не применён" }
                  promoBusy = false
                }
              },
              enabled = !promoBusy && promoInput.isNotBlank(),
              modifier = Modifier.padding(top = 6.dp).testTag("checkout-promo-apply"),
              colors = ButtonDefaults.buttonColors(containerColor = CheckoutLine, contentColor = Color.White),
              shape = RoundedCornerShape(8.dp),
            ) { Text(if (promoBusy) "…" else "ОК") }
          }
          if (!promoError.isNullOrBlank()) Text(promoError!!, color = CheckoutCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        } else {
          Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${applied.code} · −${applied.discount} сом", color = CheckoutLime, fontSize = 13.sp, modifier = Modifier.weight(1f).testTag("checkout-promo-applied"))
            Button(
              onClick = { appliedPromo = null; promoInput = ""; promoError = null },
              colors = ButtonDefaults.buttonColors(containerColor = CheckoutLine, contentColor = Color.White),
              shape = RoundedCornerShape(8.dp),
            ) { Text("Убрать") }
          }
        }
        val balance = loyaltyBalance
        if (authState is AuthState.SignedIn && balance != null && balance > 0) {
          FulfillmentButton(
            "Списать бонусы (доступно $balance)",
            redeemLoyalty,
            Modifier.fillMaxWidth().padding(top = 10.dp).testTag("checkout-loyalty-toggle"),
          ) { redeemLoyalty = !redeemLoyalty }
          if (redeemLoyalty && loyaltyAmount > 0) {
            Text("Будет списано $loyaltyAmount сом", color = CheckoutMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
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
        if (promoDiscount > 0 || loyaltyAmount > 0 || deliveryFee > 0) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Товары", color = CheckoutMuted, fontSize = 13.sp)
            Text("$total сом", color = Color.White, fontSize = 13.sp)
          }
          if (promoDiscount > 0) Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Промокод ${appliedPromo?.code.orEmpty()}", color = CheckoutMuted, fontSize = 13.sp)
            Text("−$promoDiscount сом", color = CheckoutLime, fontSize = 13.sp)
          }
          if (loyaltyAmount > 0) Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Бонусы", color = CheckoutMuted, fontSize = 13.sp)
            Text("−$loyaltyAmount сом", color = CheckoutLime, fontSize = 13.sp)
          }
          if (deliveryFee > 0) Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Доставка", color = CheckoutMuted, fontSize = 13.sp)
            Text("$deliveryFee сом", color = Color.White, fontSize = 13.sp)
          }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
          Text("Итого", color = CheckoutMuted)
          Text("$payable сом", color = CheckoutLime, fontSize = 20.sp, fontWeight = FontWeight.Black, modifier = Modifier.testTag("checkout-total"))
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
                  total = payable,
                  items = lines.map { (product, quantity) -> CreateOrderItem(product.sku, quantity, product.price) },
                  paymentMode = resolvePaymentMode(paymentMethod, fulfillment),
                  deliverySlot = when {
                    fulfillment == "courier" -> selectedSlot?.let { deliverySlotLabel(it.startsAt, it.endsAt) }
                    else -> pickupPoints.firstOrNull { it.id == selectedStorePointId }?.hours
                  },
                  deliveryZoneId = if (fulfillment == "courier") selectedZone?.id else null,
                  deliverySlotId = if (fulfillment == "courier") selectedSlot?.id else null,
                  promoCode = appliedPromo?.code,
                  loyaltyPoints = loyaltyAmount.takeIf { it > 0 },
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
            enabled = !busy &&
              (fulfillment != "pickup" || selectedStorePointId.isNotBlank()) &&
              (fulfillment != "courier" || (address.isNotBlank() && (deliveryZones.isEmpty() || selectedSlot != null))),
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

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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

interface CustomerOrdersGateway {
  suspend fun orders(token: String): List<CustomerOrder>
}

private val OrdersInk = Color(0xFF16130F)
private val OrdersSurface = Color(0xFF221E19)
private val OrdersMuted = Color(0xFFA79C92)
private val OrdersCoral = Color(0xFFFF6B57)
private val OrdersLime = Color(0xFFC8F04B)

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
) {
  val gateway = remember(apiBaseUrl, providedGateway) { providedGateway ?: ApiClient(apiBaseUrl) }
  var orders by remember { mutableStateOf<List<CustomerOrder>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var manualRefresh by remember { mutableStateOf(0) }

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
      .onSuccess { orders = it; error = null }
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
        }
      }
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

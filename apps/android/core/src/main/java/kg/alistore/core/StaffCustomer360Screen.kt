package kg.alistore.core

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

private val warrantyRoles = setOf("warehouse", "admin", "owner")
private val supportRoles = setOf("admin", "owner")

internal fun nextWarrantyStatus(status: String): String? = when (status) {
  "created" -> "received"
  "received" -> "diagnostics"
  "diagnostics" -> "approved"
  "waiting_supplier" -> "approved"
  "approved" -> "repaired"
  "repaired", "rejected", "replaced" -> "closed"
  else -> null
}

internal fun nextSupportStatuses(status: String): List<String> = when (status) {
  "new" -> listOf("in_progress", "closed")
  "in_progress" -> listOf("waiting", "resolved")
  "waiting" -> listOf("in_progress", "resolved")
  "resolved" -> listOf("closed", "in_progress")
  else -> emptyList()
}

@Composable
fun StaffCustomer360Screen(
  session: StaffSession,
  gateway: StaffCustomerGateway,
  modifier: Modifier = Modifier,
) {
  var customerId by rememberSaveable { mutableStateOf("") }
  var requestedId by rememberSaveable { mutableStateOf<String?>(null) }
  var overview by remember { mutableStateOf<Customer360?>(null) }
  var loading by remember { mutableStateOf(false) }
  var busyId by remember { mutableStateOf<String?>(null) }
  var error by remember { mutableStateOf<String?>(null) }
  var revision by remember { mutableStateOf(0) }
  val scope = rememberCoroutineScope()
  val focus = LocalFocusManager.current
  val keyboard = LocalSoftwareKeyboardController.current

  LaunchedEffect(requestedId, revision) {
    val id = requestedId ?: return@LaunchedEffect
    loading = true
    runCatching { gateway.customerOverview(id, session.accessToken) }
      .onSuccess { overview = it; error = null }
      .onFailure { overview = null; error = it.message ?: "Не удалось загрузить клиента" }
    loading = false
  }

  LazyColumn(
    modifier.fillMaxSize().background(StaffInk),
    contentPadding = PaddingValues(18.dp, 18.dp, 18.dp, 28.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    item {
      Text("Customer 360", color = androidx.compose.ui.graphics.Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black,
        modifier = Modifier.testTag("staff-customer-title"))
      Text("Заказы, долг, гарантия и обращения", color = StaffMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp, bottom = 12.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
          value = customerId,
          onValueChange = { customerId = it.trim() },
          label = { Text("ID клиента") },
          singleLine = true,
          keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
          keyboardActions = KeyboardActions(onSearch = {
            if (customerId.isNotBlank()) { keyboard?.hide(); focus.clearFocus(); requestedId = customerId }
          }),
          modifier = Modifier.weight(1f).testTag("staff-customer-id"),
        )
        Button(
          onClick = { keyboard?.hide(); focus.clearFocus(); requestedId = customerId },
          enabled = customerId.isNotBlank() && !loading,
          colors = ButtonDefaults.buttonColors(containerColor = StaffLime, contentColor = StaffInk),
          modifier = Modifier.padding(start = 8.dp).height(56.dp).testTag("staff-customer-load"),
        ) { Text("Найти", fontWeight = FontWeight.Bold) }
      }
    }

    if (loading) item { Box(Modifier.fillMaxWidth().height(150.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = StaffLime) } }
    error?.let { message -> item { StaffError(message) { revision += 1 } } }
    val data = overview
    if (!loading && requestedId == null) item { StaffEmpty("Найдите клиента", "Введите ID из заказа или сканера") }
    if (!loading && data != null) {
      item { CustomerProfileCard(data) }
      item { StaffSectionTitle("Последние заказы") }
      if (data.orders.recent.isEmpty()) item { StaffInlineEmpty("Заказов пока нет") }
      items(data.orders.recent, key = Customer360Order::id) { order ->
        StaffDataCard("#${order.id.takeLast(8)} · ${order.status}", "${order.total} сом · ${order.createdAt.take(10)}")
      }
      item { StaffSectionTitle("Гарантия") }
      if (data.warranties.items.isEmpty()) item { StaffInlineEmpty("Открытых гарантийных случаев нет") }
      items(data.warranties.items, key = Customer360Warranty::id) { warranty ->
        val next = nextWarrantyStatus(warranty.status)
        StaffActionCard(
          title = "IMEI ${warranty.imei}",
          detail = "${warranty.status} · SLA ${warranty.sla.take(10)}",
          permission = session.role in warrantyRoles,
          permissionText = "Переходы доступны складу и администратору",
          actions = next?.let { listOf("Перевести: $it" to it) }.orEmpty(),
          busy = busyId == warranty.id,
          tag = "staff-warranty-${warranty.id}",
        ) { to ->
          busyId = warranty.id
          scope.launch {
            runCatching { gateway.transitionWarranty(warranty.id, to, session.accessToken) }
              .onSuccess { revision += 1 }.onFailure { error = it.message }
            busyId = null
          }
        }
      }
      item { StaffSectionTitle("Поддержка") }
      if (data.tickets.items.isEmpty()) item { StaffInlineEmpty("Открытых обращений нет") }
      items(data.tickets.items, key = Customer360Ticket::id) { ticket ->
        val actions = buildList {
          nextSupportStatuses(ticket.status).forEach { add("Статус: $it" to "transition:$it") }
          if (ticket.priority != "urgent" && ticket.status != "closed") add("Повысить приоритет" to "escalate")
        }
        StaffActionCard(
          title = ticket.subject,
          detail = "${ticket.status} · ${ticket.priority} · SLA ${ticket.sla.take(10)}",
          permission = session.role in supportRoles,
          permissionText = "Действия поддержки доступны администратору",
          actions = actions,
          busy = busyId == ticket.id,
          tag = "staff-ticket-${ticket.id}",
        ) { action ->
          busyId = ticket.id
          scope.launch {
            runCatching {
              if (action == "escalate") gateway.escalateSupport(ticket.id, session.accessToken)
              else gateway.transitionSupport(ticket.id, action.removePrefix("transition:"), session.accessToken)
            }.onSuccess { revision += 1 }.onFailure { error = it.message }
            busyId = null
          }
        }
      }
    }
  }
}

@Composable
private fun CustomerProfileCard(data: Customer360) {
  Card(colors = CardDefaults.cardColors(containerColor = StaffSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().testTag("staff-customer-profile")) {
    Column(Modifier.padding(16.dp)) {
      Text(data.customer.name, color = androidx.compose.ui.graphics.Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
      Text(data.customer.phone, color = StaffMuted, modifier = Modifier.padding(top = 2.dp))
      Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        StaffMetric("LTV", data.customer.ltv)
        StaffMetric("Покупки", data.orders.spent)
        StaffMetric("Долг", data.debts.openBalance)
      }
      Text("${data.orders.total} заказов · ${data.warranties.open} гарантий · ${data.tickets.open} обращений", color = StaffMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp))
      if (data.customer.segments.isNotEmpty()) Text(data.customer.segments.joinToString(" · "), color = StaffLime, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
    }
  }
}

@Composable private fun StaffMetric(label: String, value: Int) = Column {
  Text("$value", color = StaffLime, fontWeight = FontWeight.Black, fontSize = 16.sp)
  Text(label, color = StaffMuted, fontSize = 10.sp)
}

@Composable private fun StaffSectionTitle(title: String) = Text(title, color = androidx.compose.ui.graphics.Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))

@Composable private fun StaffInlineEmpty(text: String) = Text(text, color = StaffMuted, modifier = Modifier.fillMaxWidth().background(StaffSurface, RoundedCornerShape(8.dp)).padding(16.dp))

@Composable private fun StaffDataCard(title: String, detail: String) {
  Card(colors = CardDefaults.cardColors(containerColor = StaffSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
    Column(Modifier.padding(14.dp)) { Text(title, color = androidx.compose.ui.graphics.Color.White, fontWeight = FontWeight.Bold); Text(detail, color = StaffMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp)) }
  }
}

@Composable
private fun StaffActionCard(
  title: String,
  detail: String,
  permission: Boolean,
  permissionText: String,
  actions: List<Pair<String, String>>,
  busy: Boolean,
  tag: String,
  onAction: (String) -> Unit,
) {
  Card(colors = CardDefaults.cardColors(containerColor = StaffSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().testTag(tag)) {
    Column(Modifier.padding(14.dp)) {
      Text(title, color = androidx.compose.ui.graphics.Color.White, fontWeight = FontWeight.Bold)
      Text(detail, color = StaffMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp))
      if (!permission && actions.isNotEmpty()) Text(permissionText, color = StaffMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 10.dp).testTag("$tag-permission"))
      if (permission) actions.forEachIndexed { index, (label, value) ->
        if (index == 0) Button(
          onClick = { onAction(value) }, enabled = !busy,
          colors = ButtonDefaults.buttonColors(containerColor = StaffCoral),
          modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("$tag-action-$index"),
        ) { Text(if (busy) "Выполняется..." else label) }
        else OutlinedButton(
          onClick = { onAction(value) }, enabled = !busy,
          modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("$tag-action-$index"),
        ) { Text(label) }
      }
    }
  }
}

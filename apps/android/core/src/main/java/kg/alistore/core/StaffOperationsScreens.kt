package kg.alistore.core

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

internal val StaffInk = Color(0xFF151515)
internal val StaffSurface = Color(0xFF222222)
internal val StaffLine = Color(0xFF373737)
internal val StaffMuted = Color(0xFFA7A7A7)
internal val StaffCoral = Color(0xFFFF5B2E)
internal val StaffLime = Color(0xFFC6FF3D)

private data class StaffTab(val label: String, val icon: ImageVector)

@Composable
fun StaffApp(
  apiBaseUrl: String,
  deepLinkUrl: String? = null,
  deepLinkRevision: Long = 0,
  pushRegistrar: StaffPushRegistrar? = null,
) {
  val context = LocalContext.current.applicationContext
  val api = remember(apiBaseUrl) { ApiClient(apiBaseUrl) }
  val manager = remember(apiBaseUrl) {
    StaffSessionManager(api, SecureTokenStore(context, "alistore-staff-session"))
  }
  val quickUnlock = remember { QuickUnlockStore(context, "staff") }
  var state by remember { mutableStateOf<StaffAuthState>(StaffAuthState.Restoring) }
  LaunchedEffect(manager) { state = manager.restore() }
  val logout: () -> Unit = { quickUnlock.clear(); state = manager.logout() }

  Design3Theme {
    when (val current = state) {
      StaffAuthState.Restoring -> StaffLoading()
      StaffAuthState.SignedOut -> StaffLoginScreen(manager) { state = it }
      is StaffAuthState.Failed -> StaffLoginScreen(manager, current.message) { state = it }
      is StaffAuthState.SignedIn -> if (manager.requiresQuickUnlock) {
        QuickUnlockGate("AliStore Staff", current.session.username, quickUnlock, manager::unlock, logout) {
          StaffSignedInScreen(current.session, api, api, api, api, deepLinkUrl, deepLinkRevision, pushRegistrar, logout, apiBaseUrl)
        }
      } else StaffSignedInScreen(current.session, api, api, api, api, deepLinkUrl, deepLinkRevision, pushRegistrar, logout, apiBaseUrl)
    }
  }
}

@Composable
fun StaffLoginScreen(
  manager: StaffSessionManager,
  initialError: String? = null,
  onState: (StaffAuthState) -> Unit,
) {
  var username by rememberSaveable { mutableStateOf("") }
  var password by rememberSaveable { mutableStateOf("") }
  var error by remember { mutableStateOf(initialError) }
  var busy by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  Column(
    Modifier.fillMaxSize().background(StaffInk).statusBarsPadding().padding(24.dp),
    verticalArrangement = Arrangement.Center,
  ) {
    Box(Modifier.size(48.dp).background(StaffCoral, CircleShape), contentAlignment = Alignment.Center) {
      Text("A", color = Color.White, fontWeight = FontWeight.Black, fontSize = 22.sp)
    }
    Text("AliStore Staff", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 18.dp))
    Text("Рабочее место сотрудника", color = StaffMuted, modifier = Modifier.padding(top = 4.dp, bottom = 24.dp))
    OutlinedTextField(
      username, { username = it }, label = { Text("Логин") }, singleLine = true,
      modifier = Modifier.fillMaxWidth().testTag("staff-username"),
    )
    OutlinedTextField(
      password, { password = it }, label = { Text("Пароль") }, singleLine = true,
      visualTransformation = PasswordVisualTransformation(),
      modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("staff-password"),
    )
    error?.let { Text(it, color = StaffCoral, modifier = Modifier.padding(top = 12.dp).testTag("staff-login-error")) }
    Button(
      onClick = {
        busy = true
        error = null
        scope.launch {
          when (val result = manager.login(username, password)) {
            is StaffAuthState.SignedIn -> onState(result)
            is StaffAuthState.Failed -> error = result.message
            else -> Unit
          }
          busy = false
        }
      },
      enabled = !busy && username.isNotBlank() && password.isNotBlank(),
      colors = ButtonDefaults.buttonColors(containerColor = StaffLime, contentColor = StaffInk),
      modifier = Modifier.fillMaxWidth().padding(top = 18.dp).height(50.dp).testTag("staff-login"),
    ) { if (busy) CircularProgressIndicator(Modifier.size(20.dp)) else Text("Войти", fontWeight = FontWeight.Bold) }
  }
}

@Composable
fun StaffSignedInScreen(
  session: StaffSession,
  gateway: StaffOperationsGateway,
  evidenceGateway: StaffEvidenceGateway,
  customerGateway: StaffCustomerGateway,
  taskGateway: StaffTaskGateway,
  deepLinkUrl: String? = null,
  deepLinkRevision: Long = 0,
  pushRegistrar: StaffPushRegistrar? = null,
  onLogout: () -> Unit,
  apiBaseUrl: String = "",
) {
  var selected by rememberSaveable { mutableStateOf(0) }
  var routedCustomerId by rememberSaveable { mutableStateOf<String?>(null) }
  val tabs = listOf(
    StaffTab("Главная", Icons.Default.Home),
    StaffTab("Заказы", Icons.Default.ShoppingCart),
    StaffTab("Задачи", Icons.Default.CheckCircle),
    StaffTab("Сканер", Icons.Default.Search),
    StaffTab("Смена", Icons.Default.AccountCircle),
  )
  LaunchedEffect(session.accessToken, pushRegistrar) {
    if (pushRegistrar != null) runCatching { pushRegistrar.register(session) }
  }
  LaunchedEffect(deepLinkUrl, deepLinkRevision) {
    parseStaffPushRoute(deepLinkUrl)?.let { route ->
      selected = route.tab
      routedCustomerId = route.customerId
    }
  }
  Scaffold(
    containerColor = StaffInk,
    contentWindowInsets = WindowInsets(0, 0, 0, 0),
    bottomBar = {
      NavigationBar(containerColor = StaffSurface) {
        tabs.forEachIndexed { index, tab ->
          NavigationBarItem(
            selected = selected == index,
            onClick = { selected = index },
            icon = { Icon(tab.icon, tab.label, Modifier.size(21.dp)) },
            label = { Text(tab.label, fontSize = 9.sp) },
            modifier = Modifier.testTag("staff-tab-$index"),
          )
        }
      }
    },
  ) { padding ->
    when (selected) {
      0 -> StaffHome(session, Modifier.padding(padding)) { selected = it }
      1 -> StaffOrdersScreen(session, gateway, Modifier.padding(padding))
      2 -> StaffTasksScreen(session, taskGateway, Modifier.padding(padding))
      3 -> StaffScannerScreen(session, evidenceGateway, Modifier.padding(padding))
      4 -> StaffShiftScreen(session, gateway, onLogout, Modifier.padding(padding), apiBaseUrl = apiBaseUrl)
      5 -> StaffCustomer360Screen(session, customerGateway, Modifier.padding(padding), routedCustomerId)
      else -> StaffSupportScreen(session, customerGateway, Modifier.padding(padding))
    }
  }
}

@Composable
private fun StaffHome(session: StaffSession, modifier: Modifier, onTab: (Int) -> Unit) {
  LazyColumn(modifier.fillMaxSize().background(StaffInk).statusBarsPadding(), contentPadding = PaddingValues(18.dp)) {
    item {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
          Text("Рабочий день", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Black, modifier = Modifier.testTag("staff-home-title"))
          Text("Добро пожаловать, ${session.username}", color = StaffMuted, fontSize = 13.sp)
        }
        Text(session.role.uppercase(), color = StaffInk, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.background(StaffLime, RoundedCornerShape(6.dp)).padding(9.dp, 6.dp))
      }
      Spacer(Modifier.height(22.dp))
    }
    item {
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        StaffMetric("Заказы", "Сегодня", StaffCoral, Modifier.weight(1f))
        StaffMetric("Смена", if (session.totpEnabled) "2FA OK" else "Проверьте 2FA", StaffLime, Modifier.weight(1f), StaffInk)
      }
      Spacer(Modifier.height(16.dp))
    }
    item { StaffShortcut("Очередь заказов", "Комплектация и выдача", StaffCoral) { onTab(1) } }
    item { StaffShortcut("Задачи и KPI", "Назначения на сегодня", StaffLime, StaffInk) { onTab(2) } }
    item { StaffShortcut("Customer 360", "Покупки, гарантия и поддержка", Color(0xFF82B1FF)) { onTab(5) } }
    if (session.role in supportRoles) item { StaffShortcut("Поддержка", "Очередь обращений и SLA", Color(0xFFFFB26B)) { onTab(6) } }
    item { StaffShortcut("Сканер", "EAN, QR и IMEI", StaffCoral) { onTab(3) } }
    item { StaffShortcut("Кассовая смена", "Открытие и сверка", Color(0xFFFFD166), StaffInk) { onTab(4) } }
    item {
      Text(
        if (session.totpEnabled) "2FA включена для опасных операций" else "Включите 2FA перед approval-операциями",
        color = StaffMuted,
        fontSize = 12.sp,
        modifier = Modifier.padding(top = 18.dp),
      )
    }
  }
}

@Composable
private fun StaffMetric(title: String, value: String, color: Color, modifier: Modifier, content: Color = Color.White) {
  Card(colors = CardDefaults.cardColors(containerColor = color), shape = RoundedCornerShape(8.dp), modifier = modifier) {
    Column(Modifier.padding(14.dp)) {
      Text(title, color = content.copy(alpha = .7f), fontSize = 11.sp)
      Text(value, color = content, fontSize = 15.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 6.dp))
    }
  }
}

@Composable
private fun StaffShortcut(title: String, detail: String, color: Color, content: Color = Color.White, onClick: () -> Unit) {
  Card(
    onClick = onClick,
    colors = CardDefaults.cardColors(containerColor = color),
    shape = RoundedCornerShape(8.dp),
    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
  ) {
    Column(Modifier.padding(18.dp)) {
      Text(title, color = content, fontSize = 18.sp, fontWeight = FontWeight.Black)
      Text(detail, color = content.copy(alpha = .75f), fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp))
    }
  }
}

private data class OrderAction(val label: String, val to: String? = null, val fulfill: Boolean = false)

private fun CustomerOrder.action(): OrderAction? = when (status) {
  "created" -> OrderAction("Зарезервировать IMEI", fulfill = true)
  "paid" -> OrderAction("Начать комплектацию", "picking")
  "picking" -> OrderAction("Упаковано", "packed")
  "packed" -> if (fulfillmentType == "courier") OrderAction("Передать курьеру", "courier_assigned") else OrderAction("Готов к выдаче", "ready_for_pickup")
  "ready_for_pickup" -> OrderAction("Выдать заказ", "completed")
  else -> null
}

@Composable
fun StaffOrdersScreen(session: StaffSession, gateway: StaffOperationsGateway, modifier: Modifier = Modifier) {
  val statuses = staffOrderStatuses
  val labels = staffOrderStatusLabels
  var status by rememberSaveable { mutableStateOf("created") }
  var orders by remember { mutableStateOf<List<CustomerOrder>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var busyId by remember { mutableStateOf<String?>(null) }
  var revision by remember { mutableStateOf(0) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(status, revision) {
    loading = true
    runCatching { gateway.staffOrders(status, session.accessToken) }
      .onSuccess { orders = it; error = null }
      .onFailure { error = it.message ?: "Не удалось загрузить очередь" }
    loading = false
  }

  Column(modifier.fillMaxSize().background(StaffInk).statusBarsPadding()) {
    Text("Заказы", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(18.dp, 18.dp, 18.dp, 10.dp).testTag("staff-orders-title"))
    LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      items(statuses) { item ->
        if (item == status) Button(onClick = {}, colors = ButtonDefaults.buttonColors(containerColor = StaffCoral), shape = RoundedCornerShape(6.dp)) { Text(labels[item].orEmpty()) }
        else OutlinedButton(onClick = { status = item }, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("staff-status-$item")) { Text(labels[item].orEmpty()) }
      }
    }
    when {
      loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = StaffLime) }
      error != null -> StaffError(error.orEmpty()) { revision += 1 }
      orders.isEmpty() -> StaffEmpty("Очередь пуста", "Новых операций в этом статусе нет")
      else -> LazyColumn(contentPadding = PaddingValues(14.dp, 14.dp, 14.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(orders, key = CustomerOrder::id) { order ->
          val action = order.action()
          Card(
            colors = CardDefaults.cardColors(containerColor = StaffSurface),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth().testTag("staff-order-${order.id}"),
          ) {
            Column(Modifier.padding(16.dp)) {
              Row {
                Text("#${order.id.takeLast(8)}", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("${order.total} сом", color = StaffLime, fontWeight = FontWeight.Bold)
              }
              Text("${order.items.sumOf(CustomerOrderItem::qty)} тов. · ${order.fulfillmentType}", color = StaffMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
              action?.let {
                Button(
                  onClick = {
                    busyId = order.id
                    error = null
                    scope.launch {
                      runCatching {
                        if (it.fulfill) gateway.fulfillOrder(order.id, session.accessToken)
                        else gateway.transitionOrder(order.id, it.to!!, session.accessToken)
                      }.onSuccess { revision += 1 }.onFailure { failure -> error = failure.message }
                      busyId = null
                    }
                  },
                  enabled = busyId == null,
                  colors = ButtonDefaults.buttonColors(containerColor = StaffCoral),
                  modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag("staff-order-action-${order.id}"),
                ) { Text(if (busyId == order.id) "Выполняется..." else it.label) }
              }
            }
          }
        }
      }
    }
  }
}

@Composable
fun StaffSupportScreen(session: StaffSession, gateway: StaffCustomerGateway, modifier: Modifier = Modifier) {
  var status by rememberSaveable { mutableStateOf("new") }
  var tickets by remember { mutableStateOf<List<SupportTicket>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var busyId by remember { mutableStateOf<String?>(null) }
  var revision by remember { mutableStateOf(0) }
  val scope = rememberCoroutineScope()
  val canAct = session.role in supportRoles

  LaunchedEffect(status, revision) {
    loading = true
    runCatching { gateway.supportTickets(status, session.accessToken) }
      .onSuccess { tickets = it; error = null }
      .onFailure { error = it.message ?: "Не удалось загрузить обращения" }
    loading = false
  }

  fun act(ticketId: String, block: suspend () -> SupportTicket) {
    busyId = ticketId
    error = null
    scope.launch {
      runCatching { block() }
        .onSuccess { revision += 1 }
        .onFailure { failure -> error = failure.message }
      busyId = null
    }
  }

  Column(modifier.fillMaxSize().background(StaffInk).statusBarsPadding()) {
    Text("Поддержка", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(18.dp, 18.dp, 18.dp, 10.dp).testTag("staff-support-title"))
    LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      items(staffSupportStatuses) { (wire, label) ->
        if (wire == status) Button(onClick = {}, colors = ButtonDefaults.buttonColors(containerColor = StaffCoral), shape = RoundedCornerShape(6.dp)) { Text(label) }
        else OutlinedButton(onClick = { status = wire }, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("staff-support-status-$wire")) { Text(label) }
      }
    }
    when {
      loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = StaffLime) }
      error != null -> StaffError(error.orEmpty()) { revision += 1 }
      tickets.isEmpty() -> StaffEmpty("Нет обращений", "В выбранной очереди сейчас пусто")
      else -> LazyColumn(contentPadding = PaddingValues(14.dp, 14.dp, 14.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(tickets, key = SupportTicket::id) { ticket ->
          Card(
            colors = CardDefaults.cardColors(containerColor = StaffSurface),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth().testTag("staff-support-${ticket.id}"),
          ) {
            Column(Modifier.padding(16.dp)) {
              Row {
                Text(ticket.subject, color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(
                  ticket.priority,
                  color = if (ticket.priority == "urgent") StaffCoral else if (ticket.priority == "high") Color(0xFFFFD166) else StaffMuted,
                  fontSize = 11.sp,
                )
              }
              Text("Клиент ${ticket.customerId} · ${ticket.channel}", color = StaffMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
              ticket.body?.takeIf(String::isNotBlank)?.let { Text(it, color = StaffMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp)) }
              Text("SLA ${ticket.sla.take(10)}", color = StaffMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 5.dp))
              if (canAct) {
                val transitions = nextSupportStatuses(ticket.status)
                if (transitions.isNotEmpty()) {
                  Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    transitions.forEach { to ->
                      OutlinedButton(
                        onClick = { act(ticket.id) { gateway.transitionSupport(ticket.id, to, session.accessToken) } },
                        enabled = busyId == null,
                        modifier = Modifier.weight(1f).testTag("staff-support-transition-${ticket.id}-$to"),
                      ) { Text(supportTransitionLabel(to), fontSize = 11.sp) }
                    }
                  }
                }
                if (canEscalateSupportTicket(ticket.status, ticket.priority)) {
                  OutlinedButton(
                    onClick = { act(ticket.id) { gateway.escalateSupport(ticket.id, session.accessToken) } },
                    enabled = busyId == null,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("staff-support-escalate-${ticket.id}"),
                  ) { Text(if (busyId == ticket.id) "Выполняется..." else "Эскалировать") }
                }
              } else {
                Text("Действия поддержки доступны администратору", color = StaffMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 12.dp))
              }
            }
          }
        }
      }
    }
  }
}

@Composable
fun StaffShiftScreen(
  session: StaffSession,
  gateway: StaffOperationsGateway,
  onLogout: () -> Unit,
  modifier: Modifier = Modifier,
  onShiftChanged: (CashShift?) -> Unit = {},
  apiBaseUrl: String = "",
) {
  val context = LocalContext.current.applicationContext
  val attendanceQueue = remember { OfflineQueueDb(context, STAFF_QUEUE_DB) }
  val attendanceManager = remember(gateway, attendanceQueue) { StaffAttendanceManager(gateway, attendanceQueue) }
  var shift by remember { mutableStateOf<CashShift?>(null) }
  var hrWeek by remember { mutableStateOf<StaffHrWeek?>(null) }
  var hrLoading by remember { mutableStateOf(true) }
  var hrError by remember { mutableStateOf<String?>(null) }
  var attendanceBusy by remember { mutableStateOf(false) }
  var checkInKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var checkOutKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var queueRevision by remember { mutableStateOf(0) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var point by rememberSaveable { mutableStateOf("BISHKEK-1") }
  var openCash by rememberSaveable { mutableStateOf("5000") }
  var closeCash by rememberSaveable { mutableStateOf("") }
  var reason by rememberSaveable { mutableStateOf("") }
  var openKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var closeKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var busy by remember { mutableStateOf(false) }
  var revision by remember { mutableStateOf(0) }
  val scope = rememberCoroutineScope()
  LaunchedEffect(revision) {
    loading = true
    runCatching { gateway.currentShift(session.accessToken) }
      .onSuccess {
        shift = it
        onShiftChanged(it)
        error = null
        if (it != null && closeCash.isBlank()) closeCash = it.expectedCash.toString()
      }
      .onFailure { error = it.message ?: "Не удалось загрузить смену" }
    loading = false
  }
  LaunchedEffect(revision, queueRevision) {
    hrLoading = true
    runCatching { gateway.staffHrWeek(currentWeekStart(), session.accessToken) }
      .onSuccess { hrWeek = it; hrError = null }
      .onFailure { hrError = it.message ?: "Не удалось загрузить график" }
    hrLoading = false
  }
  val hrPending = remember(queueRevision) { attendanceQueue.pending(includeConflicts = true) }
    .filter { it.endpoint.startsWith("hr/me/attendance/") }
  val schedule = hrWeek?.schedules?.firstOrNull { it.shiftDate.take(10) == LocalDate.now().toString() }
  LazyColumn(modifier.fillMaxSize().background(StaffInk).statusBarsPadding(), contentPadding = PaddingValues(18.dp)) {
    item {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Смена", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f).testTag("staff-shift-title"))
        TextButton(onClick = onLogout, modifier = Modifier.testTag("staff-logout")) { Text("Выйти", color = StaffCoral) }
      }
    }
    item {
      Text("Рабочее время", color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 20.dp, bottom = 8.dp))
      when {
        hrLoading -> Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = StaffLime) }
        schedule == null -> Card(colors = CardDefaults.cardColors(containerColor = StaffSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
          Text("Нет запланированной смены", color = StaffMuted, modifier = Modifier.padding(16.dp).testTag("attendance-empty"))
        }
        else -> Card(colors = CardDefaults.cardColors(containerColor = StaffSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
          Column(Modifier.padding(16.dp)) {
            Text(schedule.point, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
            Text("${formatHrTime(schedule.startsAt)} – ${formatHrTime(schedule.endsAt)}", color = StaffMuted, modifier = Modifier.padding(top = 4.dp))
            when {
              schedule.cancelledAt != null -> Text("Смена отменена", color = StaffCoral, modifier = Modifier.padding(top = 12.dp))
              schedule.attendance?.checkedOutAt != null -> Text("Смена завершена в ${formatHrTime(schedule.attendance.checkedOutAt)}", color = StaffLime, modifier = Modifier.padding(top = 12.dp).testTag("attendance-closed"))
              schedule.attendance != null -> Button(
                onClick = {
                  attendanceBusy = true; hrError = null
                  scope.launch {
                    runCatching { attendanceManager.close(schedule.id, session.accessToken, checkOutKey) }
                      .onSuccess {
                        checkOutKey = UUID.randomUUID().toString()
                        if (it is StaffAttendanceResult.Queued && apiBaseUrl.isNotBlank()) scheduleStaffSync(context, apiBaseUrl)
                        queueRevision += 1; revision += 1
                      }
                      .onFailure { hrError = it.message }
                    attendanceBusy = false
                  }
                },
                enabled = !attendanceBusy,
                colors = ButtonDefaults.buttonColors(containerColor = StaffCoral),
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag("attendance-close"),
              ) { Text(if (attendanceBusy) "Сохраняем..." else "Завершить рабочую смену") }
              else -> Button(
                onClick = {
                  attendanceBusy = true; hrError = null
                  scope.launch {
                    runCatching { attendanceManager.open(schedule.id, session.accessToken, checkInKey) }
                      .onSuccess {
                        checkInKey = UUID.randomUUID().toString()
                        if (it is StaffAttendanceResult.Queued && apiBaseUrl.isNotBlank()) scheduleStaffSync(context, apiBaseUrl)
                        queueRevision += 1; revision += 1
                      }
                      .onFailure { hrError = it.message }
                    attendanceBusy = false
                  }
                },
                enabled = !attendanceBusy,
                colors = ButtonDefaults.buttonColors(containerColor = StaffLime, contentColor = StaffInk),
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag("attendance-open"),
              ) { Text(if (attendanceBusy) "Сохраняем..." else "Начать рабочую смену", fontWeight = FontWeight.Bold) }
            }
          }
        }
      }
      hrError?.let { Text(it, color = StaffCoral, modifier = Modifier.padding(top = 10.dp).testTag("attendance-error")) }
      if (hrPending.isNotEmpty()) {
        Text("Офлайн-очередь: ${hrPending.size}", color = Color.White, modifier = Modifier.padding(top = 12.dp).testTag("attendance-queue"))
        hrPending.forEach { mutation ->
          Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(attendanceQueueLabel(mutation.state), color = StaffMuted, modifier = Modifier.weight(1f))
            if (mutation.state == "failed" || mutation.state == "conflict") TextButton(onClick = {
              attendanceQueue.retry(mutation.id)
              if (apiBaseUrl.isNotBlank()) scheduleStaffSync(context, apiBaseUrl)
              queueRevision += 1
            }) { Text("Повторить", color = StaffLime) }
          }
        }
      }
    }
    if (loading) item { Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = StaffLime) } }
    error?.let { message -> item { StaffError(message) { revision += 1 } } }
    if (!loading && shift == null) {
      item {
        Text("Открытие кассы", color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 20.dp, bottom = 8.dp))
        OutlinedTextField(point, { point = it }, label = { Text("Точка") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("shift-point"))
        OutlinedTextField(openCash, { openCash = it.filter(Char::isDigit) }, label = { Text("Наличные в кассе") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("shift-open-cash"))
        Button(
          onClick = {
            busy = true; error = null
            scope.launch {
              runCatching { gateway.openShift(OpenShiftRequest(session.staffId, point.trim(), openCash.toInt()), session.accessToken, openKey) }
                .onSuccess {
                  shift = it
                  onShiftChanged(it)
                  openKey = UUID.randomUUID().toString()
                  closeCash = it.expectedCash.toString()
                }
                .onFailure { error = it.message }
              busy = false
            }
          },
          enabled = !busy && point.isNotBlank() && openCash.toIntOrNull() != null,
          colors = ButtonDefaults.buttonColors(containerColor = StaffLime, contentColor = StaffInk),
          modifier = Modifier.fillMaxWidth().padding(top = 14.dp).testTag("shift-open"),
        ) { Text(if (busy) "Открываем..." else "Открыть смену", fontWeight = FontWeight.Bold) }
      }
    }
    shift?.let { current ->
      item {
        Card(colors = CardDefaults.cardColors(containerColor = StaffSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().padding(top = 14.dp)) {
          Column(Modifier.padding(16.dp)) {
            Text("Смена открыта", color = StaffLime, fontWeight = FontWeight.Bold)
            Text(current.point, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 4.dp))
            Text("Начало: ${current.openCash} сом", color = StaffMuted, modifier = Modifier.padding(top = 8.dp))
            Text("Ожидается: ${current.expectedCash} сом", color = Color.White, modifier = Modifier.padding(top = 2.dp).testTag("shift-expected"))
          }
        }
        Text("Сверка кассы", color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 20.dp, bottom = 8.dp))
        OutlinedTextField(closeCash, { closeCash = it.filter(Char::isDigit) }, label = { Text("Фактически в кассе") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("shift-close-cash"))
        val discrepancy = closeCash.toIntOrNull()?.let { it != current.expectedCash } == true
        if (discrepancy) OutlinedTextField(reason, { reason = it }, label = { Text("Причина расхождения") }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("shift-reason"))
        Button(
          onClick = {
            busy = true; error = null
            scope.launch {
              runCatching { gateway.closeShift(current.id, CloseShiftRequest(closeCash.toInt(), reason), session.accessToken, closeKey) }
                .onSuccess {
                  shift = null
                  onShiftChanged(null)
                  closeKey = UUID.randomUUID().toString()
                  closeCash = ""
                  reason = ""
                }
                .onFailure { error = it.message }
              busy = false
            }
          },
          enabled = !busy && closeCash.toIntOrNull() != null && (!discrepancy || reason.isNotBlank()),
          colors = ButtonDefaults.buttonColors(containerColor = StaffCoral),
          modifier = Modifier.fillMaxWidth().padding(top = 14.dp).testTag("shift-close"),
        ) { Text(if (busy) "Сверяем..." else "Закрыть смену") }
      }
    }
  }
}

private fun currentWeekStart(): String = LocalDate.now()
  .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString()

private fun formatHrTime(value: String?): String = value?.let {
  runCatching { OffsetDateTime.parse(it).format(DateTimeFormatter.ofPattern("HH:mm")) }.getOrDefault(it.take(16).takeLast(5))
}.orEmpty()

private fun attendanceQueueLabel(state: String): String = when (state) {
  "syncing" -> "Отправляется"
  "conflict" -> "Требует проверки"
  "failed" -> "Ошибка отправки"
  else -> "Ожидает сеть"
}

private fun scheduleStaffSync(context: android.content.Context, apiBaseUrl: String) {
  val request = OneTimeWorkRequestBuilder<StaffSyncWorker>()
    .setInputData(Data.Builder().putString("apiBaseUrl", apiBaseUrl).build())
    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
    .build()
  WorkManager.getInstance(context).enqueueUniqueWork("alistore-staff-sync", ExistingWorkPolicy.KEEP, request)
}

@Composable
private fun StaffLoading() = Box(Modifier.fillMaxSize().background(StaffInk), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = StaffLime) }

@Composable
internal fun StaffError(message: String, onRetry: () -> Unit) {
  Column(Modifier.fillMaxWidth().padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    Text(message, color = StaffCoral)
    TextButton(onClick = onRetry, modifier = Modifier.testTag("staff-retry")) { Text("Повторить") }
  }
}

@Composable
internal fun StaffEmpty(title: String, detail: String, modifier: Modifier = Modifier) {
  Column(modifier.fillMaxSize().background(StaffInk).padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
    Text(title, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
    Text(detail, color = StaffMuted, modifier = Modifier.padding(top = 8.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
  }
}

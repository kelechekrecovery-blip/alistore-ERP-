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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.UUID
import kotlinx.coroutines.launch

interface CustomerSupportGateway : CustomerEvidenceGateway {
  suspend fun tickets(token: String): List<SupportTicket>
  suspend fun openTicket(request: OpenSupportTicketRequest, token: String, idempotencyKey: String): SupportTicket
}

private val SupportInk = Color(0xFF201B17)
private val SupportSurface = Color(0xFF2A231D)
private val SupportLine = Color(0xFF463C31)
private val SupportMuted = Color(0xFFA79C92)
private val SupportCoral = Color(0xFFFF5B2E)
private val SupportLime = Color(0xFFC6FF3D)

@Composable
internal fun ClientSupportScreen(
  apiBaseUrl: String,
  session: AuthState.SignedIn,
  onBack: () -> Unit,
  modifier: Modifier = Modifier,
  providedGateway: CustomerSupportGateway? = null,
  authManager: AuthSessionManager? = null,
  onAuthState: (AuthState) -> Unit = {},
) {
  val gateway = remember(apiBaseUrl, providedGateway) { providedGateway ?: ApiClient(apiBaseUrl) }
  val scope = rememberCoroutineScope()
  var tickets by remember { mutableStateOf<List<SupportTicket>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var loadError by remember { mutableStateOf<String?>(null) }
  var refresh by remember { mutableIntStateOf(0) }
  var composing by remember { mutableStateOf(false) }
  var channel by remember { mutableStateOf("app") }
  var subject by remember { mutableStateOf("") }
  var body by remember { mutableStateOf("") }
  var key by remember { mutableStateOf(UUID.randomUUID().toString()) }
  var submitting by remember { mutableStateOf(false) }
  var submitError by remember { mutableStateOf<String?>(null) }
  var created by remember { mutableStateOf<SupportTicket?>(null) }

  LaunchedEffect(session.tokens.accessToken, refresh) {
    loading = true
    var attempt = runCatching { gateway.tickets(session.tokens.accessToken) }
    if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
      val renewed = authManager.refresh(session)
      onAuthState(renewed)
      if (renewed is AuthState.SignedIn) attempt = runCatching { gateway.tickets(renewed.tokens.accessToken) }
    }
    attempt.onSuccess { tickets = it; loadError = null }
      .onFailure { loadError = it.message ?: "Не удалось загрузить обращения" }
    loading = false
  }

  fun resetKey() { key = UUID.randomUUID().toString(); submitError = null }

  LazyColumn(
    modifier.fillMaxSize().background(SupportInk).statusBarsPadding().padding(18.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    item {
      Button(onClick = onBack, shape = RoundedCornerShape(8.dp), colors = ButtonDefaults.buttonColors(containerColor = SupportSurface, contentColor = Color.White)) { Text("Назад") }
      Text("Поддержка", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 14.dp).testTag("support-title"))
      Text("Обращения и SLA синхронизируются с AliStore", color = SupportMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
    }
    item {
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("app" to "Чат", "whatsapp" to "WhatsApp", "telegram" to "Telegram").forEach { (value, label) ->
          Text(label, color = if (channel == value) SupportInk else Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
            modifier = Modifier.weight(1f).background(if (channel == value) SupportLime else SupportSurface, RoundedCornerShape(8.dp))
              .clickable { channel = value; resetKey() }.padding(vertical = 13.dp),)
        }
      }
    }
    if (created != null) {
      item {
        Column(Modifier.fillMaxWidth().background(SupportSurface, RoundedCornerShape(8.dp)).padding(16.dp).testTag("support-created")) {
          Text("Обращение принято", color = SupportLime, fontWeight = FontWeight.Bold)
          Text("SUP-${created!!.id.takeLast(6).uppercase()} · ответ до ${created!!.sla.take(10)}", color = SupportMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
          CustomerEvidencePicker("support", created!!.id, session, gateway, authManager, onAuthState, Modifier.fillMaxWidth().padding(top = 10.dp))
        }
      }
    }
    if (composing) {
      item {
        OutlinedTextField(subject, { subject = it.take(160); resetKey() }, label = { Text("Тема") }, singleLine = true,
          modifier = Modifier.fillMaxWidth().testTag("support-subject"), colors = supportFieldColors())
        OutlinedTextField(body, { body = it.take(1000); resetKey() }, label = { Text("Опишите вопрос") }, minLines = 3,
          modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("support-body"), colors = supportFieldColors())
        submitError?.let { Text(it, color = SupportCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp)) }
        Button(
          onClick = {
            scope.launch {
              submitting = true
              val command = OpenSupportTicketRequest(channel, subject.trim(), body.trim().ifBlank { null })
              var attempt = runCatching { gateway.openTicket(command, session.tokens.accessToken, key) }
              if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
                val renewed = authManager.refresh(session)
                onAuthState(renewed)
                if (renewed is AuthState.SignedIn) attempt = runCatching { gateway.openTicket(command, renewed.tokens.accessToken, key) }
              }
              attempt.onSuccess {
                created = it; tickets = listOf(it) + tickets.filterNot { row -> row.id == it.id }; composing = false; submitError = null
              }.onFailure { submitError = it.message ?: "Не удалось создать обращение" }
              submitting = false
            }
          },
          enabled = !submitting && subject.trim().isNotEmpty(),
          modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("support-submit"),
          colors = ButtonDefaults.buttonColors(containerColor = SupportLime, contentColor = SupportInk),
          shape = RoundedCornerShape(8.dp),
        ) { Text(if (submitting) "Отправляем…" else "Отправить обращение", fontWeight = FontWeight.Bold) }
      }
    } else if (created == null) {
      item {
        Button(onClick = { composing = true; created = null }, modifier = Modifier.fillMaxWidth().testTag("support-create"),
          shape = RoundedCornerShape(8.dp), colors = ButtonDefaults.buttonColors(containerColor = SupportLime, contentColor = SupportInk)) {
          Text("Создать обращение", fontWeight = FontWeight.Bold)
        }
      }
    }
    item { Text("Мои обращения", color = SupportMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
    when {
      loading -> item { Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(color = SupportLime) } }
      loadError != null -> item { SupportError(loadError!!) { refresh += 1 } }
      tickets.isEmpty() -> item { Text("Обращений пока нет", color = SupportMuted, modifier = Modifier.fillMaxWidth().background(SupportSurface, RoundedCornerShape(8.dp)).padding(18.dp)) }
      else -> items(tickets, key = { it.id }) { ticket ->
        Column(Modifier.fillMaxWidth().background(SupportSurface, RoundedCornerShape(8.dp)).padding(14.dp).testTag("support-${ticket.id}")) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(ticket.subject, color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(ticket.status.supportLabel(), color = SupportLime, fontSize = 11.sp)
          }
          ticket.body?.let { Text(it, color = SupportMuted, fontSize = 12.sp, maxLines = 2, modifier = Modifier.padding(top = 5.dp)) }
          Text("SLA ${ticket.sla.take(10)}", color = SupportMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
        }
      }
    }
  }
}

@Composable private fun supportFieldColors() = OutlinedTextFieldDefaults.colors(
  focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = SupportLime,
  unfocusedBorderColor = SupportLine, focusedLabelColor = SupportLime, unfocusedLabelColor = SupportMuted,
)

@Composable private fun SupportError(detail: String, retry: () -> Unit) =
  Column(Modifier.fillMaxWidth().background(SupportSurface, RoundedCornerShape(8.dp)).padding(16.dp)) {
    Text("Поддержка недоступна", color = SupportCoral, fontWeight = FontWeight.Bold)
    Text(detail, color = SupportMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
    Button(onClick = retry, modifier = Modifier.padding(top = 8.dp)) { Text("Повторить") }
  }

private fun String.supportLabel() = when (this) {
  "new" -> "Новое"; "in_progress" -> "В работе"; "waiting" -> "Ожидает"; "resolved" -> "Решено"; "closed" -> "Закрыто"; else -> this
}

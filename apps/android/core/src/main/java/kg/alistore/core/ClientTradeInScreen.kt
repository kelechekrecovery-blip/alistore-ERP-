package kg.alistore.core

import android.content.Context
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
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

interface CustomerTradeInsGateway : CustomerEvidenceGateway {
  suspend fun tradeIns(token: String): List<CustomerTradeIn>
  suspend fun createTradeIn(request: CreateTradeInRequest, token: String, idempotencyKey: String): CustomerTradeIn
}

private val TradeInInk = Color(0xFF16130F)
private val TradeInSurface = Color(0xFF221E19)
private val TradeInLine = Color(0xFF342E28)
private val TradeInMuted = Color(0xFFA79C92)
private val TradeInCoral = Color(0xFFFF6B57)
private val TradeInLime = Color(0xFFC8F04B)
private val tradeInGrades = listOf("A", "B", "C")
private const val CLIENT_QUEUE_DB = "alistore-offline.db"

@Composable
internal fun ClientTradeInsScreen(
  apiBaseUrl: String,
  session: AuthState.SignedIn,
  onBack: () -> Unit,
  modifier: Modifier = Modifier,
  providedGateway: CustomerTradeInsGateway? = null,
  authManager: AuthSessionManager? = null,
  onAuthState: (AuthState) -> Unit = {},
) {
  val gateway = remember(apiBaseUrl, providedGateway) { providedGateway ?: ApiClient(apiBaseUrl) }
  val context = LocalContext.current.applicationContext
  val scope = rememberCoroutineScope()
  var tradeIns by remember { mutableStateOf<List<CustomerTradeIn>>(emptyList()) }
  var model by rememberSaveable { mutableStateOf("") }
  var imei by rememberSaveable { mutableStateOf("") }
  var passport by rememberSaveable { mutableStateOf("") }
  var grade by rememberSaveable { mutableStateOf("A") }
  var price by rememberSaveable { mutableStateOf("") }
  var key by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
  var loading by remember { mutableStateOf(true) }
  var refreshing by remember { mutableIntStateOf(0) }
  var submitting by remember { mutableStateOf(false) }
  var loadError by remember { mutableStateOf<String?>(null) }
  var submitError by remember { mutableStateOf<String?>(null) }
  var queued by remember { mutableStateOf(false) }
  var created by remember { mutableStateOf<CustomerTradeIn?>(null) }

  LaunchedEffect(session.tokens.accessToken, refreshing) {
    loading = true
    var token = session.tokens.accessToken
    var attempt = runCatching { gateway.tradeIns(token) }
    if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
      val renewed = authManager.refresh(session)
      onAuthState(renewed)
      if (renewed is AuthState.SignedIn) {
        token = renewed.tokens.accessToken
        attempt = runCatching { gateway.tradeIns(token) }
      }
    }
    attempt.onSuccess { tradeIns = it; loadError = null }
      .onFailure { loadError = it.message ?: "Не удалось загрузить trade-in" }
    loading = false
  }

  fun rotateCommand() {
    key = UUID.randomUUID().toString()
    submitError = null
    queued = false
    created = null
  }

  val amount = price.toIntOrNull() ?: 0
  val validImei = imei.isBlank() || imei.length == 15
  val canSubmit = model.trim().length >= 2 && passport.trim().length >= 4 && amount > 0 && validImei

  LazyColumn(
    modifier.fillMaxSize().background(TradeInInk).statusBarsPadding().padding(18.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    item {
      Button(onClick = onBack, shape = RoundedCornerShape(8.dp), colors = ButtonDefaults.buttonColors(containerColor = TradeInSurface, contentColor = Color.White)) { Text("Назад") }
      Text("Trade-in", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 14.dp).testTag("tradein-title"))
      Text("Оценка устройства и договор привязаны к вашему аккаунту", color = TradeInMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
    }
    when {
      loading -> item { Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(color = TradeInLime) } }
      loadError != null -> item { TradeInError(loadError!!) { refreshing += 1 } }
      created != null -> item {
        Column(Modifier.fillMaxWidth().background(TradeInSurface, RoundedCornerShape(8.dp)).padding(16.dp).testTag("tradein-created")) {
          Text("Заявка принята", color = TradeInLime, fontSize = 18.sp, fontWeight = FontWeight.Bold)
          Text(created!!.contractId ?: "Договор формируется", color = Color.White, fontSize = 14.sp, modifier = Modifier.padding(top = 7.dp))
          Text("${created!!.model} · ${created!!.price} сом · класс ${created!!.grade}", color = TradeInMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
          Text("Паспорт хранится защищённо: ${created!!.sellerPassportMasked}", color = TradeInMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
          CustomerEvidencePicker(
            entityType = "tradein",
            entityId = created!!.id,
            session = session,
            gateway = gateway,
            authManager = authManager,
            onAuthState = onAuthState,
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
          )
          Button(onClick = { created = null; rotateCommand() }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp), colors = ButtonDefaults.buttonColors(containerColor = TradeInLime, contentColor = TradeInInk), shape = RoundedCornerShape(8.dp)) { Text("Новая оценка") }
        }
      }
      queued -> item {
        Column(Modifier.fillMaxWidth().background(TradeInSurface, RoundedCornerShape(8.dp)).padding(16.dp).testTag("tradein-queued")) {
          Text("Сохранено офлайн", color = TradeInLime, fontSize = 18.sp, fontWeight = FontWeight.Bold)
          Text("Заявка отправится автоматически после восстановления сети. Статус подтверждает только сервер.", color = TradeInMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp))
          Button(onClick = { queued = false }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp), colors = ButtonDefaults.buttonColors(containerColor = TradeInSurface, contentColor = Color.White), shape = RoundedCornerShape(8.dp)) { Text("Вернуться к форме") }
        }
      }
      else -> {
        item {
          TradeInField("Модель устройства", model, { model = it.take(120); rotateCommand() }, "tradein-model")
          TradeInField("IMEI (необязательно)", imei, { imei = it.filter(Char::isDigit).take(15); rotateCommand() }, "tradein-imei", KeyboardType.Number)
          TradeInField("Паспорт / ID продавца", passport, { passport = it.take(40); rotateCommand() }, "tradein-passport", KeyboardType.Text)
          TradeInField("Цена оценки, сом", price, { price = it.filter(Char::isDigit).take(8); rotateCommand() }, "tradein-price", KeyboardType.Number)
          Text("Состояние", color = TradeInMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
          Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            tradeInGrades.forEach { option ->
              Text("Класс $option", color = if (grade == option) TradeInInk else Color.White, modifier = Modifier.weight(1f).background(if (grade == option) TradeInLime else TradeInSurface, RoundedCornerShape(8.dp)).clickable { grade = option; rotateCommand() }.padding(vertical = 13.dp).testTag("tradein-grade-$option"))
            }
          }
          if (!validImei) Text("IMEI должен содержать 15 цифр", color = TradeInCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
          submitError?.let { Text(it, color = TradeInCoral, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp)) }
          Button(
            onClick = {
              val command = CreateTradeInRequest(model.trim(), imei.takeIf(String::isNotBlank), grade, amount, passport.trim())
              scope.launch {
                submitting = true
                var token = session.tokens.accessToken
                var attempt = runCatching { gateway.createTradeIn(command, token, key) }
                if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
                  val renewed = authManager.refresh(session)
                  onAuthState(renewed)
                  if (renewed is AuthState.SignedIn) {
                    token = renewed.tokens.accessToken
                    attempt = runCatching { gateway.createTradeIn(command, token, key) }
                  }
                }
                attempt.onSuccess { result ->
                  created = result
                  tradeIns = listOf(result) + tradeIns.filterNot { it.id == result.id }
                  submitError = null
                }.onFailure { error ->
                  if (error.isNetworkFailure()) {
                    OfflineQueueDb(context, CLIENT_QUEUE_DB).enqueue("tradeins", "POST", command.toJson().toString(), key)
                    scheduleClientTradeInSync(context, apiBaseUrl)
                    queued = true
                    submitError = null
                  } else submitError = error.message ?: "Не удалось отправить заявку"
                }
                submitting = false
              }
            },
            enabled = !submitting && canSubmit,
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp).testTag("tradein-submit"),
            colors = ButtonDefaults.buttonColors(containerColor = TradeInLime, contentColor = TradeInInk),
            shape = RoundedCornerShape(8.dp),
          ) { Text(if (submitting) "Отправляем…" else "Отправить на оценку", fontWeight = FontWeight.Bold) }
        }
        item { Text("Мои оценки", color = TradeInMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 12.dp)) }
        if (tradeIns.isEmpty()) item { Text("Здесь появятся оформленные trade-in заявки", color = TradeInMuted, modifier = Modifier.fillMaxWidth().background(TradeInSurface, RoundedCornerShape(8.dp)).padding(16.dp).testTag("tradein-empty")) }
        items(tradeIns, key = { "tradein-${it.id}" }) { item ->
          Column(Modifier.fillMaxWidth().background(TradeInSurface, RoundedCornerShape(8.dp)).padding(14.dp).testTag("tradein-${item.id}")) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
              Text(item.model, color = Color.White, fontWeight = FontWeight.Bold)
              Text("${item.price} сом", color = TradeInLime, fontSize = 12.sp)
            }
            Text("Класс ${item.grade} · ${item.contractId ?: "договор формируется"}", color = TradeInMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
            Text("Паспорт: ${item.sellerPassportMasked}", color = TradeInMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
          }
        }
      }
    }
  }
}

@Composable
private fun TradeInField(label: String, value: String, onValueChange: (String) -> Unit, tag: String, keyboardType: KeyboardType = KeyboardType.Text) {
  OutlinedTextField(
    value = value,
    onValueChange = onValueChange,
    label = { Text(label) },
    singleLine = true,
    keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
    modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag(tag),
    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = TradeInLime, unfocusedBorderColor = TradeInLine, focusedLabelColor = TradeInLime, unfocusedLabelColor = TradeInMuted, focusedTextColor = Color.White, unfocusedTextColor = Color.White, cursorColor = TradeInLime),
  )
}

@Composable
private fun TradeInError(message: String, retry: () -> Unit) =
  Column(Modifier.fillMaxWidth().background(TradeInSurface, RoundedCornerShape(8.dp)).padding(16.dp)) {
    Text("Trade-in недоступен", color = TradeInCoral, fontWeight = FontWeight.Bold)
    Text(message, color = TradeInMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
    Button(onClick = retry, modifier = Modifier.padding(top = 8.dp), colors = ButtonDefaults.buttonColors(containerColor = TradeInLime, contentColor = TradeInInk)) { Text("Повторить") }
  }

private fun Throwable.isNetworkFailure(): Boolean = this is IOException || cause?.isNetworkFailure() == true

private fun scheduleClientTradeInSync(context: Context, apiBaseUrl: String) {
  val request = OneTimeWorkRequestBuilder<OfflineSyncWorker>()
    .setInputData(Data.Builder().putString("apiBaseUrl", apiBaseUrl).build())
    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
    .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
    .build()
  WorkManager.getInstance(context).enqueueUniqueWork("alistore-offline-sync", ExistingWorkPolicy.KEEP, request)
}

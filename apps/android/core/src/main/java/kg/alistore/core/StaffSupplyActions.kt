package kg.alistore.core

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
internal fun StaffSupplyActions(session: StaffSession, gateway: SupplyParityGateway, modifier: Modifier = Modifier) {
  var operations by remember { mutableStateOf<SupplyOperationsResponse?>(null) }
  var status by remember { mutableStateOf<String?>(null) }
  var cancellationOrderId by rememberSaveable { mutableStateOf("") }
  var cancellationId by rememberSaveable { mutableStateOf("") }
  var action by rememberSaveable { mutableStateOf("approve_full") }
  var refund by rememberSaveable { mutableStateOf("") }
  var expense by rememberSaveable { mutableStateOf("0") }
  var fault by rememberSaveable { mutableStateOf("customer") }
  var reason by rememberSaveable { mutableStateOf("") }
  var evidenceIds by rememberSaveable { mutableStateOf("") }
  var totp by rememberSaveable { mutableStateOf("") }
  var preview by remember { mutableStateOf<OwnerCancellationPreview?>(null) }
  var orderItemId by rememberSaveable { mutableStateOf("") }
  var resolutionId by rememberSaveable { mutableStateOf("") }
  var quarantineReason by rememberSaveable { mutableStateOf("") }
  var evidenceRef by rememberSaveable { mutableStateOf("") }
  var imeis by rememberSaveable { mutableStateOf("") }
  var disposition by rememberSaveable { mutableStateOf("return_to_supplier") }
  val scope = rememberCoroutineScope()
  val context = LocalContext.current.applicationContext
  val intentStore = remember(context, session.staffId) {
    StableCommandIntentStore(context, QueueOwner.staff(session.staffId))
  }

  LaunchedEffect(session.accessToken) {
    runCatching { gateway.supplyOperations(session.accessToken) }
      .onSuccess { operations = it; status = null }
      .onFailure { status = it.message }
  }
  Column(modifier.fillMaxWidth().padding(14.dp).testTag("staff-supply-actions")) {
    Text("Поставки под заказ", color = Color.White, fontSize = 18.sp)
    operations?.let { response ->
      Text(
        response.counts.entries.joinToString(" · ") { "${it.key}: ${it.value}" },
        color = Design3.textMuted,
        fontSize = 11.sp,
      )
      response.queues["cancellation_awaiting_owner"].orEmpty().firstOrNull()?.let { row ->
        OutlinedButton(onClick = {
          cancellationOrderId = row.orderId
          cancellationId = row.id
          scope.launch {
            runCatching { gateway.ownerCancellationPreview(row.orderId, row.id, session.accessToken) }
              .onSuccess { preview = it; refund = it.fullRefundAmount.toString(); status = "Preview загружен" }
              .onFailure { status = it.message }
          }
        }) { Text("Открыть отмену #${row.id.takeLast(6)}") }
      }
    }
    if (session.role in setOf("owner", "admin")) {
      Text("Решение владельца", color = Color.White, modifier = Modifier.padding(top = 10.dp))
      preview?.let { Text("Задаток ${it.depositPaidSnapshot} · canResolve=${it.canResolve}", color = Design3.textMuted, fontSize = 11.sp) }
      OutlinedTextField(cancellationOrderId, { cancellationOrderId = it }, label = { Text("Order ID") }, modifier = Modifier.fillMaxWidth())
      OutlinedTextField(cancellationId, { cancellationId = it }, label = { Text("Cancellation ID") }, modifier = Modifier.fillMaxWidth())
      Row {
        listOf("approve_full", "approve_partial", "reject").forEach { option ->
          OutlinedButton(onClick = { action = option }, modifier = Modifier.weight(1f)) { Text(if (action == option) "✓" else option.take(7), fontSize = 9.sp) }
        }
      }
      OutlinedTextField(refund, { refund = it.filter(Char::isDigit) }, label = { Text("Сумма возврата") }, modifier = Modifier.fillMaxWidth())
      OutlinedTextField(expense, { expense = it.filter(Char::isDigit) }, label = { Text("Расход поставщика") }, modifier = Modifier.fillMaxWidth())
      OutlinedTextField(fault, { fault = it }, label = { Text("Виновная сторона") }, modifier = Modifier.fillMaxWidth())
      OutlinedTextField(reason, { reason = it }, label = { Text("Причина решения") }, modifier = Modifier.fillMaxWidth())
      OutlinedTextField(evidenceIds, { evidenceIds = it }, label = { Text("Evidence IDs через запятую") }, modifier = Modifier.fillMaxWidth())
      OutlinedTextField(totp, { totp = it.filter(Char::isDigit).take(12) }, label = { Text("TOTP") }, modifier = Modifier.fillMaxWidth())
      Button(
        onClick = {
          scope.launch {
            val evidence = evidenceIds.split(',').map(String::trim).filter(String::isNotBlank)
            val refundAmount = refund.toIntOrNull()
            val supplierExpenseAmount = expense.toIntOrNull()
            val intent = intentStore.ownerCancellation(
              cancellationOrderId, cancellationId, action, refundAmount, supplierExpenseAmount,
              fault, reason, evidence,
            )
            runCatching {
              gateway.resolveOwnerCancellation(
                cancellationOrderId, cancellationId, action, refundAmount, supplierExpenseAmount,
                fault, reason, evidence, totp, session.accessToken, intent.idempotencyKey,
              )
            }.onSuccess {
              intentStore.close(intent)
              status = "Решение сохранено: ${it.status}"
            }.onFailure { status = it.message }
          }
        },
        enabled = NativeSupplyPolicy.canResolveOwnerCancellation(session, operations?.capabilities?.ownerResolutionAvailable == true)
          && cancellationOrderId.isNotBlank() && cancellationId.isNotBlank() && reason.length >= 3
          && totp.length >= 6 && evidenceIds.isNotBlank(),
        modifier = Modifier.fillMaxWidth().testTag("owner-resolution-submit"),
      ) { Text("Подтвердить решение") }
    }
    Text("Quarantine", color = Color.White, modifier = Modifier.padding(top = 12.dp))
    OutlinedTextField(orderItemId, { orderItemId = it }, label = { Text("Order item ID для предложения") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(resolutionId, { resolutionId = it }, label = { Text("Resolution ID для решения") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(quarantineReason, { quarantineReason = it }, label = { Text("Причина") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(evidenceRef, { evidenceRef = it }, label = { Text("Evidence reference") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(imeis, { imeis = it }, label = { Text("IMEI через запятую") }, modifier = Modifier.fillMaxWidth())
    Row {
      OutlinedButton(onClick = { disposition = "return_to_supplier" }, modifier = Modifier.weight(1f)) { Text("Поставщику") }
      OutlinedButton(onClick = { disposition = "convert_to_own_stock" }, modifier = Modifier.weight(1f)) { Text("В склад") }
    }
    Row {
      Button(onClick = {
        scope.launch {
          val evidence = mapOf("reference" to evidenceRef)
          val selectedImeis = imeis.split(',').map(String::trim).filter(String::isNotBlank)
          val intent = intentStore.quarantineProposal(orderItemId, quarantineReason, evidence, selectedImeis)
          runCatching {
            gateway.proposeSupplyQuarantine(
              orderItemId, quarantineReason, evidence, selectedImeis, session.accessToken, intent.idempotencyKey,
            )
          }.onSuccess {
            intentStore.close(intent)
            resolutionId = it.id
            status = "Quarantine создан"
          }.onFailure { status = it.message }
        }
      }, enabled = orderItemId.isNotBlank() && quarantineReason.length >= 3 && evidenceRef.isNotBlank(), modifier = Modifier.weight(1f)) {
        Text("Предложить")
      }
      Button(onClick = {
        scope.launch {
          val evidence = mapOf("reference" to evidenceRef)
          val intent = intentStore.quarantineResolution(resolutionId, disposition, quarantineReason, evidence)
          runCatching {
            gateway.resolveSupplyQuarantine(
              resolutionId, disposition, quarantineReason, evidence, session.accessToken, intent.idempotencyKey,
            )
          }.onSuccess {
            intentStore.close(intent)
            status = "Quarantine: ${it.disposition}"
          }.onFailure { status = it.message }
        }
      }, enabled = session.role in setOf("owner", "admin") && resolutionId.isNotBlank() && quarantineReason.length >= 3 && evidenceRef.isNotBlank(), modifier = Modifier.weight(1f)) {
        Text("Решить")
      }
    }
    status?.let { Text(it, color = Design3.orange, fontSize = 11.sp, modifier = Modifier.testTag("staff-supply-status")) }
  }
}

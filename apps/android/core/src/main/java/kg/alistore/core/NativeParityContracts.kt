package kg.alistore.core

/** Tender methods accepted by the server POS sale/exchange contracts. */
val posTenderOptions = listOf(
  "cash" to "Наличные",
  "card" to "Карта",
  "qr_mbank" to "MBank",
  "qr_odengi" to "O!Деньги",
  "bakai_pos" to "Bakai POS",
  "obank" to "O!Bank",
  "installment" to "Рассрочка",
)

val staffOrderStatuses = listOf("created", "reserved", "paid", "picking", "packed", "ready_for_pickup")
val staffOrderStatusLabels = mapOf(
  "created" to "Новые",
  "reserved" to "Резерв",
  "paid" to "Оплачены",
  "picking" to "Сборка",
  "packed" to "Упакованы",
  "ready_for_pickup" to "К выдаче",
)
val staffSupportStatuses = listOf(
  "new" to "Новая",
  "in_progress" to "В работе",
  "waiting" to "Ожидает клиента",
  "resolved" to "Решена",
)

fun supportTransitionLabel(target: String): String = when (target) {
  "in_progress" -> "В работу"
  "waiting" -> "Ожидание"
  "resolved" -> "Решить"
  "closed" -> "Закрыть"
  else -> target
}

fun canEscalateSupportTicket(status: String, priority: String): Boolean =
  status !in setOf("resolved", "closed") && priority != "urgent"

fun handoverReasonRequired(run: CourierRunSummary, amount: Int): Boolean =
  amount != run.collectedTotal || run.collectedTotal != run.codTotal

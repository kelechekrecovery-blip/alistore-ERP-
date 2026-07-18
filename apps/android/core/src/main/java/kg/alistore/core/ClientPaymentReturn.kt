package kg.alistore.core

import java.net.URI
import java.net.URLDecoder

data class PaymentReturnRoute(
  val orderId: String?,
  val status: String?,
  val method: OnlinePaymentMethod?,
)

internal fun parsePaymentReturnRoute(raw: String?): PaymentReturnRoute? {
  if (raw.isNullOrBlank()) return null
  val uri = runCatching { URI(raw) }.getOrNull() ?: return null
  val isCustomScheme = uri.scheme == "alistore" && uri.host == "payment-return"
  val isHttpsAppLink = uri.scheme == "https" &&
    (uri.host == "alistore.kg" || uri.host == "www.alistore.kg") &&
    uri.path == "/payment-return"
  if (!isCustomScheme && !isHttpsAppLink) return null
  val query = uri.rawQuery.orEmpty().split('&').mapNotNull { pair ->
    val separator = pair.indexOf('=')
    if (separator < 0) return@mapNotNull null
    val key = runCatching { URLDecoder.decode(pair.substring(0, separator), Charsets.UTF_8.name()) }.getOrNull() ?: return@mapNotNull null
    val value = runCatching { URLDecoder.decode(pair.substring(separator + 1), Charsets.UTF_8.name()) }.getOrNull() ?: return@mapNotNull null
    key to value
  }.toMap()
  fun parameter(name: String): String? = query[name]?.trim()?.takeIf(String::isNotBlank)
  return PaymentReturnRoute(
    orderId = parameter("orderId"),
    status = parameter("status")?.lowercase(),
    method = parameter("method")?.let { value ->
      OnlinePaymentMethod.entries.firstOrNull { it.wireValue.equals(value, ignoreCase = true) }
    },
  )
}

internal fun PaymentReturnRoute.isFailed(): Boolean =
  status in setOf("failed", "declined", "expired", "cancelled", "canceled", "rejected")

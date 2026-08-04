package kg.alistore.core

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

enum class ClientPushDestination { ORDERS, WARRANTY, ACCOUNT }

data class ClientPushRoute(
  val destination: ClientPushDestination,
  val entityId: String? = null,
)

fun parseClientPushRoute(raw: String?): ClientPushRoute? {
  if (raw.isNullOrBlank()) return null
  val uri = runCatching { URI(raw) }.getOrNull() ?: return null
  if (uri.scheme != "alistore-client" || uri.rawQuery != null || uri.rawFragment != null) return null
  val segments = uri.rawPath.orEmpty().trim('/').split('/').filter(String::isNotBlank)
  val entityId = segments.singleOrNull()
    ?.takeIf(String::isNotBlank)
    ?.let { runCatching { URLDecoder.decode(it, StandardCharsets.UTF_8.name()) }.getOrNull() }
  return when (uri.host?.lowercase()) {
    "orders" -> entityId?.let { ClientPushRoute(ClientPushDestination.ORDERS, it) }
    "warranty" -> entityId?.let { ClientPushRoute(ClientPushDestination.WARRANTY, it) }
    "account" -> if (segments.size <= 1) ClientPushRoute(ClientPushDestination.ACCOUNT, entityId) else null
    else -> null
  }
}

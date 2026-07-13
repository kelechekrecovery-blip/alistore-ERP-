package kg.alistore.core

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

data class CourierPushRoute(val orderId: String)

fun parseCourierPushRoute(value: String?): CourierPushRoute? {
  if (value.isNullOrBlank()) return null
  val uri = runCatching { URI(value) }.getOrNull() ?: return null
  if (uri.scheme != "alistore-courier" || uri.host != "deliveries") return null
  val orderId = uri.path.orEmpty().trim('/').takeIf(String::isNotBlank) ?: return null
  return CourierPushRoute(URLDecoder.decode(orderId, StandardCharsets.UTF_8.name()))
}

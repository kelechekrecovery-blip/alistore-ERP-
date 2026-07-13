package kg.alistore.core

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

data class StaffPushRoute(val tab: Int, val entityId: String? = null, val customerId: String? = null)

fun parseStaffPushRoute(value: String?): StaffPushRoute? {
  if (value.isNullOrBlank()) return null
  val uri = runCatching { URI(value) }.getOrNull() ?: return null
  if (uri.scheme != "alistore-staff") return null
  val section = uri.host?.lowercase() ?: return null
  val entityId = uri.path.orEmpty().trim('/').takeIf(String::isNotBlank)?.decode()
  val customerId = uri.query.orEmpty().split('&').mapNotNull { item ->
    val parts = item.split('=', limit = 2)
    if (parts.size == 2 && parts[0] == "customerId") parts[1].decode() else null
  }.firstOrNull()
  return when (section) {
    "orders" -> StaffPushRoute(tab = 1, entityId = entityId)
    "tasks" -> StaffPushRoute(tab = 2, entityId = entityId)
    "scanner" -> StaffPushRoute(tab = 3, entityId = entityId)
    "shift", "account" -> StaffPushRoute(tab = 4, entityId = entityId)
    "customers" -> StaffPushRoute(tab = 5, customerId = entityId)
    "warranty", "support" -> StaffPushRoute(tab = 5, entityId = entityId, customerId = customerId)
    else -> null
  }
}

private fun String.decode(): String = URLDecoder.decode(this, StandardCharsets.UTF_8.name())

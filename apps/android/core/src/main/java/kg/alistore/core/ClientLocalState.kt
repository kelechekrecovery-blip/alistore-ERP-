package kg.alistore.core

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

internal data class ClientLocalState(
  val favorites: Set<String> = emptySet(),
  val cart: Map<String, Int> = emptyMap(),
)

internal class ClientLocalStateStore(
  context: Context,
  name: String,
) {
  private val preferences = context.applicationContext.getSharedPreferences(
    "alistore-client-state-$name",
    Context.MODE_PRIVATE,
  )

  fun read(): ClientLocalState {
    val favorites = runCatching {
      val values = JSONArray(preferences.getString(KEY_FAVORITES, "[]") ?: "[]")
      buildSet {
        for (index in 0 until values.length()) {
          values.optString(index).trim().takeIf(String::isNotBlank)?.let(::add)
        }
      }
    }.getOrDefault(emptySet())
    val cart = runCatching {
      val values = JSONObject(preferences.getString(KEY_CART, "{}") ?: "{}")
      buildMap {
        values.keys().forEach { id ->
          values.optInt(id, 0).takeIf { it > 0 }?.let { put(id, it) }
        }
      }
    }.getOrDefault(emptyMap())
    return ClientLocalState(favorites, cart)
  }

  fun write(state: ClientLocalState) {
    val favorites = JSONArray().apply { state.favorites.sorted().forEach(::put) }
    val cart = JSONObject().apply {
      state.cart.filterValues { it > 0 }.toSortedMap().forEach { (id, quantity) -> put(id, quantity) }
    }
    preferences.edit()
      .putString(KEY_FAVORITES, favorites.toString())
      .putString(KEY_CART, cart.toString())
      .apply()
  }

  fun clear() {
    preferences.edit().remove(KEY_FAVORITES).remove(KEY_CART).apply()
  }

  private companion object {
    const val KEY_FAVORITES = "favorites"
    const val KEY_CART = "cart"
  }
}

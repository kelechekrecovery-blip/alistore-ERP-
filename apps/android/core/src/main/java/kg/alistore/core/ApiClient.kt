package kg.alistore.core

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class ApiClient(private val baseUrl: String) {
  init { require(baseUrl.startsWith("http://") || baseUrl.startsWith("https://")) { "A valid API_BASE_URL is required" } }

  suspend fun catalog(): List<Product> = withContext(Dispatchers.IO) {
    val connection = open("catalog/products?limit=100", "GET")
    try {
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val payload = stream.bufferedReader().use { it.readText() }
      if (status !in 200..299) {
        val message = runCatching { JSONObject(payload).optString("message") }.getOrNull().orEmpty()
        throw ApiException(status, message.ifBlank { "Ошибка сервера $status" })
      }
      val items = JSONObject(payload).getJSONArray("items")
      buildList {
        for (index in 0 until items.length()) {
          val item = items.getJSONObject(index)
          add(Product(item.getString("id"), item.getString("sku"), item.getString("name"), item.getInt("price"), item.getString("category"), item.getInt("availableUnits")))
        }
      }
    } finally {
      connection.disconnect()
    }
  }

  fun send(mutation: PendingMutation, token: String?): Int {
    val connection = open(mutation.endpoint, mutation.method)
    return try {
      connection.doOutput = mutation.body.isNotEmpty()
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Idempotency-Key", mutation.idempotencyKey)
      if (!token.isNullOrBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
      if (mutation.body.isNotEmpty()) connection.outputStream.use { it.write(mutation.body.toByteArray()) }
      connection.responseCode
    } finally {
      connection.disconnect()
    }
  }

  private fun open(path: String, method: String): HttpURLConnection {
    val cleanPath = path.removePrefix("/")
    return (URL("${baseUrl.trimEnd('/')}/$cleanPath").openConnection() as HttpURLConnection).apply {
      requestMethod = method
      connectTimeout = 10_000
      readTimeout = 15_000
      setRequestProperty("Accept", "application/json")
    }
  }
}

class ApiException(val status: Int, override val message: String) : Exception(message)

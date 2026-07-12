package kg.alistore.core

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class ApiClient(private val baseUrl: String) : AuthGateway {
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

  override suspend fun requestOtp(phone: String): OtpChallenge = request("auth/otp/request", "POST", JSONObject().put("phone", phone)).let {
    OtpChallenge(it.optString("devCode").takeIf(String::isNotBlank))
  }

  override suspend fun verifyOtp(phone: String, code: String): AuthTokens =
    request("auth/otp/verify", "POST", JSONObject().put("phone", phone).put("code", code)).tokens()

  override suspend fun refresh(refreshToken: String): AuthTokens =
    request("auth/refresh", "POST", JSONObject().put("refreshToken", refreshToken)).tokens()

  override suspend fun me(accessToken: String): AuthUser = request("auth/me", "GET", token = accessToken).let {
    AuthUser(it.getString("customerId"), it.optString("phone").takeIf(String::isNotBlank), it.getString("typ"))
  }

  override suspend fun logout(refreshToken: String) {
    request("auth/logout", "POST", JSONObject().put("refreshToken", refreshToken), allowEmpty = true)
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

  private suspend fun request(
    path: String,
    method: String,
    body: JSONObject? = null,
    token: String? = null,
    allowEmpty: Boolean = false,
  ): JSONObject = withContext(Dispatchers.IO) {
    val connection = open(path, method)
    try {
      connection.setRequestProperty("Content-Type", "application/json")
      if (!token.isNullOrBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
      if (body != null) {
        connection.doOutput = true
        connection.outputStream.use { it.write(body.toString().toByteArray()) }
      }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      if (status !in 200..299) {
        val message = runCatching { JSONObject(payload).optString("message") }.getOrNull().orEmpty()
        throw ApiException(status, message.ifBlank { "Ошибка сервера $status" })
      }
      if (payload.isBlank() && allowEmpty) JSONObject() else JSONObject(payload)
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

private fun JSONObject.tokens() = AuthTokens(getString("accessToken"), getString("refreshToken"))

class ApiException(val status: Int, override val message: String) : Exception(message)

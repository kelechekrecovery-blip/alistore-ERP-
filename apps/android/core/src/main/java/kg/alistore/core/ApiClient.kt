package kg.alistore.core

import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class ApiClient(private val baseUrl: String) : AuthGateway, PurchaseGateway, CustomerOrdersGateway, CustomerDevicesGateway,
  CustomerSupportGateway, CustomerReturnsGateway, CustomerEvidenceGateway, CustomerAccountGateway,
  StaffAuthGateway, StaffOperationsGateway, StaffEvidenceGateway, StaffCustomerGateway {
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

  override suspend fun createOrder(request: CreateOrderRequest, token: String, idempotencyKey: String): CustomerOrder =
    request("orders/mine", "POST", request.toJson(), token, idempotencyKey = idempotencyKey).order()

  override suspend fun createPaymentIntent(
    request: CreatePaymentIntentRequest,
    token: String,
    idempotencyKey: String,
  ): PaymentIntent = request(
    "payments/intents/mine",
    "POST",
    request.toJson(),
    token,
    idempotencyKey = idempotencyKey,
  ).paymentIntent()

  override suspend fun orders(token: String): List<CustomerOrder> = requestArray("orders/mine", token).let { array ->
    buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).order()) }
  }

  override suspend fun devices(token: String): List<CustomerDevice> = requestArray("customers/me/devices", token).let { array ->
    buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).device()) }
  }

  override suspend fun openWarranty(
    request: OpenWarrantyRequest,
    token: String,
    idempotencyKey: String,
  ): WarrantyCase = this.request(
    "warranty",
    "POST",
    request.toJson(),
    token,
    idempotencyKey = idempotencyKey,
  ).warrantyCase()

  override suspend fun tickets(token: String): List<SupportTicket> = requestArray("support/tickets/mine", token).let { array ->
    buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).supportTicket()) }
  }

  override suspend fun openTicket(
    request: OpenSupportTicketRequest,
    token: String,
    idempotencyKey: String,
  ): SupportTicket = this.request(
    "support/tickets/mine", "POST", request.toJson(), token, idempotencyKey = idempotencyKey,
  ).supportTicket()

  override suspend fun returns(token: String): List<CustomerReturn> = requestArray("returns/mine", token).let { array ->
    buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).customerReturn()) }
  }

  override suspend fun openReturn(
    request: CreateReturnRequest,
    token: String,
    idempotencyKey: String,
  ): CustomerReturn = this.request(
    "returns/mine", "POST", request.toJson(), token, idempotencyKey = idempotencyKey,
  ).customerReturn()

  override suspend fun loyalty(token: String): CustomerLoyalty = request("customers/me/loyalty", "GET", token = token).loyalty()

  override suspend fun addresses(token: String): List<CustomerAddress> = requestArray("customers/me/addresses", token).let { array ->
    buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).customerAddress()) }
  }

  override suspend fun createAddress(request: CreateCustomerAddressRequest, token: String, idempotencyKey: String): CustomerAddress =
    this.request("customers/me/addresses", "POST", request.toJson(), token, idempotencyKey = idempotencyKey).customerAddress()

  override suspend fun updateAddress(id: String, request: UpdateCustomerAddressRequest, token: String): CustomerAddress =
    this.request("customers/me/addresses/$id", "PATCH", request.toJson(), token).customerAddress()

  override suspend fun deleteAddress(id: String, token: String) {
    request("customers/me/addresses/$id", "DELETE", token = token)
  }

  override suspend fun settings(token: String): CustomerSettings = request("customers/me/settings", "GET", token = token).customerSettings()

  override suspend fun updateSettings(request: UpdateCustomerSettingsRequest, token: String): CustomerSettings =
    this.request("customers/me/settings", "PATCH", request.toJson(), token).customerSettings()

  override suspend fun staffLogin(username: String, password: String): StaffSession = request(
    "staff-auth/login", "POST", JSONObject().put("username", username).put("password", password),
  ).staffSession()

  override suspend fun staffMe(accessToken: String): StaffPrincipal =
    request("staff-auth/me", "GET", token = accessToken).staffPrincipal()

  override suspend fun currentShift(token: String): CashShift? {
    val current = requestObjectOrNull("shifts/current", token) ?: return null
    return request("shifts/${current.getString("id")}", "GET", token = token).cashShift()
  }

  override suspend fun openShift(
    request: OpenShiftRequest,
    token: String,
    idempotencyKey: String,
  ): CashShift = this.request(
    "shifts/open", "POST", request.toJson(), token, idempotencyKey = idempotencyKey,
  ).cashShift()

  override suspend fun closeShift(
    shiftId: String,
    request: CloseShiftRequest,
    token: String,
    idempotencyKey: String,
  ): CashShift = this.request(
    "shifts/$shiftId/close", "POST", request.toJson(), token, idempotencyKey = idempotencyKey,
  ).cashShift()

  override suspend fun staffOrders(status: String, token: String): List<CustomerOrder> =
    requestArray("orders?status=$status", token).let { array ->
      buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).order()) }
    }

  override suspend fun fulfillOrder(orderId: String, token: String): CustomerOrder =
    request("orders/$orderId/fulfill", "POST", JSONObject(), token).order()

  override suspend fun transitionOrder(orderId: String, to: String, token: String): CustomerOrder =
    request("orders/$orderId/transition", "POST", JSONObject().put("to", to), token).order()

  override suspend fun customerOverview(customerId: String, token: String): Customer360 =
    request("customers/$customerId/overview", "GET", token = token).customerOverview()

  override suspend fun transitionWarranty(caseId: String, to: String, token: String): WarrantyCase =
    request("warranty/$caseId", "PATCH", JSONObject().put("status", to), token).warrantyCase()

  override suspend fun transitionSupport(ticketId: String, to: String, token: String): SupportTicket =
    request("support/tickets/$ticketId/transition", "PATCH", JSONObject().put("to", to), token).supportTicket()

  override suspend fun escalateSupport(ticketId: String, token: String): SupportTicket =
    request("support/tickets/$ticketId/escalate", "PATCH", JSONObject(), token).supportTicket()

  override suspend fun uploadEvidence(
    entityType: String,
    entityId: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
  ): EvidenceAttachment = uploadEvidenceRequest(entityType, entityId, "Фото клиента", fileName, mimeType, bytes, token)

  override suspend fun uploadStaffEvidence(
    entityType: String,
    entityId: String,
    label: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
  ): EvidenceAttachment = uploadEvidenceRequest(entityType, entityId, label, fileName, mimeType, bytes, token)

  private suspend fun uploadEvidenceRequest(
    entityType: String,
    entityId: String,
    label: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
  ): EvidenceAttachment = withContext(Dispatchers.IO) {
    val boundary = "AliStore-${UUID.randomUUID()}"
    val connection = open("evidence/images", "POST")
    try {
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
      connection.outputStream.buffered().use { output ->
        fun field(name: String, value: String) {
          output.write("--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n".toByteArray())
        }
        field("entityType", entityType)
        field("entityId", entityId)
        field("label", label)
        output.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$fileName\"\r\nContent-Type: $mimeType\r\n\r\n".toByteArray())
        output.write(bytes)
        output.write("\r\n--$boundary--\r\n".toByteArray())
      }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      if (status !in 200..299) {
        val message = runCatching { JSONObject(payload).optString("message") }.getOrNull().orEmpty()
        throw ApiException(status, message.ifBlank { "Ошибка загрузки $status" })
      }
      JSONObject(payload).getJSONObject("asset").let { EvidenceAttachment(it.getString("key"), it.getString("url")) }
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

  private suspend fun request(
    path: String,
    method: String,
    body: JSONObject? = null,
    token: String? = null,
    allowEmpty: Boolean = false,
    idempotencyKey: String? = null,
  ): JSONObject = withContext(Dispatchers.IO) {
    val connection = open(path, method)
    try {
      connection.setRequestProperty("Content-Type", "application/json")
      if (!token.isNullOrBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
      if (!idempotencyKey.isNullOrBlank()) connection.setRequestProperty("Idempotency-Key", idempotencyKey)
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

  private suspend fun requestArray(path: String, token: String) = withContext(Dispatchers.IO) {
    val connection = open(path, "GET")
    try {
      connection.setRequestProperty("Authorization", "Bearer $token")
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      if (status !in 200..299) {
        val message = runCatching { JSONObject(payload).optString("message") }.getOrNull().orEmpty()
        throw ApiException(status, message.ifBlank { "Ошибка сервера $status" })
      }
      org.json.JSONArray(payload)
    } finally {
      connection.disconnect()
    }
  }

  private suspend fun requestObjectOrNull(path: String, token: String): JSONObject? = withContext(Dispatchers.IO) {
    val connection = open(path, "GET")
    try {
      connection.setRequestProperty("Authorization", "Bearer $token")
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      if (status !in 200..299) {
        val message = runCatching { JSONObject(payload).optString("message") }.getOrNull().orEmpty()
        throw ApiException(status, message.ifBlank { "Ошибка сервера $status" })
      }
      if (payload.isBlank() || payload == "null") null else JSONObject(payload)
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

private fun JSONObject.order() = CustomerOrder(
  id = getString("id"),
  status = getString("status"),
  total = getInt("total"),
  fulfillmentType = optString("fulfillmentType", "pickup"),
  pickupPoint = nullableString("pickupPoint"),
  deliveryAddress = nullableString("deliveryAddress"),
  items = optJSONArray("items")?.let { array ->
    buildList {
      for (index in 0 until array.length()) {
        val item = array.getJSONObject(index)
        add(CustomerOrderItem(item.getString("sku"), item.getInt("qty"), item.getInt("price"), item.nullableString("imei")))
      }
    }
  }.orEmpty(),
  createdAt = nullableString("createdAt"),
  channel = optString("channel", "web"),
)

private fun JSONObject.staffSession() = StaffSession(
  accessToken = getString("accessToken"), staffId = getString("staffId"), username = getString("username"),
  role = getString("role"), totpEnabled = optBoolean("totpEnabled"),
)

private fun JSONObject.staffPrincipal() = StaffPrincipal(
  id = getString("id"), username = getString("username"), role = getString("role"), active = getBoolean("active"),
  totpEnabled = optBoolean("totpEnabled"), type = optString("typ", "staff"),
)

private fun JSONObject.cashShift() = CashShift(
  id = getString("id"), staffId = getString("staffId"), point = getString("point"), openCash = getInt("openCash"),
  closeCash = if (isNull("closeCash")) null else optInt("closeCash"), closeReason = nullableString("closeReason"),
  diff = if (isNull("diff")) null else optInt("diff"), openedAt = getString("openedAt"), closedAt = nullableString("closedAt"),
  payments = optJSONArray("payments")?.let { array -> buildList {
    for (index in 0 until array.length()) array.getJSONObject(index).let { payment ->
      add(ShiftPayment(payment.getString("id"), payment.getInt("amount"), payment.getString("method"), payment.getString("status")))
    }
  } }.orEmpty(),
  expected = if (isNull("expected")) null else optInt("expected"),
)

private fun JSONObject.paymentIntent() = PaymentIntent(
  intentId = getString("intentId"),
  provider = getString("provider"),
  orderId = getString("orderId"),
  orderStatus = getString("orderStatus"),
  method = getString("method"),
  amount = getInt("amount"),
  txnId = getString("txnId"),
  status = getString("status"),
  expiresAt = getString("expiresAt"),
  paymentUrl = getString("paymentUrl"),
  qrPayload = nullableString("qrPayload"),
)

private fun JSONObject.device() = CustomerDevice(
  imei = getString("imei"),
  product = getString("product"),
  status = getString("status"),
  warrantyUntil = nullableString("warrantyUntil"),
  daysLeft = if (isNull("daysLeft")) null else getInt("daysLeft"),
  warranty = optJSONObject("warranty")?.let {
    DeviceWarrantySummary(it.getString("id"), it.getString("status"), it.getString("sla"))
  },
)

private fun JSONObject.warrantyCase() = WarrantyCase(
  id = getString("id"),
  imei = getString("imei"),
  customerId = getString("customerId"),
  problem = getString("problem"),
  status = getString("status"),
  sla = getString("sla"),
)

private fun JSONObject.supportTicket() = SupportTicket(
  id = getString("id"), customerId = getString("customerId"), channel = getString("channel"),
  subject = getString("subject"), body = nullableString("body"), priority = getString("priority"),
  status = getString("status"), sla = getString("sla"), createdAt = getString("createdAt"),
)

internal fun JSONObject.customerOverview() = Customer360(
  customer = getJSONObject("customer").let { row ->
    Customer360Profile(
      id = row.getString("id"), name = row.getString("name"), phone = row.getString("phone"),
      consent = row.getBoolean("consent"),
      segments = row.getJSONArray("segments").let { values -> buildList {
        for (index in 0 until values.length()) add(values.getString(index))
      } },
      ltv = row.getInt("ltv"), createdAt = row.getString("createdAt"),
    )
  },
  orders = getJSONObject("orders").let { section -> Customer360Orders(
    total = section.getInt("total"), spent = section.getInt("spent"),
    recent = section.getJSONArray("recent").let { rows -> buildList {
      for (index in 0 until rows.length()) rows.getJSONObject(index).let { row ->
        add(Customer360Order(row.getString("id"), row.getString("status"), row.getInt("total"), row.getString("createdAt")))
      }
    } },
  ) },
  debts = getJSONObject("debts").let { section -> Customer360Debts(
    count = section.getInt("count"), openBalance = section.getInt("openBalance"),
    items = section.getJSONArray("items").let { rows -> buildList {
      for (index in 0 until rows.length()) rows.getJSONObject(index).let { row ->
        add(Customer360Debt(row.getString("id"), row.getInt("balance"), row.getString("status"), row.getString("dueDate")))
      }
    } },
  ) },
  warranties = getJSONObject("warranties").let { section -> Customer360Warranties(
    open = section.getInt("open"), items = section.getJSONArray("items").let { rows -> buildList {
      for (index in 0 until rows.length()) rows.getJSONObject(index).let { row ->
        add(Customer360Warranty(row.getString("id"), row.getString("imei"), row.getString("status"), row.getString("sla")))
      }
    } },
  ) },
  tickets = getJSONObject("tickets").let { section -> Customer360Tickets(
    open = section.getInt("open"), items = section.getJSONArray("items").let { rows -> buildList {
      for (index in 0 until rows.length()) rows.getJSONObject(index).let { row ->
        add(Customer360Ticket(row.getString("id"), row.getString("subject"), row.getString("status"), row.getString("priority"), row.getString("sla")))
      }
    } },
  ) },
)

private fun JSONObject.customerReturn() = CustomerReturn(
  id = getString("id"), orderId = getString("orderId"), reason = getString("reason"),
  status = getString("status"), createdAt = getString("createdAt"),
  order = optJSONObject("order")?.let { order ->
    ReturnOrderSummary(
      total = order.getInt("total"), createdAt = order.getString("createdAt"),
      items = order.optJSONArray("items")?.let { items ->
        buildList {
          for (index in 0 until items.length()) {
            val item = items.getJSONObject(index)
            add(CustomerOrderItem(item.getString("sku"), item.getInt("qty"), item.getInt("price")))
          }
        }
      }.orEmpty(),
    )
  },
)

private fun JSONObject.loyalty() = CustomerLoyalty(
  balance = getInt("balance"), conversion = getInt("conversion"), level = getString("level"),
  nextLevelSpend = getInt("nextLevelSpend"),
  coupons = getJSONArray("coupons").let { array -> buildList {
    for (index in 0 until array.length()) array.getJSONObject(index).let { row ->
      add(LoyaltyCoupon(row.getString("id"), row.getString("title"), row.getString("code"), row.getString("valueLabel"), row.nullableString("expiresAt")))
    }
  } },
  history = getJSONArray("history").let { array -> buildList {
    for (index in 0 until array.length()) array.getJSONObject(index).let { row ->
      add(LoyaltyEntry(row.getString("id"), row.getString("label"), row.getInt("amount"), row.getString("createdAt")))
    }
  } },
)

private fun JSONObject.customerAddress() = CustomerAddress(
  id = getString("id"), title = getString("title"), text = getString("text"),
  comment = nullableString("comment"), isPrimary = getBoolean("isPrimary"),
)

private fun JSONObject.customerSettings() = CustomerSettings(
  id = getString("id"), phone = getString("phone"), name = getString("name"), consent = getBoolean("consent"),
  push = getBoolean("push"), whatsapp = getBoolean("whatsapp"), service = getBoolean("service"), promos = getBoolean("promos"),
)

private fun JSONObject.nullableString(key: String): String? =
  if (isNull(key)) null else optString(key).takeIf(String::isNotBlank)

class ApiException(val status: Int, override val message: String) : Exception(message)

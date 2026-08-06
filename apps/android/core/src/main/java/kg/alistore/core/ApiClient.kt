package kg.alistore.core

import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class ApiClient(private val baseUrl: String) : AuthGateway, PurchaseGateway, CustomerOrdersGateway, CustomerDevicesGateway,
  CustomerSupportGateway, CustomerReturnsGateway, CustomerTradeInsGateway, CustomerEvidenceGateway, CustomerAccountGateway,
  StaffAuthGateway, StaffOperationsGateway, StaffEvidenceGateway, StaffCustomerGateway, StaffTaskGateway,
  PushRegistrationGateway, CourierGateway, PosGateway, SupplyParityGateway {
  @Volatile private var staffUnauthorizedHandler: (suspend (String) -> String?)? = null
  @Volatile private var currentStaffAccessToken: String? = null

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
          add(item.product())
        }
      }
    } finally {
      connection.disconnect()
    }
  }

  suspend fun catalogProduct(id: String): CatalogProductDetail = request("catalog/products/$id", "GET").catalogProductDetail()

  suspend fun checkoutOptions(): CheckoutOptions = withContext(Dispatchers.IO) {
    val connection = open("logistics/checkout-options", "GET")
    try {
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val payload = stream.bufferedReader().use { it.readText() }
      if (status !in 200..299) throw ApiException(status, "Не удалось загрузить опции оформления")
      JSONObject(payload).checkoutOptions()
    } finally {
      connection.disconnect()
    }
  }

  suspend fun checkoutStorePoints(): List<StorePoint> = checkoutOptions().pickupPoints

  suspend fun quotePromotion(request: PromotionQuoteRequest, token: String? = null): PromotionQuote =
    request("promotions/quote", "POST", request.toJson(), token).promotionQuote()

  override suspend fun requestOtp(phone: String): OtpChallenge = request("auth/otp/request", "POST", JSONObject().put("phone", phone)).let {
    OtpChallenge(
      devCode = it.optString("devCode").takeIf(String::isNotBlank),
      challengeId = it.optString("challengeId").takeIf(String::isNotBlank),
    )
  }

  override suspend fun verifyOtp(phone: String, code: String, challengeId: String?): AuthTokens =
    request("auth/otp/verify", "POST", otpVerificationPayload(phone, code, challengeId)).tokens()

  override suspend fun requestEmailOtp(email: String): EmailOtpChallenge =
    request("auth/email/request", "POST", JSONObject().put("email", email)).emailChallenge()

  override suspend fun verifyEmailOtp(email: String, code: String, challengeId: String?): AuthTokens =
    request("auth/email/verify", "POST", emailOtpVerificationPayload(email, code, challengeId)).tokens()

  override suspend fun requestEmailAttach(email: String, accessToken: String): EmailOtpChallenge =
    request("auth/email/attach/request", "POST", JSONObject().put("email", email), token = accessToken).emailChallenge()

  override suspend fun confirmEmailAttach(email: String, code: String, accessToken: String, challengeId: String?) {
    request(
      "auth/email/attach/confirm",
      "POST",
      JSONObject().put("email", email).put("code", code).putOptional("challengeId", challengeId),
      token = accessToken,
      allowEmpty = true,
    )
  }

  override suspend fun refresh(refreshToken: String): AuthTokens =
    request("auth/refresh", "POST", JSONObject().put("refreshToken", refreshToken)).tokens()

  override suspend fun me(accessToken: String): AuthUser = request("auth/me", "GET", token = accessToken).let {
    AuthUser(it.getString("customerId"), it.optString("phone").takeIf(String::isNotBlank), it.getString("typ"))
  }

  override suspend fun logout(refreshToken: String) {
    request("auth/logout", "POST", JSONObject().put("refreshToken", refreshToken), allowEmpty = true)
  }

  override suspend fun googleLogin(identityToken: String, nonce: String): SocialAuthResult =
    request("auth/v2/social/google", "POST", googleLoginPayload(identityToken, nonce)).socialAuthResult()

  override suspend fun completeSocialEnrollment(
    enrollmentToken: String,
    phone: String,
    code: String,
    challengeId: String?,
  ): AuthTokens = request(
    "auth/v2/social/enrollment/complete",
    "POST",
    socialEnrollmentPayload(enrollmentToken, phone, code, challengeId),
  ).tokens()

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

  override suspend fun tradeIns(token: String): List<CustomerTradeIn> = requestArray("tradeins/mine", token).let { array ->
    buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).customerTradeIn()) }
  }

  override suspend fun createTradeIn(
    request: CreateTradeInRequest,
    token: String,
    idempotencyKey: String,
  ): CustomerTradeIn = this.request(
    "tradeins", "POST", request.toJson(), token, idempotencyKey = idempotencyKey,
  ).customerTradeIn()

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

  override suspend fun exportData(token: String): String =
    request("customers/me/export", "GET", token = token).toString(2)

  override suspend fun deleteAccount(token: String) {
    request("customers/me", "DELETE", token = token)
  }

  override suspend fun staffLogin(username: String, password: String, totp: String?): StaffSession =
    request("staff-auth/login", "POST", staffLoginPayload(username, password, totp))
      .staffSession()
      .also { currentStaffAccessToken = it.accessToken }

  override suspend fun staffMe(accessToken: String): StaffPrincipal =
    request("staff-auth/me", "GET", token = accessToken).staffPrincipal()

  override suspend fun staffRefresh(refreshToken: String): StaffSession =
    request("staff-auth/refresh", "POST", JSONObject().put("refreshToken", refreshToken))
      .staffSession()
      .also { currentStaffAccessToken = it.accessToken }

  override suspend fun staffLogout(refreshToken: String) {
    try {
      request(
        "staff-auth/logout",
        "POST",
        JSONObject().put("refreshToken", refreshToken),
        allowEmpty = true,
      )
    } finally {
      currentStaffAccessToken = null
    }
  }

  override fun installStaffUnauthorizedHandler(handler: suspend (failedAccessToken: String) -> String?) {
    staffUnauthorizedHandler = handler
  }

  override suspend fun cancellationPreview(orderId: String, token: String): OrderCancellationPreview =
    request("orders/mine/$orderId/cancellation-preview", "GET", token = token).orderCancellationPreview()

  override suspend fun currentCancellation(orderId: String, token: String): OrderCancellation? =
    requestObjectOrNull("orders/mine/$orderId/cancellations/current", token)?.orderCancellation()

  override suspend fun requestCancellation(
    orderId: String,
    reason: String,
    token: String,
    idempotencyKey: String,
  ): OrderCancellation = request(
    "orders/mine/$orderId/cancellations",
    "POST",
    JSONObject().put("reason", reason),
    token,
    idempotencyKey = idempotencyKey,
  ).orderCancellation()

  override suspend fun supplyOperations(token: String): SupplyOperationsResponse =
    request("procurement/supply-operations", "GET", token = token).supplyOperations()

  override suspend fun ownerCancellationPreview(
    orderId: String,
    cancellationId: String,
    token: String,
  ): OwnerCancellationPreview = request(
    "orders/$orderId/cancellations/$cancellationId/owner-preview",
    "GET",
    token = token,
  ).ownerCancellationPreview()

  override suspend fun resolveOwnerCancellation(
    orderId: String,
    cancellationId: String,
    action: String,
    refundAmount: Int?,
    supplierExpenseAmount: Int?,
    faultParty: String?,
    reason: String,
    evidenceIds: List<String>,
    totp: String,
    token: String,
    idempotencyKey: String,
  ): OrderCancellation = request(
    "orders/$orderId/cancellations/$cancellationId/owner-resolution",
    "POST",
    JSONObject()
      .put("action", action)
      .putOpt("refundAmount", refundAmount)
      .putOpt("supplierExpenseAmount", supplierExpenseAmount)
      .putOpt("faultParty", faultParty)
      .put("ownerReason", reason)
      .put("evidenceIds", org.json.JSONArray(evidenceIds))
      .put("totpToken", totp),
    token,
    idempotencyKey = idempotencyKey,
  ).orderCancellation()

  override suspend fun proposeSupplyQuarantine(
    orderItemId: String,
    reason: String,
    evidence: Map<String, String>,
    imeis: List<String>,
    token: String,
    idempotencyKey: String,
  ): SupplyQuarantineResolution = request(
    "procurement/supply-quarantines/order-items/$orderItemId",
    "POST",
    JSONObject()
      .put("reason", reason)
      .put("evidence", JSONObject(evidence))
      .apply { if (imeis.isNotEmpty()) put("imeis", org.json.JSONArray(imeis)) },
    token,
    idempotencyKey = idempotencyKey,
  ).supplyQuarantineResolution()

  override suspend fun resolveSupplyQuarantine(
    resolutionId: String,
    disposition: String,
    reason: String,
    evidence: Map<String, String>,
    token: String,
    idempotencyKey: String,
  ): SupplyQuarantineResolution = request(
    "procurement/supply-quarantines/$resolutionId/resolve",
    "POST",
    JSONObject().put("disposition", disposition).put("reason", reason).put("evidence", JSONObject(evidence)),
    token,
    idempotencyKey = idempotencyKey,
  ).supplyQuarantineResolution()

  override suspend fun settleReceivable(
    receivableId: String,
    method: String,
    amount: Int,
    txnId: String?,
    shiftId: String?,
    token: String,
    idempotencyKey: String,
  ) {
    request(
      "payments/receivables/$receivableId/settle",
      "POST",
      JSONObject().put("method", method).put("amount", amount).putOpt("txnId", txnId).putOpt("shiftId", shiftId),
      token,
      idempotencyKey = idempotencyKey,
    )
  }

  override suspend fun handOverOrderItem(
    orderId: String,
    itemId: String,
    token: String,
    idempotencyKey: String,
  ) {
    request(
      "orders/$orderId/items/$itemId/handover",
      "POST",
      JSONObject(),
      token,
      idempotencyKey = idempotencyKey,
    )
  }

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

  override suspend fun staffHrWeek(weekStart: String, token: String): StaffHrWeek =
    request("hr/me/week?weekStart=$weekStart", "GET", token = token).staffHrWeek()

  override suspend fun openAttendance(
    scheduleId: String,
    token: String,
    idempotencyKey: String,
  ): StaffHrAttendance = request(
    "hr/me/attendance/open", "POST", JSONObject().put("scheduleId", scheduleId), token,
    idempotencyKey = idempotencyKey,
  ).staffHrAttendance()

  override suspend fun closeAttendance(
    scheduleId: String,
    token: String,
    idempotencyKey: String,
  ): StaffHrAttendance = request(
    "hr/me/attendance/close", "POST", JSONObject().put("scheduleId", scheduleId), token,
    idempotencyKey = idempotencyKey,
  ).staffHrAttendance()

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

  override suspend fun supportTickets(status: String, token: String): List<SupportTicket> =
    requestArray("support/tickets?status=$status", token).let { array ->
      buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).supportTicket()) }
    }

  override suspend fun transitionSupport(ticketId: String, to: String, token: String): SupportTicket =
    request("support/tickets/$ticketId/transition", "PATCH", JSONObject().put("to", to), token).supportTicket()

  override suspend fun escalateSupport(ticketId: String, token: String): SupportTicket =
    request("support/tickets/$ticketId/escalate", "PATCH", JSONObject(), token).supportTicket()

  override suspend fun staffTasks(token: String): List<StaffTask> = requestArray("staff-tasks/mine", token).let { array ->
    buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).staffTask()) }
  }

  override suspend fun updateStaffTask(taskId: String, status: String, token: String): StaffTask =
    request("staff-tasks/mine/$taskId", "PATCH", JSONObject().put("status", status), token).staffTask()

  override suspend fun registerPushToken(token: String, platform: String, deviceId: String, accessToken: String) {
    request(
      "notifications/push-tokens",
      "POST",
      JSONObject().put("token", token).put("platform", platform).put("deviceId", deviceId).put("scope", "staff"),
      accessToken,
    )
  }

  override suspend fun courierDeliveries(token: String): List<CourierDelivery> =
    requestArray("courier/me/deliveries", token).let { array ->
      buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).courierDelivery()) }
    }

  override suspend fun startDelivery(orderId: String, token: String, idempotencyKey: String): CourierDelivery =
    request("courier/orders/$orderId/start", "POST", JSONObject(), token, idempotencyKey = idempotencyKey).courierDelivery()

  override suspend fun completeDelivery(
    orderId: String,
    codAmount: Int,
    reason: String?,
    token: String,
    idempotencyKey: String,
  ): CourierDelivery = request(
    "courier/orders/$orderId/deliver",
    "POST",
    JSONObject().put("codAmount", codAmount).putOpt("reason", reason)
      .put("evidenceIdempotencyKey", idempotencyKey),
    token,
    idempotencyKey = idempotencyKey,
  ).courierDelivery()

  override suspend fun failDelivery(orderId: String, reason: String, token: String, idempotencyKey: String) {
    request(
      "deliveries/$orderId/fail",
      "POST",
      JSONObject().put("reason", reason).put("evidenceIdempotencyKey", idempotencyKey),
      token,
      idempotencyKey = idempotencyKey,
    )
  }

  override suspend fun handoverCourierRun(runId: String, amount: Int, reason: String?, token: String, idempotencyKey: String): CourierRunSummary =
    request(
      "courier/handover",
      "POST",
      JSONObject().put("runId", runId).put("amount", amount).putOpt("reason", reason),
      token,
      idempotencyKey = idempotencyKey,
    ).courierRun()

  override suspend fun posSale(request: PosSaleRequest, token: String): PosSaleResult =
    this.request("pos/sale", "POST", request.toJson(), token).posSaleResult()

  override suspend fun lookupPosUnit(imei: String, token: String): PosUnit =
    request("units/${java.net.URLEncoder.encode(imei, Charsets.UTF_8.name())}", "GET", token = token).posUnit()

  override suspend fun renderPosReceipt(orderId: String, token: String): PosReceipt =
    request("receipts/order/${java.net.URLEncoder.encode(orderId, Charsets.UTF_8.name())}", "GET", token = token).posReceipt()

  override suspend fun posPayments(orderId: String, token: String): List<PosPayment> =
    requestArray("payments?orderId=${java.net.URLEncoder.encode(orderId, Charsets.UTF_8.name())}", token).let { array ->
      buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).posPayment()) }
    }

  override suspend fun posReturns(token: String): List<PosReturn> = requestArray("returns", token).let { array ->
    buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).posReturn()) }
  }

  override suspend fun transitionPosReturn(returnId: String, status: String, token: String, location: String?): PosReturn =
    request(
      "returns/${java.net.URLEncoder.encode(returnId, Charsets.UTF_8.name())}",
      "PATCH",
      JSONObject().put("status", status).apply { if (location != null) put("location", location) },
      token,
    ).posReturn()

  override suspend fun requestPosRefund(paymentId: String, amount: Int, reason: String, token: String): String =
    request(
      "payments/${java.net.URLEncoder.encode(paymentId, Charsets.UTF_8.name())}/refund",
      "POST",
      JSONObject().put("amount", amount).put("reason", reason),
      token,
    ).getString("approvalId")

  override suspend fun exchangePosDevice(
    request: PosExchangeRequest,
    token: String,
    idempotencyKey: String,
  ): PosExchangeResult = this.request(
    "exchanges",
    "POST",
    JSONObject()
      .put("originalOrderId", request.originalOrderId)
      .put("oldImei", request.oldImei)
      .put("newProductId", request.newProductId)
      .put("method", request.method),
    token,
    idempotencyKey = idempotencyKey,
  ).posExchange()

  override suspend fun uploadPosExchangeEvidence(
    exchangeRequestId: String,
    file: StaffEvidenceDraft,
    token: String,
  ): EvidenceAttachment = uploadEvidenceRequest(
    "exchange",
    exchangeRequestId,
    "exchange_condition",
    file.fileName,
    file.mimeType,
    file.bytes,
    token,
  )

  override suspend fun uploadEvidence(
    entityType: String,
    entityId: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
  ): EvidenceAttachment = uploadEvidenceRequest(entityType, entityId, "Фото клиента", fileName, mimeType, bytes, token)

  override suspend fun uploadEvidenceWithKey(
    entityType: String,
    entityId: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
    idempotencyKey: String,
  ): EvidenceAttachment = uploadEvidenceRequest(entityType, entityId, "Фото клиента", fileName, mimeType, bytes, token, idempotencyKey)

  override suspend fun uploadStaffEvidence(
    entityType: String,
    entityId: String,
    label: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
  ): EvidenceAttachment = uploadEvidenceRequest(entityType, entityId, label, fileName, mimeType, bytes, token)

  override suspend fun uploadStaffEvidenceWithKey(
    entityType: String,
    entityId: String,
    label: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
    idempotencyKey: String,
  ): EvidenceAttachment = uploadEvidenceRequest(entityType, entityId, label, fileName, mimeType, bytes, token, idempotencyKey)

  private suspend fun uploadEvidenceRequest(
    entityType: String,
    entityId: String,
    label: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
    idempotencyKey: String = UUID.randomUUID().toString(),
  ): EvidenceAttachment = withContext(Dispatchers.IO) {
    val boundary = "AliStore-${UUID.randomUUID()}"
    val response = executeWithStaffAuthRetry(token) { effectiveToken ->
      val connection = open("evidence/images", "POST")
      try {
        connection.doOutput = true
        connection.setRequestProperty("Authorization", "Bearer $effectiveToken")
        connection.setRequestProperty("Idempotency-Key", idempotencyKey)
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
        connection.rawResponse()
      } finally {
        connection.disconnect()
      }
    }
    if (response.status !in 200..299) throw response.apiException("Ошибка загрузки ${response.status}")
    JSONObject(response.body).getJSONObject("asset").let { EvidenceAttachment(it.getString("key"), it.getString("url")) }
  }

  suspend fun send(mutation: PendingMutation, token: String?): Int {
    return sendResponse(mutation, token).status
  }

  suspend fun sendResponse(mutation: PendingMutation, token: String?): RawApiResponse = withContext(Dispatchers.IO) {
    executeWithStaffAuthRetry(token) { effectiveToken ->
      rawJsonRequest(
        mutation.endpoint,
        mutation.method,
        mutation.body.takeIf(String::isNotEmpty),
        effectiveToken,
        mutation.idempotencyKey,
      )
    }
  }

  private suspend fun request(
    path: String,
    method: String,
    body: JSONObject? = null,
    token: String? = null,
    allowEmpty: Boolean = false,
    idempotencyKey: String? = null,
    retryStaffAuth: Boolean = true,
  ): JSONObject = withContext(Dispatchers.IO) {
    val response = executeWithStaffAuthRetry(token, retryStaffAuth) { effectiveToken ->
      rawJsonRequest(path, method, body?.toString(), effectiveToken, idempotencyKey)
    }
    if (response.status !in 200..299) throw response.apiException("Ошибка сервера ${response.status}")
    if (response.body.isBlank() && allowEmpty) JSONObject() else JSONObject(response.body)
  }

  private suspend fun requestArray(path: String, token: String) = withContext(Dispatchers.IO) {
    val response = executeWithStaffAuthRetry(token) { effectiveToken ->
      rawJsonRequest(path, "GET", token = effectiveToken)
    }
    if (response.status !in 200..299) throw response.apiException("Ошибка сервера ${response.status}")
    org.json.JSONArray(response.body)
  }

  private suspend fun requestObjectOrNull(path: String, token: String): JSONObject? = withContext(Dispatchers.IO) {
    val response = executeWithStaffAuthRetry(token) { effectiveToken ->
      rawJsonRequest(path, "GET", token = effectiveToken)
    }
    if (response.status !in 200..299) throw response.apiException("Ошибка сервера ${response.status}")
    if (response.body.isBlank() || response.body == "null") null else JSONObject(response.body)
  }

  private suspend fun executeWithStaffAuthRetry(
    token: String?,
    retryStaffAuth: Boolean = true,
    attempt: (effectiveToken: String?) -> RawApiResponse,
  ): RawApiResponse {
    val effectiveToken = if (!token.isNullOrBlank() && staffUnauthorizedHandler != null) {
      currentStaffAccessToken ?: token
    } else token
    val response = attempt(effectiveToken)
    if (response.status != 401 || !retryStaffAuth || effectiveToken.isNullOrBlank()) return response
    val renewed = staffUnauthorizedHandler?.invoke(effectiveToken)
    if (renewed.isNullOrBlank() || renewed == effectiveToken) return response
    currentStaffAccessToken = renewed
    return attempt(renewed)
  }

  private fun rawJsonRequest(
    path: String,
    method: String,
    body: String? = null,
    token: String? = null,
    idempotencyKey: String? = null,
  ): RawApiResponse {
    val connection = open(path, method)
    try {
      connection.setRequestProperty("Content-Type", "application/json")
      if (!token.isNullOrBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
      if (!idempotencyKey.isNullOrBlank()) connection.setRequestProperty("Idempotency-Key", idempotencyKey)
      if (body != null) {
        connection.doOutput = true
        connection.outputStream.use { it.write(body.toByteArray()) }
      }
      return connection.rawResponse()
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

data class RawApiResponse(val status: Int, val body: String)

private fun HttpURLConnection.rawResponse(): RawApiResponse {
  val status = responseCode
  val stream = if (status in 200..299) inputStream else errorStream
  return RawApiResponse(status, stream?.bufferedReader()?.use { it.readText() }.orEmpty())
}

private fun RawApiResponse.apiException(fallback: String): ApiException {
  val error = runCatching { JSONObject(body) }.getOrNull()
  val message = error?.optString("message").orEmpty()
  return ApiException(
    status,
    message.ifBlank { fallback },
    error?.optString("code")?.takeIf(String::isNotBlank),
  )
}

internal fun JSONObject.checkoutOptions() = CheckoutOptions(
  pickupPoints = getJSONArray("pickupPoints").let { points ->
    buildList {
      for (index in 0 until points.length()) {
        val point = points.getJSONObject(index)
        add(StorePoint(point.getString("id"), point.getString("code"), point.getString("name"), point.getString("address"), point.getString("inventoryLocation"), point.getString("hours")))
      }
    }
  },
  deliveryZones = optJSONArray("deliveryZones")?.let { zones ->
    buildList {
      for (index in 0 until zones.length()) add(zones.getJSONObject(index).deliveryZone())
    }
  }.orEmpty(),
)

internal fun JSONObject.deliveryZone() = DeliveryZone(
  id = getString("id"),
  code = optString("code"),
  name = getString("name"),
  fee = optInt("fee"),
  slots = optJSONArray("slots")?.let { slots ->
    buildList {
      for (index in 0 until slots.length()) add(slots.getJSONObject(index).deliverySlot())
    }
  }.orEmpty(),
)

internal fun JSONObject.deliverySlot() = DeliverySlot(
  id = getString("id"),
  startsAt = getString("startsAt"),
  endsAt = getString("endsAt"),
  remaining = optInt("remaining"),
  available = optBoolean("available", true),
)

internal fun JSONObject.promotionQuote() = PromotionQuote(
  code = getString("code"),
  name = optString("name"),
  subtotal = optInt("subtotal"),
  eligibleSubtotal = optInt("eligibleSubtotal"),
  discount = getInt("discount"),
)

private fun JSONObject.tokens() = AuthTokens(getString("accessToken"), getString("refreshToken"))

private fun JSONObject.socialAuthResult(): SocialAuthResult = when (getString("status")) {
  "authenticated" -> SocialAuthResult.Authenticated(tokens())
  "enrollment_required" -> SocialAuthResult.EnrollmentRequired(
    enrollmentToken = getString("enrollmentToken"),
    expiresInSeconds = getInt("expiresIn"),
  )
  else -> throw IllegalArgumentException("Неизвестный ответ Google Sign-In")
}

private fun JSONObject.putOptional(key: String, value: String?): JSONObject =
  apply { value?.let { put(key, it) } }

internal fun otpVerificationPayload(phone: String, code: String, challengeId: String?): JSONObject =
  JSONObject().put("phone", phone).put("code", code).putOptional("challengeId", challengeId)

internal fun googleLoginPayload(identityToken: String, nonce: String): JSONObject =
  JSONObject().put("identityToken", identityToken).put("nonce", nonce)

internal fun socialEnrollmentPayload(
  enrollmentToken: String,
  phone: String,
  code: String,
  challengeId: String?,
): JSONObject = JSONObject()
  .put("enrollmentToken", enrollmentToken)
  .put("phone", phone)
  .put("code", code)
  .putOptional("challengeId", challengeId)

internal fun staffLoginPayload(username: String, password: String, totp: String?): JSONObject =
  JSONObject()
    .put("username", username)
    .put("password", password)
    .putOptional("totp", totp?.trim()?.takeIf(String::isNotBlank))

internal fun emailOtpVerificationPayload(email: String, code: String, challengeId: String?): JSONObject =
  JSONObject().put("email", email).put("code", code).putOptional("challengeId", challengeId)

private fun JSONObject.emailChallenge() = EmailOtpChallenge(
  challengeId = optString("challengeId"),
  devCode = optString("devCode").takeIf(String::isNotBlank),
)

private fun JSONObject.product(): Product {
  val attrs = optJSONObject("attrs")
  val media = attrs?.optJSONArray("media")?.let { array ->
    buildList {
      for (index in 0 until array.length()) add(array.optString(index))
    }
  }.orEmpty()
  val imageUrls = buildList {
    attrs?.optString("imageUrl")?.takeIf(String::isNotBlank)?.let(::add)
    attrs?.optString("image")?.takeIf(String::isNotBlank)?.let(::add)
    addAll(media.filter(String::isNotBlank))
  }.distinct()
  return Product(
    id = getString("id"),
    sku = getString("sku"),
    name = getString("name"),
    price = getInt("price"),
    category = getString("category"),
    availableUnits = getInt("availableUnits"),
    imageUrls = imageUrls,
    supplyMode = nullableString("supplyMode"),
    orderable = if (has("orderable")) getBoolean("orderable") else null,
    availabilityKind = nullableString("availabilityKind"),
    leadTimeDays = if (has("leadTimeDays") && !isNull("leadTimeDays")) getInt("leadTimeDays") else null,
    estimatedDeliveryDate = nullableString("estimatedDeliveryDate"),
  )
}

private fun JSONObject.catalogProductDetail() = CatalogProductDetail(
  product = getJSONObject("product").product(),
  variants = optJSONArray("variants")?.let { array ->
    buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).product()) }
  }.orEmpty(),
  related = optJSONArray("related")?.let { array ->
    buildList { for (index in 0 until array.length()) add(array.getJSONObject(index).product()) }
  }.orEmpty(),
)

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
        add(CustomerOrderItem(
          sku = item.getString("sku"),
          qty = item.getInt("qty"),
          price = item.getInt("price"),
          imei = item.nullableString("imei"),
          id = item.nullableString("id"),
          supplyModeSnapshot = item.nullableString("supplyModeSnapshot"),
          supplyLeadDaysSnapshot = if (item.has("supplyLeadDaysSnapshot") && !item.isNull("supplyLeadDaysSnapshot")) item.getInt("supplyLeadDaysSnapshot") else null,
          promisedDate = item.nullableString("promisedDate"),
          fulfillmentStatus = item.nullableString("fulfillmentStatus"),
          readyAt = item.nullableString("readyAt"),
          handedOverAt = item.nullableString("handedOverAt"),
        ))
      }
    }
  }.orEmpty(),
  createdAt = nullableString("createdAt"),
  channel = optString("channel", "web"),
  paymentSchedule = optJSONArray("paymentSchedule")?.let { array ->
    buildList {
      for (index in 0 until array.length()) {
        val receivable = array.getJSONObject(index)
        add(OrderReceivable(
          id = receivable.getString("id"),
          orderItemId = receivable.nullableString("orderItemId"),
          kind = receivable.getString("kind"),
          amount = receivable.getInt("amount"),
          settledAmount = receivable.getInt("settledAmount"),
          status = receivable.getString("status"),
          dueAt = receivable.nullableString("dueAt"),
        ))
      }
    }
  }.orEmpty(),
  initialDue = if (has("initialDue") && !isNull("initialDue")) getInt("initialDue") else null,
  balanceDue = if (has("balanceDue") && !isNull("balanceDue")) getInt("balanceDue") else null,
)

private fun JSONObject.staffSession() = StaffSession(
  accessToken = getString("accessToken"), staffId = getString("staffId"), username = getString("username"),
  role = getString("role"), totpEnabled = optBoolean("totpEnabled"),
  point = nullableString("point"), capabilities = stringSet("capabilities"),
  refreshToken = nullableString("refreshToken"),
)

private fun JSONObject.staffPrincipal() = StaffPrincipal(
  id = getString("id"), username = getString("username"), role = getString("role"), active = getBoolean("active"),
  totpEnabled = optBoolean("totpEnabled"), type = optString("typ", "staff"),
  point = nullableString("point"), capabilities = stringSet("capabilities"),
)

internal fun JSONObject.orderCancellationPreview() = OrderCancellationPreview(
  orderId = getString("orderId"),
  canCancel = optBoolean("canCancel"),
  blockedReason = nullableString("blockedReason"),
  policy = getString("policy"),
  purchaseOrderSent = optBoolean("purchaseOrderSent"),
  depositPaid = optInt("depositPaid"),
  estimatedRefundAmount = optInt("estimatedRefundAmount"),
  supplierExpenseDeduction = optInt("supplierExpenseDeduction"),
  ownerReviewRequired = optBoolean("ownerReviewRequired"),
  note = optString("note"),
  requestEnabled = optBoolean("requestEnabled"),
  automaticRefundEnabled = optBoolean("automaticRefundEnabled"),
)

internal fun JSONObject.orderCancellation() = OrderCancellation(
  id = getString("id"),
  orderId = getString("orderId"),
  status = getString("status"),
  policySnapshot = getString("policySnapshot"),
  requestedRefundAmount = optInt("requestedRefundAmount"),
  approvedRefundAmount = if (has("approvedRefundAmount") && !isNull("approvedRefundAmount")) getInt("approvedRefundAmount") else null,
  customerReason = optString("customerReason"),
  ownerReason = nullableString("ownerReason"),
  refundId = nullableString("refundId"),
)

internal fun JSONObject.ownerCancellationPreview() = OwnerCancellationPreview(
  id = getString("id"),
  orderId = getString("orderId"),
  status = getString("status"),
  depositPaidSnapshot = optInt("depositPaidSnapshot"),
  requestedRefundAmount = optInt("requestedRefundAmount"),
  canResolve = optBoolean("canResolve"),
  fullRefundAmount = optInt("fullRefundAmount"),
)

internal fun JSONObject.supplyOperations(): SupplyOperationsResponse {
  val flags = getJSONObject("flags")
  val capabilities = getJSONObject("capabilities")
  val countsJson = getJSONObject("counts")
  val queuesJson = getJSONObject("queues")
  val counts = countsJson.keys().asSequence().associateWith { countsJson.optInt(it) }
  val queues = queuesJson.keys().asSequence().associateWith { key ->
    val rows = queuesJson.optJSONArray(key)
    buildList {
      if (rows != null) for (index in 0 until rows.length()) {
        val row = rows.getJSONObject(index)
        add(SupplyOperationRow(
          id = row.getString("id"),
          queue = row.getString("queue"),
          orderId = row.getString("orderId"),
          purchaseOrderId = row.nullableString("purchaseOrderId"),
          purchaseOrderNumber = row.nullableString("purchaseOrderNumber"),
          status = row.getString("status"),
          amount = if (row.has("amount") && !row.isNull("amount")) row.getInt("amount") else null,
          expectedAt = row.nullableString("expectedAt"),
          sku = row.nullableString("sku"),
          quantity = if (row.has("quantity") && !row.isNull("quantity")) row.getInt("quantity") else null,
          detailHref = row.optString("detailHref"),
        ))
      }
    }
  }
  return SupplyOperationsResponse(
    flags = SupplyOperationFlags(
      checkoutEnabled = flags.optBoolean("checkoutEnabled"),
      cancellationEnabled = flags.optBoolean("cancellationEnabled"),
      autoRefundEnabled = flags.optBoolean("autoRefundEnabled"),
      ownerResolutionEnabled = flags.optBoolean("ownerResolutionEnabled"),
    ),
    capabilities = SupplyOperationCapabilities(
      financialQueuesVisible = capabilities.optBoolean("financialQueuesVisible"),
      ownerResolutionAvailable = capabilities.optBoolean("ownerResolutionAvailable"),
    ),
    counts = counts,
    queues = queues,
  )
}

internal fun JSONObject.supplyQuarantineResolution() = SupplyQuarantineResolution(
  id = getString("id"),
  orderLineSupplyId = getString("orderLineSupplyId"),
  productId = getString("productId"),
  storePointId = getString("storePointId"),
  inventoryLocationSnapshot = getString("inventoryLocationSnapshot"),
  trackingModeSnapshot = getString("trackingModeSnapshot"),
  quarantinedQty = getInt("quarantinedQty"),
  imeis = optJSONArray("imeis")?.let { array ->
    buildList { for (index in 0 until array.length()) add(array.getString(index)) }
  }.orEmpty(),
  status = getString("status"),
  disposition = nullableString("disposition"),
  inventoryMovementId = nullableString("inventoryMovementId"),
)

private fun JSONObject.courierDelivery(): CourierDelivery {
  val payments = optJSONArray("payments")
  var paid = 0
  if (payments != null) for (index in 0 until payments.length()) payments.getJSONObject(index).let { payment ->
    if (payment.optString("status") in setOf("received", "reconciled")) paid += payment.optInt("amount").coerceAtLeast(0)
  }
  return CourierDelivery(
    id = getString("id"),
    status = getString("status"),
    total = getInt("total"),
    address = nullableString("deliveryAddress"),
    slot = nullableString("deliverySlot"),
    customer = optJSONObject("customer")?.let { CourierCustomer(it.optString("name"), it.optString("phone")) }
      ?: CourierCustomer("Клиент", ""),
    items = optJSONArray("items")?.let { array -> buildList {
      for (index in 0 until array.length()) array.getJSONObject(index).let { item ->
        add(CustomerOrderItem(
          sku = item.getString("sku"),
          qty = item.getInt("qty"),
          price = item.getInt("price"),
          imei = item.nullableString("imei"),
          id = item.nullableString("id"),
          supplyModeSnapshot = item.nullableString("supplyModeSnapshot"),
          supplyLeadDaysSnapshot = if (item.has("supplyLeadDaysSnapshot") && !item.isNull("supplyLeadDaysSnapshot")) item.getInt("supplyLeadDaysSnapshot") else null,
          promisedDate = item.nullableString("promisedDate"),
          fulfillmentStatus = item.nullableString("fulfillmentStatus"),
          readyAt = item.nullableString("readyAt"),
          handedOverAt = item.nullableString("handedOverAt"),
        ))
      }
    } }.orEmpty(),
    outstandingCod = (getInt("total") - paid).coerceAtLeast(0),
    run = optJSONObject("courierRun")?.courierRun(),
  )
}

private fun JSONObject.courierRun() = CourierRunSummary(
  id = getString("id"),
  codTotal = getInt("codTotal"),
  collectedTotal = getInt("collectedTotal"),
  handedOver = getBoolean("handedOver"),
)

internal fun PosSaleRequest.toJson() = JSONObject()
  .put("point", point)
  .put("lines", org.json.JSONArray().apply { lines.forEach { line ->
    put(JSONObject().put("productId", line.productId).put("sku", line.sku).put("price", line.price).put("qty", line.qty).apply {
      line.imei?.let { put("imei", it) }
    })
  } })
  .put("payments", org.json.JSONArray().apply { tenders.forEach { tender ->
    put(JSONObject().put("method", tender.method).put("amount", tender.amount))
  } })
  .put("discountPct", discountPct)
  .put("clientSaleId", clientSaleId)
  .apply {
    approvalId?.let { put("approvalId", it) }
    reason?.let { put("reason", it) }
  }

private fun JSONObject.posSaleResult(): PosSaleResult = if (optBoolean("pendingApproval")) {
  PosSaleResult.ApprovalRequired(getString("approvalId"), optString("reason", "discount"))
} else {
  PosSaleResult.Completed(
    orderId = getString("orderId"), receiptNo = getString("receiptNo"), total = getInt("total"),
    status = getString("status"), shiftId = getString("shiftId"),
    imeis = optJSONArray("imeis")?.let { values -> buildList { for (index in 0 until values.length()) add(values.getString(index)) } }.orEmpty(),
  )
}

private fun JSONObject.posUnit() = PosUnit(
  imei = getString("imei"), productId = getString("productId"), status = getString("status"),
  sku = getString("sku"), product = getString("product"), price = getInt("price"),
)

private fun JSONObject.posReceipt() = PosReceipt(
  markup = getString("markup"), svg = getString("svg"), escposBase64 = getString("escposBase64"),
)

private fun JSONObject.posPayment() = PosPayment(
  id = getString("id"), orderId = nullableString("orderId"), amount = getInt("amount"),
  method = getString("method"), status = getString("status"),
)

private fun JSONObject.posReturn() = PosReturn(
  id = getString("id"), orderId = getString("orderId"), reason = getString("reason"),
  status = getString("status"), createdAt = getString("createdAt"),
)

private fun JSONObject.posExchange() = PosExchangeResult(
  exchangeRequestId = getString("exchangeRequestId"), approvalId = getString("approvalId"),
  status = getString("status"), oldImei = getString("oldImei"), newImei = getString("newImei"),
  surchargeAmount = getInt("surchargeAmount"), evidenceRequired = getBoolean("evidenceRequired"),
  expiresAt = getString("expiresAt"), idempotent = getBoolean("idempotent"),
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

private fun JSONObject.staffHrWeek() = StaffHrWeek(
  weekStart = getString("weekStart"),
  weekEnd = getString("weekEnd"),
  point = nullableString("point"),
  schedules = getJSONArray("schedules").let { array -> buildList {
    for (index in 0 until array.length()) add(array.getJSONObject(index).staffHrSchedule())
  } },
)

private fun JSONObject.staffHrSchedule() = StaffHrSchedule(
  id = getString("id"), staffId = getString("staffId"), point = getString("point"),
  shiftDate = getString("shiftDate"), startsAt = getString("startsAt"), endsAt = getString("endsAt"),
  cancelledAt = nullableString("cancelledAt"),
  attendance = optJSONObject("attendance")?.staffHrAttendance(),
)

private fun JSONObject.staffHrAttendance() = StaffHrAttendance(
  id = getString("id"), scheduleId = getString("scheduleId"), staffId = getString("staffId"),
  point = getString("point"), checkedInAt = getString("checkedInAt"), checkedOutAt = nullableString("checkedOutAt"),
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

internal fun JSONObject.staffTask() = StaffTask(
  id = getString("id"), title = getString("title"), description = nullableString("description"),
  status = getString("status"), priority = getString("priority"), assigneeId = getString("assigneeId"),
  dueAt = nullableString("dueAt"), relatedType = nullableString("relatedType"), relatedId = nullableString("relatedId"),
  createdAt = getString("createdAt"), completedAt = nullableString("completedAt"),
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

private fun JSONObject.customerTradeIn() = CustomerTradeIn(
  id = getString("id"),
  customerId = getString("customerId"),
  model = getString("model"),
  imei = nullableString("imei"),
  grade = getString("grade"),
  price = getInt("price"),
  contractId = nullableString("contractId"),
  sellerPassportMasked = getString("sellerPassportMasked"),
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

private fun JSONObject.stringSet(key: String): Set<String> = optJSONArray(key)?.let { array ->
  buildSet {
    for (index in 0 until array.length()) {
      array.optString(index).takeIf(String::isNotBlank)?.let(::add)
    }
  }
}.orEmpty()

/**
 * `code` — машинный код домена (`DomainError.code` на сервере). Он есть далеко
 * не у всех ответов, поэтому по умолчанию null, а текст для человека собирается
 * уже в UI-слое (см. [emailAuthMessage]).
 */
class ApiException(val status: Int, override val message: String, val code: String? = null) : Exception(message)

package kg.alistore.core

interface PosGateway {
  suspend fun posSale(request: PosSaleRequest, token: String): PosSaleResult
  suspend fun lookupPosUnit(imei: String, token: String): PosUnit
  suspend fun renderPosReceipt(orderId: String, token: String): PosReceipt
  suspend fun posPayments(orderId: String, token: String): List<PosPayment>
  suspend fun posReturns(token: String): List<PosReturn>
  suspend fun transitionPosReturn(returnId: String, status: String, token: String, location: String? = null): PosReturn
  suspend fun requestPosRefund(paymentId: String, amount: Int, reason: String, token: String): String
  suspend fun exchangePosDevice(request: PosExchangeRequest, token: String, idempotencyKey: String): PosExchangeResult
  suspend fun uploadPosExchangeEvidence(
    exchangeRequestId: String,
    file: StaffEvidenceDraft,
    token: String,
  ): EvidenceAttachment = error("POS exchange evidence is not configured")
}

package kg.alistore.core

interface SupplyParityGateway {
  suspend fun cancellationPreview(orderId: String, token: String): OrderCancellationPreview
  suspend fun currentCancellation(orderId: String, token: String): OrderCancellation?
  suspend fun requestCancellation(orderId: String, reason: String, token: String, idempotencyKey: String): OrderCancellation
  suspend fun supplyOperations(token: String): SupplyOperationsResponse
  suspend fun ownerCancellationPreview(orderId: String, cancellationId: String, token: String): OwnerCancellationPreview
  suspend fun resolveOwnerCancellation(
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
  ): OrderCancellation
  suspend fun proposeSupplyQuarantine(
    orderItemId: String,
    reason: String,
    evidence: Map<String, String>,
    imeis: List<String>,
    token: String,
    idempotencyKey: String,
  ): SupplyQuarantineResolution
  suspend fun resolveSupplyQuarantine(
    resolutionId: String,
    disposition: String,
    reason: String,
    evidence: Map<String, String>,
    token: String,
    idempotencyKey: String,
  ): SupplyQuarantineResolution
  suspend fun settleReceivable(
    receivableId: String,
    method: String,
    amount: Int,
    txnId: String?,
    shiftId: String?,
    token: String,
    idempotencyKey: String,
  )
  suspend fun handOverOrderItem(orderId: String, itemId: String, token: String, idempotencyKey: String)
}

package kg.alistore.core

interface CourierGateway {
  suspend fun courierDeliveries(token: String): List<CourierDelivery>
  suspend fun startDelivery(orderId: String, token: String, idempotencyKey: String): CourierDelivery
  suspend fun completeDelivery(orderId: String, codAmount: Int, reason: String?, token: String, idempotencyKey: String): CourierDelivery
  suspend fun failDelivery(orderId: String, reason: String, token: String, idempotencyKey: String)
  /** Legacy overload retained for queued mutations created before reason was added. */
  suspend fun handoverCourierRun(runId: String, amount: Int, token: String, idempotencyKey: String): CourierRunSummary =
    handoverCourierRun(runId, amount, null, token, idempotencyKey)
  suspend fun handoverCourierRun(runId: String, amount: Int, reason: String?, token: String, idempotencyKey: String): CourierRunSummary =
    handoverCourierRun(runId, amount, token, idempotencyKey)
}

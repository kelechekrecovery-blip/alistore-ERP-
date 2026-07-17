package kg.alistore.core

interface CourierGateway {
  suspend fun courierDeliveries(token: String): List<CourierDelivery>
  suspend fun startDelivery(orderId: String, token: String, idempotencyKey: String): CourierDelivery
  suspend fun completeDelivery(orderId: String, codAmount: Int, reason: String?, token: String, idempotencyKey: String): CourierDelivery
  suspend fun failDelivery(orderId: String, reason: String, token: String, idempotencyKey: String)
  suspend fun handoverCourierRun(runId: String, amount: Int, token: String, idempotencyKey: String): CourierRunSummary
}

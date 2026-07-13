package kg.alistore.core

interface StaffOperationsGateway {
  suspend fun currentShift(token: String): CashShift?
  suspend fun openShift(request: OpenShiftRequest, token: String, idempotencyKey: String): CashShift
  suspend fun closeShift(shiftId: String, request: CloseShiftRequest, token: String, idempotencyKey: String): CashShift
  suspend fun staffOrders(status: String, token: String): List<CustomerOrder>
  suspend fun fulfillOrder(orderId: String, token: String): CustomerOrder
  suspend fun transitionOrder(orderId: String, to: String, token: String): CustomerOrder
}

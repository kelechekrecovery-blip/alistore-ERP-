package kg.alistore.core

interface StaffOperationsGateway {
  suspend fun currentShift(token: String): CashShift?
  suspend fun openShift(request: OpenShiftRequest, token: String, idempotencyKey: String): CashShift
  suspend fun closeShift(shiftId: String, request: CloseShiftRequest, token: String, idempotencyKey: String): CashShift
  suspend fun staffHrWeek(weekStart: String, token: String): StaffHrWeek
  suspend fun openAttendance(scheduleId: String, token: String, idempotencyKey: String): StaffHrAttendance
  suspend fun closeAttendance(scheduleId: String, token: String, idempotencyKey: String): StaffHrAttendance
  suspend fun staffOrders(status: String, token: String): List<CustomerOrder>
  suspend fun fulfillOrder(orderId: String, token: String): CustomerOrder
  suspend fun transitionOrder(orderId: String, to: String, token: String): CustomerOrder
}

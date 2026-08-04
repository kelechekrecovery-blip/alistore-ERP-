package kg.alistore.core

import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StaffAttendanceManagerTest {
  @Test
  fun `network failure queues exact attendance body and stable key`() = runTest {
    val queue = AttendanceRecordingQueue()
    val manager = StaffAttendanceManager(FakeStaffAttendanceGateway(IOException("offline")), queue)

    val result = manager.open("schedule-1", "staff-token", "attendance-open-key")

    assertTrue(result is StaffAttendanceResult.Queued)
    assertEquals("hr/me/attendance/open", queue.endpoint)
    assertEquals("{\"scheduleId\":\"schedule-1\"}", queue.body)
    assertEquals("attendance-open-key", queue.key)
  }

  @Test
  fun `ownership conflict is never queued`() = runTest {
    val queue = AttendanceRecordingQueue()
    val manager = StaffAttendanceManager(FakeStaffAttendanceGateway(ApiException(403, "forbidden")), queue)

    val error = runCatching { manager.close("foreign", "staff-token", "close-key") }.exceptionOrNull()

    assertTrue(error is ApiException)
    assertEquals(null, queue.endpoint)
  }
}

private class AttendanceRecordingQueue : MutationQueue {
  var endpoint: String? = null
  var body: String? = null
  var key: String? = null

  override fun enqueue(endpoint: String, method: String, body: String, idempotencyKey: String): String {
    this.endpoint = endpoint
    this.body = body
    this.key = idempotencyKey
    return "queued-attendance-1"
  }
}

private class FakeStaffAttendanceGateway(private val failure: Exception) : StaffOperationsGateway {
  override suspend fun currentShift(token: String): CashShift? = null
  override suspend fun openShift(request: OpenShiftRequest, token: String, idempotencyKey: String) = throw failure
  override suspend fun closeShift(shiftId: String, request: CloseShiftRequest, token: String, idempotencyKey: String) = throw failure
  override suspend fun staffHrWeek(weekStart: String, token: String) = StaffHrWeek(weekStart, weekStart, null, emptyList())
  override suspend fun openAttendance(scheduleId: String, token: String, idempotencyKey: String): StaffHrAttendance = throw failure
  override suspend fun closeAttendance(scheduleId: String, token: String, idempotencyKey: String): StaffHrAttendance = throw failure
  override suspend fun staffOrders(status: String, token: String): List<CustomerOrder> = emptyList()
  override suspend fun fulfillOrder(orderId: String, token: String) = throw failure
  override suspend fun transitionOrder(orderId: String, to: String, token: String) = throw failure
}

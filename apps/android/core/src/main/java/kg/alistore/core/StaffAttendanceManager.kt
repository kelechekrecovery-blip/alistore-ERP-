package kg.alistore.core

import java.io.IOException
import org.json.JSONObject

sealed interface StaffAttendanceResult {
  data class Sent(val attendance: StaffHrAttendance) : StaffAttendanceResult
  data class Queued(val mutationId: String) : StaffAttendanceResult
}

class StaffAttendanceManager(
  private val gateway: StaffOperationsGateway,
  private val queue: MutationQueue,
) {
  suspend fun open(scheduleId: String, token: String, key: String): StaffAttendanceResult = submit(
    action = "open", scheduleId = scheduleId, key = key,
    online = { gateway.openAttendance(scheduleId, token, key) },
  )

  suspend fun close(scheduleId: String, token: String, key: String): StaffAttendanceResult = submit(
    action = "close", scheduleId = scheduleId, key = key,
    online = { gateway.closeAttendance(scheduleId, token, key) },
  )

  private suspend fun submit(
    action: String,
    scheduleId: String,
    key: String,
    online: suspend () -> StaffHrAttendance,
  ): StaffAttendanceResult {
    require(key.isNotBlank()) { "Idempotency key is required" }
    return try {
      StaffAttendanceResult.Sent(online())
    } catch (error: Exception) {
      if (error is ApiException && error.status < 500) throw error
      if (error !is IOException && error !is ApiException) throw error
      StaffAttendanceResult.Queued(queue.enqueue(
        "hr/me/attendance/$action", "POST",
        JSONObject().put("scheduleId", scheduleId).toString(), key,
      ))
    }
  }
}

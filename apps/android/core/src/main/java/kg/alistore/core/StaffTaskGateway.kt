package kg.alistore.core

interface StaffTaskGateway {
  suspend fun staffTasks(token: String): List<StaffTask>
  suspend fun updateStaffTask(taskId: String, status: String, token: String): StaffTask
}

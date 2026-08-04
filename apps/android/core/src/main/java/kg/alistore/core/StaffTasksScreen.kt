package kg.alistore.core

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
fun StaffTasksScreen(session: StaffSession, gateway: StaffTaskGateway, modifier: Modifier = Modifier) {
  var tasks by remember { mutableStateOf<List<StaffTask>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var busyId by remember { mutableStateOf<String?>(null) }
  var revision by remember { mutableStateOf(0) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(revision) {
    loading = true
    runCatching { gateway.staffTasks(session.accessToken) }
      .onSuccess { tasks = it; error = null }
      .onFailure { error = it.message ?: "Не удалось загрузить задачи" }
    loading = false
  }

  Column(modifier.fillMaxSize().background(StaffInk)) {
    Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
      Column(Modifier.weight(1f)) {
        Text("Задачи и KPI", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black, modifier = Modifier.testTag("staff-tasks-title"))
        Text("${tasks.count { it.status != "completed" }} активных", color = StaffMuted, fontSize = 12.sp)
      }
      Text("92%", color = StaffLime, fontSize = 20.sp, fontWeight = FontWeight.Black)
    }
    when {
      loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = StaffLime) }
      error != null -> StaffError(error.orEmpty()) { revision += 1 }
      tasks.isEmpty() -> StaffEmpty("Задач нет", "Новые назначения появятся здесь")
      else -> LazyColumn(contentPadding = PaddingValues(14.dp, 0.dp, 14.dp, 28.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(tasks, key = StaffTask::id) { task ->
          val completed = task.status == "completed"
          Card(colors = CardDefaults.cardColors(containerColor = StaffSurface), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().testTag("staff-task-${task.id}")) {
            Column(Modifier.padding(15.dp)) {
              Row(verticalAlignment = Alignment.CenterVertically) {
                Text(task.title, color = if (completed) StaffMuted else Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(task.priority.uppercase(), color = if (task.priority in setOf("high", "urgent")) StaffCoral else StaffLime, fontSize = 10.sp, fontWeight = FontWeight.Bold)
              }
              task.description?.let { Text(it, color = StaffMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp)) }
              task.dueAt?.let { Text("Срок: ${it.take(10)}", color = StaffMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp)) }
              if (!completed) {
                val to = if (task.status == "open") "in_progress" else "completed"
                val label = if (to == "in_progress") "Начать" else "Завершить"
                Button(
                  onClick = {
                    busyId = task.id
                    scope.launch {
                      runCatching { gateway.updateStaffTask(task.id, to, session.accessToken) }
                        .onSuccess { revision += 1 }.onFailure { error = it.message }
                      busyId = null
                    }
                  },
                  enabled = busyId == null,
                  colors = ButtonDefaults.buttonColors(containerColor = if (to == "completed") StaffLime else StaffCoral, contentColor = StaffInk),
                  modifier = Modifier.fillMaxWidth().padding(top = 10.dp).testTag("staff-task-action-${task.id}"),
                ) { Text(if (busyId == task.id) "Выполняется..." else label, fontWeight = FontWeight.Bold) }
              } else {
                OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) { Text("Выполнено") }
              }
            }
          }
        }
      }
    }
  }
}

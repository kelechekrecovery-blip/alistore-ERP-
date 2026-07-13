package kg.alistore.core

import android.graphics.Bitmap
import android.content.ContentValues
import android.provider.MediaStore
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class StaffTasksScreenTest {
  @get:Rule val compose = createComposeRule()
  private val session = StaffSession("staff-token", "staff-1", "seller", "seller", false)

  @Test fun taskProgressionUsesStoredStaffTokenAndReloads() {
    val gateway = UiTaskGateway()
    compose.setContent { MaterialTheme { StaffTasksScreen(session, gateway) } }
    compose.waitUntil(5_000) { gateway.loads == 1 }
    compose.onNodeWithText("Обновить ценники").assertIsDisplayed()
    if (InstrumentationRegistry.getArguments().getString("visual") == "true") {
      val context = InstrumentationRegistry.getInstrumentation().context
      val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "staff-tasks.png")
        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
        put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/AliStore")
      })!!
      context.contentResolver.openOutputStream(uri)!!.use { output ->
        compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, output)
      }
      Thread.sleep(10_000)
    }
    compose.onNodeWithTag("staff-task-action-task-1").performClick()
    compose.waitUntil(5_000) { gateway.updates.size == 1 && gateway.loads >= 2 }
    compose.onNodeWithText("Завершить").assertIsDisplayed().performClick()
    compose.waitUntil(5_000) { gateway.updates.size == 2 && gateway.loads >= 3 }

    assertEquals(listOf(Triple("task-1", "in_progress", "staff-token"), Triple("task-1", "completed", "staff-token")), gateway.updates)
    assertEquals(listOf("staff-token", "staff-token", "staff-token"), gateway.tokens)
    compose.onNodeWithText("Выполнено").assertIsDisplayed()
  }

  @Test fun emptyStateIsExplicit() {
    val gateway = UiTaskGateway(empty = true)
    compose.setContent { MaterialTheme { StaffTasksScreen(session, gateway) } }
    compose.waitUntil(5_000) { gateway.loads == 1 }
    compose.onNodeWithText("Задач нет").assertIsDisplayed()
  }
}

private class UiTaskGateway(private val empty: Boolean = false) : StaffTaskGateway {
  var loads = 0
  val tokens = mutableListOf<String>()
  val updates = mutableListOf<Triple<String, String, String>>()
  private var status = "open"

  override suspend fun staffTasks(token: String): List<StaffTask> {
    loads += 1
    tokens += token
    return if (empty) emptyList() else listOf(task())
  }

  private fun task() = StaffTask(
      "task-1", "Обновить ценники", "Витрина телефонов", status, "high", "staff-1",
      "2026-07-14T10:00:00Z", null, null, "2026-07-13T10:00:00Z",
      if (status == "completed") "2026-07-13T11:00:00Z" else null,
    )

  override suspend fun updateStaffTask(taskId: String, status: String, token: String): StaffTask {
    updates += Triple(taskId, status, token)
    this.status = status
    return task()
  }
}

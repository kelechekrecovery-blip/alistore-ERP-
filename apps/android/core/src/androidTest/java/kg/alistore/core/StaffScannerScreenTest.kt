package kg.alistore.core

import android.Manifest
import android.graphics.Bitmap
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.FileOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class StaffScannerScreenTest {
  @get:Rule val compose = createComposeRule()

  private val session = StaffSession("staff-token", "staff-1", "seller", "seller", true)

  @Test
  fun manualScannerCodeBecomesEvidenceEntityId() {
    val gateway = UiEvidenceGateway()
    compose.setContent { MaterialTheme { StaffScannerScreen(session, gateway, initialEvidence = StaffEvidenceDraft(byteArrayOf(9))) } }

    compose.onNodeWithTag("staff-scan-code").performTextReplacement("359876543210123\n")
    compose.onNodeWithTag("staff-use-code").assertIsEnabled().performClick()
    compose.onNodeWithTag("staff-evidence-upload").performScrollTo().assertIsEnabled().performClick()
    compose.waitUntil(5_000) { gateway.uploads.size == 1 }
    assertEquals("359876543210123", gateway.uploads.single().entityId)
  }

  @Test
  fun uploadUsesStaffTokenAndSelectedEvidenceMetadata() {
    val gateway = UiEvidenceGateway()
    val bytes = byteArrayOf(1, 2, 3, 4)
    compose.setContent {
      MaterialTheme { StaffScannerScreen(session, gateway, initialEvidence = StaffEvidenceDraft(bytes)) }
    }

    compose.onNodeWithTag("staff-evidence-type-warranty").performClick()
    compose.onNodeWithTag("staff-evidence-entity").performTextReplacement("warranty-42")
    compose.onNodeWithTag("staff-evidence-label").performTextReplacement("IMEI и корпус")
    compose.onNodeWithTag("staff-evidence-label").performImeAction()
    compose.onNodeWithTag("staff-evidence-upload").performScrollTo().assertIsEnabled().performClick()
    compose.waitUntil(5_000) { gateway.uploads.size == 1 }
    if (InstrumentationRegistry.getArguments().getString("visual") == "true") {
      val context = InstrumentationRegistry.getInstrumentation().targetContext
      val image = compose.onRoot().captureToImage().asAndroidBitmap()
      FileOutputStream(File(context.getExternalFilesDir(null), "staff-scanner.png")).use {
        image.compress(Bitmap.CompressFormat.PNG, 100, it)
      }
      Thread.sleep(InstrumentationRegistry.getArguments().getString("visualDelay")?.toLongOrNull() ?: 10_000)
    }

    val upload = gateway.uploads.single()
    assertEquals("warranty", upload.entityType)
    assertEquals("warranty-42", upload.entityId)
    assertEquals("IMEI и корпус", upload.label)
    assertEquals("staff-token", upload.token)
    assertArrayEquals(bytes, upload.bytes)
    compose.onNodeWithText("Evidence сохранён").assertIsDisplayed()
  }

  @Test
  fun cameraScannerOpensAndClosesOnApi36() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    instrumentation.uiAutomation.grantRuntimePermission(instrumentation.targetContext.packageName, Manifest.permission.CAMERA)
    compose.setContent { MaterialTheme { StaffScannerScreen(session, UiEvidenceGateway()) } }

    compose.onNodeWithTag("staff-open-scanner").performClick()
    compose.onNodeWithTag("staff-camera-preview").assertIsDisplayed()
    compose.onNodeWithTag("staff-close-scanner").performClick()
    compose.onNodeWithTag("staff-scanner-title").assertIsDisplayed()
  }
}

private data class UiEvidenceUpload(
  val entityType: String,
  val entityId: String,
  val label: String,
  val token: String,
  val bytes: ByteArray,
)

private class UiEvidenceGateway : StaffEvidenceGateway {
  val uploads = mutableListOf<UiEvidenceUpload>()

  override suspend fun uploadStaffEvidence(
    entityType: String,
    entityId: String,
    label: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
  ): EvidenceAttachment {
    uploads += UiEvidenceUpload(entityType, entityId, label, token, bytes)
    return EvidenceAttachment("evidence/$entityId.webp", "/media/$entityId.webp")
  }
}

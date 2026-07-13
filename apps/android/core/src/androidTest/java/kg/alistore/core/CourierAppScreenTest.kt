package kg.alistore.core

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test

class CourierAppScreenTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun signedOutCourierSeesNativeLogin() {
    compose.setContent { CourierApp("http://127.0.0.1:1/api") }

    compose.onNodeWithText("AliStore Courier").assertIsDisplayed()
    compose.onNodeWithText("Доставки и расчёты COD").assertIsDisplayed()
  }

  @Test
  fun deliveryEvidenceUsesOrderScopeAndCourierJwt() {
    val gateway = CourierUiEvidenceGateway()
    val session = StaffSession("courier-token", "courier-1", "courier", "courier", false)
    compose.setContent {
      MaterialTheme {
        CourierEvidencePicker(
          orderId = "order-42",
          session = session,
          gateway = gateway,
          modifier = Modifier,
          initialEvidence = StaffEvidenceDraft(byteArrayOf(4, 2)),
        )
      }
    }

    compose.onNodeWithTag("courier-evidence-upload").assertIsEnabled().performClick()
    compose.waitUntil(5_000) { gateway.upload != null }
    check(gateway.upload == Triple("order", "order-42", "courier-token"))
    compose.onNodeWithText("Evidence сохранён").assertIsDisplayed()
  }
}

private class CourierUiEvidenceGateway : StaffEvidenceGateway {
  var upload: Triple<String, String, String>? = null

  override suspend fun uploadStaffEvidence(
    entityType: String,
    entityId: String,
    label: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
  ): EvidenceAttachment {
    upload = Triple(entityType, entityId, token)
    return EvidenceAttachment("evidence/order-42.jpg", "https://example.invalid/evidence")
  }
}

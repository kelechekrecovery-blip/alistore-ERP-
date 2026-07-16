package kg.alistore.core

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

interface CustomerEvidenceGateway {
  suspend fun uploadEvidence(
    entityType: String,
    entityId: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
  ): EvidenceAttachment

  suspend fun uploadEvidenceWithKey(
    entityType: String,
    entityId: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
    idempotencyKey: String,
  ): EvidenceAttachment = uploadEvidence(entityType, entityId, fileName, mimeType, bytes, token)
}

@Composable
internal fun CustomerEvidencePicker(
  entityType: String,
  entityId: String,
  session: AuthState.SignedIn,
  gateway: CustomerEvidenceGateway,
  authManager: AuthSessionManager?,
  onAuthState: (AuthState) -> Unit,
  modifier: Modifier = Modifier,
  idempotencyKey: String? = null,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var busy by remember(entityId) { mutableStateOf(false) }
  var message by remember(entityId) { mutableStateOf<String?>(null) }
  val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    if (uri != null) scope.launch {
      busy = true
      message = null
      val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
      val bytes = runCatching {
        withContext(Dispatchers.IO) { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("Файл недоступен") }
      }
      if (bytes.isFailure) {
        message = bytes.exceptionOrNull()?.message ?: "Не удалось прочитать фото"
        busy = false
        return@launch
      }
      suspend fun upload(token: String) = if (idempotencyKey == null) {
        gateway.uploadEvidence(entityType, entityId, "evidence.jpg", mime, bytes.getOrThrow(), token)
      } else {
        gateway.uploadEvidenceWithKey(entityType, entityId, "evidence.jpg", mime, bytes.getOrThrow(), token, idempotencyKey)
      }
      var attempt = runCatching { upload(session.tokens.accessToken) }
      if (attempt.exceptionOrNull().nativeUnauthorized() && authManager != null) {
        val refreshed = authManager.refresh(session)
        onAuthState(refreshed)
        if (refreshed is AuthState.SignedIn) {
          attempt = runCatching { upload(refreshed.tokens.accessToken) }
        }
      }
      attempt.onSuccess { message = "Фото добавлено в Evidence Vault" }
        .onFailure { message = it.message ?: "Не удалось загрузить фото" }
      busy = false
    }
  }

  Button(
    onClick = { picker.launch("image/*") },
    enabled = !busy,
    modifier = modifier.testTag("$entityType-evidence"),
    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF342E28), contentColor = Color.White),
    shape = RoundedCornerShape(8.dp),
  ) { Text(if (busy) "Загружаем фото…" else message ?: "Добавить фото") }
}

internal fun Throwable?.nativeUnauthorized() = this is ApiException && status == 401

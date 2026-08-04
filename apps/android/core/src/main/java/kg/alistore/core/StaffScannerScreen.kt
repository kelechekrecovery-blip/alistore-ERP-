package kg.alistore.core

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

interface StaffEvidenceGateway {
  suspend fun uploadStaffEvidence(
    entityType: String,
    entityId: String,
    label: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray,
    token: String,
  ): EvidenceAttachment
}

data class StaffEvidenceDraft(val bytes: ByteArray, val mimeType: String = "image/jpeg", val fileName: String = "evidence.jpg")

private val evidenceTypes = listOf(
  "order" to "Заказ",
  "warranty" to "Гарантия",
  "shift" to "Смена",
  "inventory" to "Склад",
  "support" to "Поддержка",
  "return" to "Возврат",
  "tradein" to "Trade-in",
)

@Composable
fun StaffScannerScreen(
  session: StaffSession,
  gateway: StaffEvidenceGateway,
  modifier: Modifier = Modifier,
  initialEvidence: StaffEvidenceDraft? = null,
) {
  val context = LocalContext.current
  val focusManager = LocalFocusManager.current
  val scope = rememberCoroutineScope()
  var code by rememberSaveable { mutableStateOf("") }
  var entityId by rememberSaveable { mutableStateOf("") }
  var entityType by rememberSaveable { mutableStateOf("order") }
  var label by rememberSaveable { mutableStateOf("Фото операции") }
  var evidence by remember { mutableStateOf(initialEvidence) }
  var scanning by remember { mutableStateOf(false) }
  var pendingCameraAction by remember { mutableStateOf<String?>(null) }
  var busy by remember { mutableStateOf(false) }
  var message by remember { mutableStateOf<String?>(null) }
  val fieldColors = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    focusedLabelColor = StaffMuted,
    unfocusedLabelColor = StaffMuted,
    focusedBorderColor = StaffLime,
    unfocusedBorderColor = StaffLine,
    cursorColor = StaffLime,
  )
  val outlineColors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White, disabledContentColor = StaffMuted.copy(alpha = .45f))

  val photo = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
    if (bitmap != null) evidence = bitmap.evidenceDraft()
    else if (pendingCameraAction == "photo") message = "Фото не получено"
    pendingCameraAction = null
  }
  val gallery = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    if (uri != null) scope.launch {
      val result = runCatching {
        withContext(Dispatchers.IO) {
          val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("Файл недоступен")
          StaffEvidenceDraft(bytes, context.contentResolver.getType(uri) ?: "image/jpeg")
        }
      }
      result.onSuccess { evidence = it; message = null }.onFailure { message = it.message }
    }
  }
  fun startCameraAction(action: String) {
    pendingCameraAction = action
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
      if (action == "scan") scanning = true else photo.launch(null)
    }
  }
  val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (granted) {
      if (pendingCameraAction == "scan") scanning = true else if (pendingCameraAction == "photo") photo.launch(null)
    } else {
      message = "Разрешите доступ к камере в настройках"
      pendingCameraAction = null
    }
  }
  fun requestCamera(action: String) {
    startCameraAction(action)
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      permission.launch(Manifest.permission.CAMERA)
    }
  }

  LazyColumn(
    modifier.fillMaxSize().background(StaffInk).statusBarsPadding(),
    contentPadding = PaddingValues(18.dp, 18.dp, 18.dp, 30.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    item { Text("Сканер и Evidence", color = Color.White, fontSize = 28.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Black, modifier = Modifier.testTag("staff-scanner-title")) }
    item {
      OutlinedTextField(code, { code = normalizeStaffCode(it) }, label = { Text("EAN, QR, Code128 или IMEI") }, singleLine = true, colors = fieldColors, modifier = Modifier.fillMaxWidth().testTag("staff-scan-code"))
      Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { requestCamera("scan") }, colors = ButtonDefaults.buttonColors(containerColor = StaffCoral), modifier = Modifier.weight(1f).testTag("staff-open-scanner")) { Text("Сканировать") }
        OutlinedButton(onClick = { entityId = code }, enabled = code.isNotBlank(), colors = outlineColors, modifier = Modifier.weight(1f).testTag("staff-use-code")) { Text("Использовать ID") }
      }
    }
    item { Text("Привязка Evidence Vault", color = Color.White, fontSize = 19.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) }
    item {
      LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        items(evidenceTypes) { item ->
          if (entityType == item.first) Button(onClick = {}, colors = ButtonDefaults.buttonColors(containerColor = StaffLime, contentColor = StaffInk), shape = RoundedCornerShape(6.dp)) { Text(item.second) }
          else OutlinedButton(onClick = { entityType = item.first }, colors = outlineColors, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("staff-evidence-type-${item.first}")) { Text(item.second) }
        }
      }
    }
    item { OutlinedTextField(entityId, { entityId = it.trim() }, label = { Text("ID сущности") }, singleLine = true, colors = fieldColors, modifier = Modifier.fillMaxWidth().testTag("staff-evidence-entity")) }
    item {
      OutlinedTextField(
        label,
        { label = it },
        label = { Text("Описание фото") },
        singleLine = true,
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { focusManager.clearFocus() }),
        colors = fieldColors,
        modifier = Modifier.fillMaxWidth().testTag("staff-evidence-label"),
      )
    }
    item {
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { requestCamera("photo") }, colors = outlineColors, modifier = Modifier.weight(1f).testTag("staff-evidence-camera")) { Text("Камера") }
        OutlinedButton(onClick = { gallery.launch("image/*") }, colors = outlineColors, modifier = Modifier.weight(1f).testTag("staff-evidence-gallery")) { Text("Галерея") }
      }
      Text(if (evidence == null) "Фото не выбрано" else "Фото готово: ${evidence!!.bytes.size / 1024} КБ", color = StaffMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp).testTag("staff-evidence-file"))
    }
    item {
      Button(
        onClick = {
          val file = evidence ?: return@Button
          busy = true; message = null
          scope.launch {
            runCatching { gateway.uploadStaffEvidence(entityType, entityId, label.trim(), file.fileName, file.mimeType, file.bytes, session.accessToken) }
              .onSuccess { message = "Evidence сохранён"; evidence = null }
              .onFailure { message = it.message ?: "Не удалось загрузить Evidence" }
            busy = false
          }
        },
        enabled = !busy && entityId.isNotBlank() && label.isNotBlank() && evidence != null,
        colors = ButtonDefaults.buttonColors(containerColor = StaffLime, contentColor = StaffInk),
        modifier = Modifier.fillMaxWidth().height(50.dp).testTag("staff-evidence-upload"),
      ) { if (busy) CircularProgressIndicator() else Text("Сохранить в Evidence Vault") }
      message?.let { Text(it, color = if (it == "Evidence сохранён") StaffLime else StaffCoral, modifier = Modifier.padding(top = 8.dp).testTag("staff-evidence-message")) }
    }
  }

  if (scanning) BarcodeCamera(
    onCode = { code = normalizeStaffCode(it); scanning = false; pendingCameraAction = null },
    onClose = { scanning = false; pendingCameraAction = null },
    previewTag = "staff-camera-preview",
    closeTag = "staff-close-scanner",
  )
}

internal fun normalizeStaffCode(value: String): String = value.trim().replace("\n", "").replace("\r", "")

private fun Bitmap.evidenceDraft(): StaffEvidenceDraft {
  val output = ByteArrayOutputStream()
  compress(Bitmap.CompressFormat.JPEG, 86, output)
  return StaffEvidenceDraft(output.toByteArray())
}

@androidx.annotation.OptIn(ExperimentalGetImage::class)
@Composable
internal fun BarcodeCamera(
  onCode: (String) -> Unit,
  onClose: () -> Unit,
  previewTag: String,
  closeTag: String,
) {
  val context = LocalContext.current
  val lifecycleOwner = LocalLifecycleOwner.current
  val executor = remember { Executors.newSingleThreadExecutor() }
  val providerRef = remember { arrayOfNulls<ProcessCameraProvider>(1) }
  val scanner = remember {
    BarcodeScanning.getClient(
      BarcodeScannerOptions.Builder().setBarcodeFormats(
        Barcode.FORMAT_EAN_8, Barcode.FORMAT_EAN_13, Barcode.FORMAT_CODE_128, Barcode.FORMAT_QR_CODE,
      ).build(),
    )
  }
  DisposableEffect(Unit) {
    onDispose {
      providerRef[0]?.unbindAll()
      scanner.close()
      executor.shutdown()
    }
  }
  Box(Modifier.fillMaxSize().background(Color.Black).testTag(previewTag)) {
    AndroidView(
      factory = { previewContext ->
        PreviewView(previewContext).also { previewView ->
          val providerFuture = ProcessCameraProvider.getInstance(previewContext)
          providerFuture.addListener({
            val provider = providerFuture.get()
            providerRef[0] = provider
            val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
            val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analysis.setAnalyzer(executor) { proxy ->
              val mediaImage = proxy.image
              if (mediaImage == null) proxy.close() else {
                scanner.process(InputImage.fromMediaImage(mediaImage, proxy.imageInfo.rotationDegrees))
                  .addOnSuccessListener { barcodes -> barcodes.firstNotNullOfOrNull { it.rawValue }?.let(onCode) }
                  .addOnCompleteListener { proxy.close() }
              }
            }
            provider.unbindAll()
            provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
          }, ContextCompat.getMainExecutor(previewContext))
        }
      },
      modifier = Modifier.fillMaxSize(),
    )
    Column(Modifier.align(Alignment.TopCenter).statusBarsPadding().fillMaxWidth().background(Color.Black.copy(alpha = .72f)).padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Text("Наведите камеру на EAN, QR, Code128 или IMEI", color = Color.White)
      TextButton(onClick = onClose, modifier = Modifier.testTag(closeTag)) { Text("Закрыть", color = StaffCoral) }
    }
  }
}

package kg.alistore.core

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

private val ProductMediaCoral = Color(0xFFFF6B57)

@Composable
internal fun ProductMediaImage(
  product: Product,
  apiBaseUrl: String,
  modifier: Modifier = Modifier,
  cornerRadius: Dp = 8.dp,
) {
  val candidate = product.imageUrls.firstOrNull { isAllowedMediaUrl(it) }
  var bitmap by remember(candidate, apiBaseUrl) { mutableStateOf<Bitmap?>(null) }

  LaunchedEffect(candidate, apiBaseUrl) {
    bitmap = candidate?.let { loadProductBitmap(resolveMediaUrl(apiBaseUrl, it)) }
  }

  Box(
    modifier = modifier
      .clip(RoundedCornerShape(cornerRadius))
      .background(Color(0xFFF2EFEB))
      .testTag("product-media-${product.id}"),
    contentAlignment = Alignment.Center,
  ) {
    if (bitmap != null) {
      Image(
        bitmap = bitmap!!.asImageBitmap(),
        contentDescription = product.name,
        modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(cornerRadius)),
        contentScale = ContentScale.Fit,
      )
    } else {
      Box(
        Modifier
          .fillMaxSize(0.52f)
          .aspectRatio(0.56f)
          .clip(RoundedCornerShape(14.dp))
          .background(ProductMediaCoral),
      )
    }
  }
}

internal fun isAllowedMediaUrl(value: String): Boolean =
  value.startsWith("https://") || value.startsWith("http://") || value.startsWith("/")

internal fun resolveMediaUrl(baseUrl: String, value: String): String =
  runCatching { URL(URL(baseUrl), value).toString() }.getOrDefault(value)

private suspend fun loadProductBitmap(url: String): Bitmap? = withContext(Dispatchers.IO) {
  if (!url.startsWith("https://") && !url.startsWith("http://")) return@withContext null
  val connection = runCatching { URL(url).openConnection() as HttpURLConnection }.getOrNull() ?: return@withContext null
  try {
    connection.connectTimeout = 5_000
    connection.readTimeout = 8_000
    connection.instanceFollowRedirects = false
    if (connection.responseCode !in 200..299) return@withContext null
    connection.inputStream.use(BitmapFactory::decodeStream)
  } catch (_: Exception) {
    null
  } finally {
    connection.disconnect()
  }
}

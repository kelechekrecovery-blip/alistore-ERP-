package kg.alistore.courier

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kg.alistore.core.AliStoreApp
import kg.alistore.core.AppRole

class MainActivity : ComponentActivity() {
  private var deepLinkUrl by mutableStateOf<String?>(null)
  private var deepLinkRevision by mutableLongStateOf(0)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    deepLinkUrl = route(intent)
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1002)
    }
    enableEdgeToEdge()
    val registrar = if (BuildConfig.FCM_CONFIGURED) FirebaseCourierPushRegistrar(applicationContext, BuildConfig.API_BASE_URL) else null
    setContent { AliStoreApp(AppRole.COURIER, BuildConfig.API_BASE_URL, deepLinkUrl, deepLinkRevision, registrar) }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    deepLinkUrl = route(intent)
    deepLinkRevision += 1
  }

  private fun route(intent: Intent?): String? = intent?.dataString ?: intent?.getStringExtra("deepLink")
}

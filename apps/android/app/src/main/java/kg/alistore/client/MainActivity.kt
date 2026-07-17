package kg.alistore.client

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.fragment.app.FragmentActivity
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

private fun routeFrom(intent: Intent?): String? = intent?.dataString ?: intent?.getStringExtra("deepLink")

class MainActivity : FragmentActivity() {
  private var deepLinkUrl by mutableStateOf<String?>(null)
  private var deepLinkRevision by mutableLongStateOf(0)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    deepLinkUrl = routeFrom(intent)
    if (Build.VERSION.SDK_INT >= 33
      && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_REQUEST)
    }
    enableEdgeToEdge()
    setContent {
      AliStoreApp(
        role = AppRole.CLIENT,
        apiBaseUrl = BuildConfig.API_BASE_URL,
        deepLinkUrl = deepLinkUrl,
        deepLinkRevision = deepLinkRevision,
        clientPushRegistrar = if (BuildConfig.FCM_CONFIGURED) FirebaseClientPushRegistrar(applicationContext, BuildConfig.API_BASE_URL) else null,
      )
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    deepLinkUrl = routeFrom(intent)
    deepLinkRevision += 1
  }

  private companion object {
    const val NOTIFICATION_PERMISSION_REQUEST = 1002
  }
}

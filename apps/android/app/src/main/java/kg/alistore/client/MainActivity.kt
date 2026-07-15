package kg.alistore.client

import android.content.Intent
import android.os.Bundle
import androidx.fragment.app.FragmentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kg.alistore.core.AliStoreApp
import kg.alistore.core.AppRole

class MainActivity : FragmentActivity() {
  private var deepLinkUrl by mutableStateOf<String?>(null)
  private var deepLinkRevision by mutableLongStateOf(0)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    deepLinkUrl = intent?.dataString
    enableEdgeToEdge()
    setContent {
      AliStoreApp(
        role = AppRole.CLIENT,
        apiBaseUrl = BuildConfig.API_BASE_URL,
        deepLinkUrl = deepLinkUrl,
        deepLinkRevision = deepLinkRevision,
      )
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    deepLinkUrl = intent.dataString
    deepLinkRevision += 1
  }
}

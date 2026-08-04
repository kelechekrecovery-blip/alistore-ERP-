package kg.alistore.pos

import android.os.Bundle
import androidx.fragment.app.FragmentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import kg.alistore.core.AliStoreApp
import kg.alistore.core.AppRole

class MainActivity : FragmentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent { AliStoreApp(AppRole.POS, BuildConfig.API_BASE_URL) }
  }
}

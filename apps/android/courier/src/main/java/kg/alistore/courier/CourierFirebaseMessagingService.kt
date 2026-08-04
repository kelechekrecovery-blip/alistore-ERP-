package kg.alistore.courier

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kg.alistore.core.parseCourierPushRoute

class CourierFirebaseMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    FirebaseCourierPushRegistrar.onNewToken(applicationContext, BuildConfig.API_BASE_URL, token)
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    val deepLink = data["deepLink"] ?: data["deeplink"] ?: return
    if (parseCourierPushRoute(deepLink) == null) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Доставки AliStore", NotificationManager.IMPORTANCE_HIGH))
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink), applicationContext, MainActivity::class.java)
      .putExtra("deepLink", deepLink)
      .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pending = PendingIntent.getActivity(applicationContext, deepLink.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_map)
      .setContentTitle(message.notification?.title ?: data["title"] ?: "Новая доставка")
      .setContentText(message.notification?.body ?: data["body"] ?: "Откройте маршрут")
      .setAutoCancel(true)
      .setContentIntent(pending)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()
    manager.notify(deepLink.hashCode(), notification)
  }

  private companion object { const val CHANNEL_ID = "deliveries" }
}

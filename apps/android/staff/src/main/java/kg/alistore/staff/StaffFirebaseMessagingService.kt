package kg.alistore.staff

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class StaffFirebaseMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    FirebaseStaffPushRegistrar.onNewToken(applicationContext, BuildConfig.API_BASE_URL, token)
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    val deepLink = data["deepLink"] ?: data["deeplink"] ?: return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Операции AliStore", NotificationManager.IMPORTANCE_HIGH))
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink), applicationContext, MainActivity::class.java)
      .putExtra("deepLink", deepLink)
      .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pending = PendingIntent.getActivity(
      applicationContext,
      deepLink.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(message.notification?.title ?: data["title"] ?: "AliStore Staff")
      .setContentText(message.notification?.body ?: data["body"] ?: data["message"] ?: "Новая операция")
      .setAutoCancel(true)
      .setContentIntent(pending)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()
    manager.notify(deepLink.hashCode(), notification)
  }

  private companion object { const val CHANNEL_ID = "operations" }
}

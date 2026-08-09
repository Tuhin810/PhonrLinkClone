package com.phonelinkclone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log

/**
 * Keeps the process alive so the WebSocket connection and the notification listener survive
 * Android 8+ background execution limits. Purely a lifetime anchor — it owns no sync logic.
 */
class LinkForegroundService : Service() {

  companion object {
    private const val TAG = "PhoneLinkFgs"
    private const val CHANNEL_ID = "phonelink_status"
    private const val NOTIFICATION_ID = 1
    const val ACTION_START = "com.phonelinkclone.START"
    const val ACTION_STOP = "com.phonelinkclone.STOP"

    fun start(context: Context) {
      val intent = Intent(context, LinkForegroundService::class.java).setAction(ACTION_START)
      context.startForegroundService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, LinkForegroundService::class.java))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    createChannel()
    try {
      startForeground(NOTIFICATION_ID, buildNotification())
    } catch (e: Exception) {
      // OEM policy or a missing companion permission can reject the foreground promotion.
      // Losing the lifetime anchor is bad, but taking the whole app down with it is worse:
      // mirroring still works while the app is in the foreground.
      Log.e(TAG, "foreground promotion rejected; running without it", e)
      stopSelf()
      return START_NOT_STICKY
    }
    // Restart if the system kills us; the connection should come back on its own.
    return START_STICKY
  }

  private fun createChannel() {
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "PhoneLink status",
      // LOW keeps the persistent notification silent and collapsed.
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Shows while PhoneLink Clone is connected to your Mac"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launch = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launch,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    return Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("PhoneLink Clone is running")
      .setContentText("Mirroring notifications to your Mac")
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build()
  }
}

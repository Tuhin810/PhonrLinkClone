package com.phonelinkclone

import android.app.Notification
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream

/**
 * Reads posted notifications and forwards them to JS via [NotificationEventBus].
 *
 * The user must grant access manually in system settings; there is no programmatic grant.
 * See docs/CONSTRAINTS.md #5.
 */
class NotificationRelayService : NotificationListenerService() {

  companion object {
    private const val TAG = "PhoneLinkListener"
    /** Full-colour app icons need more pixels than silhouettes to stay sharp on Retina. */
    private const val ICON_SIZE_PX = 96
    /** Guards against a runaway base64 payload from an unusually large icon. */
    private const val MAX_ICON_BASE64_CHARS = 48_000

    private val DIALER_HINTS = listOf("dialer", "incallui", "telecom", "phone")

    /** Titles that are a label rather than the caller's name. */
    private val LABEL_TITLES = listOf("Incoming call", "Ongoing call", "Calling")
  }

  override fun onListenerConnected() {
    super.onListenerConnected()
    Log.i(TAG, "notification listener connected")
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    // Never mirror our own foreground-service notification: the Mac would show it, and any
    // notification we post in response would loop straight back in.
    if (sbn.packageName == packageName) return

    // The dialer's incoming-call notification is the only reliable source of the caller's
    // identity on OEMs that strip EXTRA_INCOMING_NUMBER from the PHONE_STATE broadcast.
    // Checked before the isOngoing filter below, because call notifications are ongoing.
    captureCallerIfCallNotification(sbn)

    // Ongoing notifications are progress bars, media controls and persistent services. They
    // update many times a second and are noise on a desktop.
    if (sbn.isOngoing) return

    val extras = sbn.notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = (extras.getCharSequence(Notification.EXTRA_TEXT)
      ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT))?.toString().orEmpty()

    // A notification with neither title nor body carries nothing worth mirroring.
    if (title.isBlank() && text.isBlank()) return

    NotificationEventBus.emitPosted(
      NotificationEventBus.PostedNotification(
        key = sbn.key,
        packageName = sbn.packageName,
        title = title,
        text = text,
        timestamp = if (sbn.postTime > 0) sbn.postTime else System.currentTimeMillis(),
        iconBase64 = extractIcon(sbn),
      )
    )
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {
    if (sbn.packageName == packageName) return
    NotificationEventBus.emitRemoved(sbn.key)
  }

  /**
   * Feeds the caller's display name to [CallEventBus] when this is a dialer call notification.
   *
   * Matching is on `CATEGORY_CALL` plus a dialer-ish package name: category alone is used by a
   * few messaging apps for missed-call summaries, and package alone would catch voicemail and
   * call-ended notices.
   */
  private fun captureCallerIfCallNotification(sbn: StatusBarNotification) {
    val notification = sbn.notification ?: return
    if (notification.category != Notification.CATEGORY_CALL) return
    if (!isDialerPackage(sbn.packageName)) return

    val extras = notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
    if (title.isNullOrEmpty()) return

    // "Incoming call" style titles are the label, not the caller; the name is then in the text.
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()
    val caller = if (LABEL_TITLES.any { title.equals(it, ignoreCase = true) }) text else title
    if (caller.isNullOrEmpty()) return

    Log.i(TAG, "caller identified from ${sbn.packageName}")
    CallEventBus.setCallerHint(caller)
  }

  private fun isDialerPackage(packageName: String): Boolean =
    DIALER_HINTS.any { packageName.contains(it, ignoreCase = true) }

  /**
   * The posting app's launcher icon as a downscaled base64 PNG, or null if nothing renders.
   *
   * Not the notification's small icon: that is a white status-bar silhouette, which is
   * unrecognisable (and invisible on light backgrounds) once it leaves the status bar. The
   * small icon is only the fallback for packages with no launcher icon we can see.
   */
  private fun extractIcon(sbn: StatusBarNotification): String? {
    return try {
      val drawable: Drawable = appIcon(sbn.packageName)
        ?: sbn.notification.smallIcon?.loadDrawable(applicationContext)
        ?: return null
      val bitmap = drawable.toScaledBitmap(ICON_SIZE_PX)
      val stream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
      bitmap.recycle()
      val encoded = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
      if (encoded.length > MAX_ICON_BASE64_CHARS) null else encoded
    } catch (e: Exception) {
      // An unrenderable icon must never cost us the notification itself.
      Log.w(TAG, "icon extraction failed for ${sbn.packageName}", e)
      null
    }
  }

  /** Needs the launcher-intent <queries> entry in the manifest to see other apps (API 30+). */
  private fun appIcon(packageName: String): Drawable? =
    try {
      packageManager.getApplicationIcon(packageName)
    } catch (e: Exception) {
      null
    }

  private fun Drawable.toScaledBitmap(size: Int): Bitmap {
    if (this is BitmapDrawable && bitmap != null) {
      return Bitmap.createScaledBitmap(bitmap, size, size, true)
    }
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    setBounds(0, 0, size, size)
    draw(canvas)
    return bitmap
  }
}

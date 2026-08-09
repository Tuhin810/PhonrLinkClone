package com.phonelinkclone

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * JS-facing surface for notification mirroring: permission state, the settings deep link,
 * foreground-service lifecycle, and the event stream out of [NotificationRelayService].
 */
class NotificationBridgeModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), NotificationEventBus.Sink {

  companion object {
    const val NAME = "NotificationBridge"
    const val EVENT_POSTED = "phonelink:notificationPosted"
    const val EVENT_REMOVED = "phonelink:notificationRemoved"
  }

  override fun getName(): String = NAME

  // --- JS API ---------------------------------------------------------------------------

  /**
   * True when the user has granted notification access. This cannot be requested with a
   * runtime permission dialog — only toggled by hand in system settings.
   */
  @ReactMethod
  fun isNotificationAccessGranted(promise: Promise) {
    try {
      val enabled = Settings.Secure.getString(
        reactContext.contentResolver,
        "enabled_notification_listeners",
      ).orEmpty()
      val ours = ComponentName(reactContext, NotificationRelayService::class.java)
      val granted = enabled.split(':').any { entry ->
        val component = ComponentName.unflattenFromString(entry)
        component != null && component.packageName == ours.packageName
      }
      promise.resolve(granted)
    } catch (e: Exception) {
      promise.reject("permission_check_failed", e)
    }
  }

  /** Deep-links to the notification-access screen so the user can grant it. */
  @ReactMethod
  fun openNotificationAccessSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("settings_open_failed", e)
    }
  }

  @ReactMethod
  fun startForegroundService(promise: Promise) {
    try {
      LinkForegroundService.start(reactContext)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("foreground_service_start_failed", e)
    }
  }

  @ReactMethod
  fun stopForegroundService(promise: Promise) {
    try {
      LinkForegroundService.stop(reactContext)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("foreground_service_stop_failed", e)
    }
  }

  /** Starts forwarding listener events to JS. Idempotent. */
  @ReactMethod
  fun startListening() {
    NotificationEventBus.setSink(this)
  }

  @ReactMethod
  fun stopListening() {
    NotificationEventBus.setSink(null)
  }

  // Required by NativeEventEmitter on the JS side; the counting is handled there.
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    NotificationEventBus.setSink(null)
    super.invalidate()
  }

  // --- NotificationEventBus.Sink --------------------------------------------------------

  override fun onPosted(payload: NotificationEventBus.PostedNotification) {
    val map: WritableMap = Arguments.createMap().apply {
      putString("id", payload.key)
      putString("app", payload.packageName)
      putString("title", payload.title)
      putString("text", payload.text)
      putDouble("timestamp", payload.timestamp.toDouble())
      if (payload.iconBase64 != null) putString("icon", payload.iconBase64)
    }
    emit(EVENT_POSTED, map)
  }

  override fun onRemoved(key: String) {
    val map: WritableMap = Arguments.createMap().apply { putString("id", key) }
    emit(EVENT_REMOVED, map)
  }

  private fun emit(event: String, payload: WritableMap) {
    // The React context can go away between a system callback and this call.
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }
}

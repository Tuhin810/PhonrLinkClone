package com.phonelinkclone

import android.accessibilityservice.AccessibilityService
import android.app.Activity
import android.content.Intent
import android.content.Context
import android.media.projection.MediaProjectionManager
import android.provider.Settings
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/** JS surface for screen capture and remote input. */
class ScreenCaptureModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), ScreenEventBus.Sink {

  companion object {
    const val NAME = "ScreenCapture"
    const val EVENT_FRAME = "phonelink:screenFrame"
    const val EVENT_STATE = "phonelink:screenState"
    private const val PROJECTION_REQUEST = 0x9201
  }

  override fun getName(): String = NAME

  private var permissionPromise: Promise? = null

  private val activityListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
      ) {
        if (requestCode != PROJECTION_REQUEST) return
        val promise = permissionPromise ?: return
        permissionPromise = null

        if (resultCode != Activity.RESULT_OK || data == null) {
          // Declining is a normal choice, not an error.
          ScreenEventBus.emitState(false, "Screen sharing was declined on the phone")
          promise.resolve(false)
          return
        }
        ScreenCaptureService.start(reactContext, resultCode, data)
        promise.resolve(true)
      }
    }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  /**
   * Asks the user to allow capture, then starts the service.
   *
   * The consent dialog is mandatory on every session — Android offers no way to remember it,
   * so the Mac cannot silently start watching.
   */
  @ReactMethod
  fun startCapture(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("no_activity", "Open the PhoneLink app on the phone to start mirroring")
      return
    }
    ScreenEventBus.setSink(this)
    permissionPromise?.resolve(false)
    permissionPromise = promise
    val manager =
      reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    activity.startActivityForResult(manager.createScreenCaptureIntent(), PROJECTION_REQUEST)
  }

  @ReactMethod
  fun stopCapture() {
    ScreenCaptureService.stop(reactContext)
  }

  @ReactMethod
  fun isInputAvailable(promise: Promise) {
    promise.resolve(RemoteInputService.isRunning())
  }

  /** Accessibility access cannot be granted programmatically; deep-link to the settings page. */
  @ReactMethod
  fun openAccessibilitySettings(promise: Promise) {
    try {
      reactContext.startActivity(
        Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("settings_open_failed", e)
    }
  }

  @ReactMethod
  fun tap(x: Double, y: Double, promise: Promise) {
    promise.resolve(RemoteInputService.tap(x.toFloat(), y.toFloat()))
  }

  @ReactMethod
  fun swipe(
    x1: Double,
    y1: Double,
    x2: Double,
    y2: Double,
    durationMs: Double,
    promise: Promise,
  ) {
    promise.resolve(
      RemoteInputService.swipe(
        x1.toFloat(),
        y1.toFloat(),
        x2.toFloat(),
        y2.toFloat(),
        durationMs.toLong(),
      ),
    )
  }

  @ReactMethod
  fun globalAction(name: String, promise: Promise) {
    val action = when (name) {
      "back" -> AccessibilityService.GLOBAL_ACTION_BACK
      "home" -> AccessibilityService.GLOBAL_ACTION_HOME
      "recents" -> AccessibilityService.GLOBAL_ACTION_RECENTS
      "notifications" -> AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS
      else -> {
        promise.reject("unknown_action", "No global action named $name")
        return
      }
    }
    promise.resolve(RemoteInputService.globalAction(action))
  }

  /** Physical screen size, so normalised coordinates can be scaled to real pixels. */
  @ReactMethod
  fun getScreenSize(promise: Promise) {
    val windowManager =
      reactContext.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager
    val bounds = windowManager.currentWindowMetrics.bounds
    promise.resolve(
      Arguments.createMap().apply {
        putInt("width", bounds.width())
        putInt("height", bounds.height())
      },
    )
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    ScreenEventBus.setSink(null)
    super.invalidate()
  }

  override fun onFrame(base64Jpeg: String, width: Int, height: Int) {
    val payload: WritableMap = Arguments.createMap().apply {
      putString("data", base64Jpeg)
      putInt("width", width)
      putInt("height", height)
    }
    emit(EVENT_FRAME, payload)
  }

  override fun onState(streaming: Boolean, reason: String?) {
    val payload: WritableMap = Arguments.createMap().apply {
      putBoolean("streaming", streaming)
      reason?.let { putString("reason", it) }
      putBoolean("inputAvailable", RemoteInputService.isRunning())
    }
    emit(EVENT_STATE, payload)
  }

  private fun emit(event: String, payload: WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }
}

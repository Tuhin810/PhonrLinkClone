package com.phonelinkclone

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityEvent

/**
 * Performs remote taps, swipes and navigation.
 *
 * An accessibility service is the only way a normal app can synthesise input: `INJECT_EVENTS` is
 * system-only, which is why scrcpy runs a helper process over adb instead. The permission is
 * powerful and must be granted by hand — mirroring works read-only without it.
 */
class RemoteInputService : AccessibilityService() {

  companion object {
    @Volatile
    private var instance: RemoteInputService? = null

    fun isRunning(): Boolean = instance != null

    /** Coordinates are in device pixels; the JS layer scales from normalised values. */
    fun tap(x: Float, y: Float): Boolean =
      instance?.dispatch(x, y, x, y, 50L) ?: false

    fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long): Boolean =
      instance?.dispatch(x1, y1, x2, y2, durationMs) ?: false

    fun globalAction(action: Int): Boolean =
      instance?.performGlobalAction(action) ?: false
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // We only synthesise input; we never inspect what is on screen.
  }

  override fun onInterrupt() = Unit

  private fun dispatch(
    x1: Float,
    y1: Float,
    x2: Float,
    y2: Float,
    durationMs: Long,
  ): Boolean {
    val path = Path().apply {
      moveTo(x1, y1)
      if (x1 != x2 || y1 != y2) lineTo(x2, y2)
    }
    val stroke = GestureDescription.StrokeDescription(path, 0, durationMs.coerceAtLeast(1))
    val accepted =
      dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    android.util.Log.i("PhoneLinkInput", "gesture ($x1,$y1)->($x2,$y2) accepted=$accepted")
    return accepted
  }
}

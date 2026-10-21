package com.phonelinkclone

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Clipboard bridge.
 *
 * **Android 10+ only lets an app read the clipboard while it has focus** (or is the default
 * IME). The foreground service keeps us alive, but it does not buy read access — so changes
 * made in other apps are not visible to us. See docs/CONSTRAINTS.md #2. Writing to the
 * clipboard is unrestricted, so Mac -> phone works regardless.
 */
class ClipboardModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "ClipboardBridge"
    const val EVENT_CHANGED = "phonelink:clipboardChanged"
  }

  override fun getName(): String = NAME

  private val manager: ClipboardManager
    get() = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

  /** Last value we wrote ourselves, so an inbound paste is not echoed straight back. */
  @Volatile
  private var lastWritten: String? = null

  private val listener = ClipboardManager.OnPrimaryClipChangedListener {
    val text = readClipText()
    if (text.isNullOrEmpty()) return@OnPrimaryClipChangedListener
    if (text == lastWritten) return@OnPrimaryClipChangedListener
    emitChanged(text)
  }

  private var listening = false

  @ReactMethod
  fun startListening() {
    if (listening) return
    manager.addPrimaryClipChangedListener(listener)
    listening = true
  }

  @ReactMethod
  fun stopListening() {
    if (!listening) return
    manager.removePrimaryClipChangedListener(listener)
    listening = false
  }

  @ReactMethod
  fun getText(promise: Promise) {
    try {
      promise.resolve(readClipText())
    } catch (e: Exception) {
      promise.reject("clipboard_read_failed", e)
    }
  }

  @ReactMethod
  fun setText(text: String, promise: Promise) {
    try {
      lastWritten = text
      manager.setPrimaryClip(ClipData.newPlainText("ILink", text))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("clipboard_write_failed", e)
    }
  }

  /**
   * Text handed to us through the Android share sheet, consumed once.
   *
   * This is the reliable phone -> Mac path: Android 10+ forbids background clipboard reads, so
   * "copy in another app" cannot reach us. Sharing text to PhoneLink works from anywhere.
   */
  @ReactMethod
  fun consumeSharedText(promise: Promise) {
    try {
      val intent: Intent? = reactContext.currentActivity?.intent
      if (intent == null || intent.action != Intent.ACTION_SEND || intent.type != "text/plain") {
        promise.resolve(null)
        return
      }
      val shared = intent.getStringExtra(Intent.EXTRA_TEXT)
      // Clear it so returning to the app later does not re-send the same text.
      intent.removeExtra(Intent.EXTRA_TEXT)
      intent.action = Intent.ACTION_MAIN
      promise.resolve(shared)
    } catch (e: Exception) {
      promise.reject("shared_text_read_failed", e)
    }
  }

  // Required by NativeEventEmitter on the JS side.
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    stopListening()
    super.invalidate()
  }

  private fun readClipText(): String? {
    val clip = manager.primaryClip ?: return null
    if (clip.itemCount == 0) return null
    return clip.getItemAt(0)?.coerceToText(reactContext)?.toString()
  }

  private fun emitChanged(text: String) {
    if (!reactContext.hasActiveReactInstance()) return
    val payload: WritableMap = Arguments.createMap().apply { putString("text", text) }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_CHANGED, payload)
  }
}

package com.phonelinkclone

import android.Manifest
import android.content.pm.PackageManager
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/** Forwards call state to JS. Detection only — the app never answers or rejects. */
class CallStateModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), CallEventBus.Sink {

  companion object {
    const val NAME = "CallState"
    const val EVENT_INCOMING = "phonelink:callIncoming"
    const val EVENT_ENDED = "phonelink:callEnded"
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun startListening() {
    CallEventBus.setSink(this)
  }

  @ReactMethod
  fun stopListening() {
    CallEventBus.setSink(null)
  }

  /** Whether we can read phone state at all; the UI uses this to explain a silent feature. */
  @ReactMethod
  fun hasPhonePermission(promise: Promise) {
    val granted = ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.READ_PHONE_STATE,
    ) == PackageManager.PERMISSION_GRANTED
    promise.resolve(granted)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    CallEventBus.setSink(null)
    super.invalidate()
  }

  override fun onRinging(number: String?, callerName: String?) {
    // Prefer a contacts match on the number; fall back to whatever the dialer's own
    // notification called them.
    val name = lookupContactName(number) ?: callerName
    val payload: WritableMap = Arguments.createMap().apply {
      putString("callerNumber", number ?: "")
      name?.takeIf { it.isNotBlank() }?.let { putString("callerName", it) }
    }
    emit(EVENT_INCOMING, payload)
  }

  override fun onEnded() {
    emit(EVENT_ENDED, Arguments.createMap())
  }

  /** Contact name, only when the user granted contacts access. Absent is fine. */
  private fun lookupContactName(number: String?): String? {
    if (number.isNullOrBlank()) return null
    val granted = ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.READ_CONTACTS,
    ) == PackageManager.PERMISSION_GRANTED
    if (!granted) return null

    return try {
      val uri = android.net.Uri.withAppendedPath(
        ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
        android.net.Uri.encode(number),
      )
      reactContext.contentResolver.query(
        uri,
        arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
        null,
        null,
        null,
      )?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (e: Exception) {
      // A failed lookup must not cost us the call alert itself.
      null
    }
  }

  private fun emit(event: String, payload: WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }
}

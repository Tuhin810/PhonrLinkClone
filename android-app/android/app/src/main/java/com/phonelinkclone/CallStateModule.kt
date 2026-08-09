package com.phonelinkclone

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.telecom.TelecomManager
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

  /**
   * Rejects the ringing call. Needs `ANSWER_PHONE_CALLS`, which also covers `endCall`.
   *
   * Answering is intentionally not offered: the audio would stay on the phone, so a remote
   * answer button would promise something it cannot deliver. See docs/CONSTRAINTS.md #1.
   */
  @ReactMethod
  fun declineCall(promise: Promise) {
    val granted = ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.ANSWER_PHONE_CALLS,
    ) == PackageManager.PERMISSION_GRANTED
    if (!granted) {
      promise.reject("permission_denied", "ANSWER_PHONE_CALLS has not been granted")
      return
    }
    try {
      val telecom =
        reactContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      @Suppress("MissingPermission")
      val ended = telecom.endCall()
      promise.resolve(ended)
    } catch (e: Exception) {
      promise.reject("decline_failed", e)
    }
  }

  /**
   * Silences the ringer without touching the call.
   *
   * `TelecomManager.silenceRinger()` is the clean route but is restricted to the default dialer
   * or system apps, so it is attempted first and quietly falls back to muting the ring stream.
   * The fallback needs Do Not Disturb access on modern Android, which the caller must grant.
   */
  @ReactMethod
  fun silenceRinger(promise: Promise) {
    val telecom = reactContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
    try {
      @Suppress("MissingPermission")
      telecom.silenceRinger()
      promise.resolve("telecom")
      return
    } catch (e: SecurityException) {
      // Expected unless we are the default dialer; fall through to the audio route.
    } catch (e: Exception) {
      // Same treatment: try the fallback rather than failing outright.
    }

    try {
      val audio = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      audio.adjustStreamVolume(AudioManager.STREAM_RING, AudioManager.ADJUST_MUTE, 0)
      promise.resolve("audio")
    } catch (e: SecurityException) {
      promise.reject("dnd_access_required", "Do Not Disturb access is needed to mute the ringer")
    } catch (e: Exception) {
      promise.reject("silence_failed", e)
    }
  }

  /** Opens the Do Not Disturb access screen, which cannot be granted programmatically. */
  @ReactMethod
  fun openDndSettings(promise: Promise) {
    try {
      val intent = android.content.Intent(
        android.provider.Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS,
      ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("settings_open_failed", e)
    }
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

package com.phonelinkclone

import android.os.Handler
import android.os.Looper

/**
 * Rendezvous between the system-invoked [PhoneStateReceiver] and [CallStateModule], which have
 * independent lifetimes — same pattern as [NotificationEventBus].
 */
object CallEventBus {

  interface Sink {
    fun onRinging(number: String?, callerName: String?)
    fun onEnded()
  }

  @Volatile
  private var sink: Sink? = null

  /** Suppresses duplicate RINGING callbacks; the platform delivers several per call. */
  @Volatile
  private var ringing = false

  /**
   * Caller name scraped from the dialer's own incoming-call notification.
   *
   * Samsung (and other OEMs) strip `EXTRA_INCOMING_NUMBER` from the PHONE_STATE broadcast, so
   * the number alone is often unavailable. The dialer's notification does know who is calling,
   * and we already hold notification-listener access — so no extra permission is needed.
   */
  @Volatile
  private var callerHint: String? = null

  private val handler = Handler(Looper.getMainLooper())
  private var pendingRinging: Runnable? = null

  /** How long to wait for the dialer's notification before alerting without a name. */
  private const val HINT_GRACE_MS = 1500L

  fun setSink(value: Sink?) {
    sink = value
  }

  fun emitRinging(number: String?) {
    if (ringing) return
    ringing = true

    val hint = callerHint
    // If we already know who it is, or the broadcast gave us a number, alert immediately.
    if (!hint.isNullOrBlank() || !number.isNullOrBlank()) {
      sink?.onRinging(number, hint)
      return
    }

    // Otherwise give the dialer a moment to post its notification, then alert regardless —
    // a late alert is useless for a ringing phone, so the wait is deliberately short.
    val pending = Runnable {
      pendingRinging = null
      if (ringing) sink?.onRinging(null, callerHint)
    }
    pendingRinging = pending
    handler.postDelayed(pending, HINT_GRACE_MS)
  }

  /** Called by the notification listener when the dialer announces an incoming call. */
  fun setCallerHint(name: String?) {
    if (name.isNullOrBlank()) return
    callerHint = name
    val pending = pendingRinging ?: return
    // The name arrived within the grace window: alert now rather than waiting it out.
    handler.removeCallbacks(pending)
    pendingRinging = null
    if (ringing) sink?.onRinging(null, name)
  }

  fun emitEnded() {
    pendingRinging?.let { handler.removeCallbacks(it) }
    pendingRinging = null
    callerHint = null
    // Only report an end for a call we actually announced.
    if (!ringing) return
    ringing = false
    sink?.onEnded()
  }
}

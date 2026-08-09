package com.phonelinkclone

/**
 * Rendezvous between the system-invoked [PhoneStateReceiver] and [CallStateModule], which have
 * independent lifetimes — same pattern as [NotificationEventBus].
 */
object CallEventBus {

  interface Sink {
    fun onRinging(number: String?)
    fun onEnded()
  }

  @Volatile
  private var sink: Sink? = null

  /** Suppresses duplicate RINGING callbacks; the platform delivers several per call. */
  @Volatile
  private var ringing = false

  fun setSink(value: Sink?) {
    sink = value
  }

  fun emitRinging(number: String?) {
    if (ringing) return
    ringing = true
    sink?.onRinging(number)
  }

  fun emitEnded() {
    // Only report an end for a call we actually announced.
    if (!ringing) return
    ringing = false
    sink?.onEnded()
  }
}

package com.phonelinkclone

/**
 * Bridge between [NotificationRelayService] and [NotificationBridgeModule].
 *
 * The listener service is started by the system on its own schedule and can be alive while
 * the React context is not, so the two cannot hold direct references to each other. This
 * object is the single rendezvous point: the module registers a sink when JS is ready, the
 * service posts to whatever sink is currently registered.
 *
 * Events that arrive with no sink registered are dropped on purpose — Phase 2 mirrors live
 * notifications only, and replaying a backlog on connect would spam the Mac.
 */
object NotificationEventBus {

  interface Sink {
    fun onPosted(payload: PostedNotification)
    fun onRemoved(key: String)
  }

  data class PostedNotification(
    val key: String,
    val packageName: String,
    val title: String,
    val text: String,
    val timestamp: Long,
    /** Base64 PNG of the small icon, already downscaled. Null when extraction failed. */
    val iconBase64: String?,
  )

  @Volatile
  private var sink: Sink? = null

  fun setSink(value: Sink?) {
    sink = value
  }

  fun emitPosted(payload: PostedNotification) {
    sink?.onPosted(payload)
  }

  fun emitRemoved(key: String) {
    sink?.onRemoved(key)
  }
}

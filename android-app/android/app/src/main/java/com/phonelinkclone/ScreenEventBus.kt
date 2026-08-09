package com.phonelinkclone

/** Bridges [ScreenCaptureService] to [ScreenCaptureModule]; same pattern as the other buses. */
object ScreenEventBus {

  interface Sink {
    fun onFrame(base64Jpeg: String, width: Int, height: Int)
    fun onState(streaming: Boolean, reason: String?)
  }

  @Volatile
  private var sink: Sink? = null

  fun setSink(value: Sink?) {
    sink = value
  }

  fun emitFrame(base64Jpeg: String, width: Int, height: Int) {
    sink?.onFrame(base64Jpeg, width, height)
  }

  fun emitState(streaming: Boolean, reason: String?) {
    sink?.onState(streaming, reason)
  }
}

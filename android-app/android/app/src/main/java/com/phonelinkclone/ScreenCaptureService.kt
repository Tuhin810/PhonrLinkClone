package com.phonelinkclone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.IBinder
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import java.io.ByteArrayOutputStream

/**
 * Captures the screen and hands JPEG frames to [ScreenEventBus].
 *
 * A foreground service with type `mediaProjection` is mandatory from Android 10 — capture is
 * refused otherwise. Frames are downscaled and JPEG-encoded rather than H.264: a video pipeline
 * on both ends is a much bigger commitment, and this is for glanceable use.
 */
class ScreenCaptureService : Service() {

  companion object {
    private const val TAG = "PhoneLinkCapture"
    private const val CHANNEL_ID = "phonelink_capture"
    private const val NOTIFICATION_ID = 2
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"

    /** Longest edge of a transmitted frame. Keeps frames small enough to send at speed. */
    private const val MAX_DIMENSION = 720
    private const val JPEG_QUALITY = 55
    /** ~8fps: enough to follow the UI without saturating the link. */
    private const val MIN_FRAME_INTERVAL_MS = 120L

    fun start(context: Context, resultCode: Int, data: Intent) {
      val intent = Intent(context, ScreenCaptureService::class.java)
        .putExtra(EXTRA_RESULT_CODE, resultCode)
        .putExtra(EXTRA_RESULT_DATA, data)
      context.startForegroundService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ScreenCaptureService::class.java))
    }
  }

  private var projection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var reader: ImageReader? = null
  private var lastFrameAt = 0L

  private val projectionCallback = object : MediaProjection.Callback() {
    override fun onStop() {
      // The user revoked capture from the system UI.
      ScreenEventBus.emitState(false, "Screen sharing stopped on the phone")
      stopSelf()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
    val resultData: Intent? = intent?.getParcelableExtra(EXTRA_RESULT_DATA)
    if (resultData == null) {
      stopSelf()
      return START_NOT_STICKY
    }

    createChannel()
    startForeground(NOTIFICATION_ID, buildNotification())

    return try {
      beginCapture(resultCode, resultData)
      START_NOT_STICKY
    } catch (e: Exception) {
      Log.e(TAG, "capture failed to start", e)
      ScreenEventBus.emitState(false, "Could not start screen capture: ${e.message}")
      stopSelf()
      START_NOT_STICKY
    }
  }

  private fun beginCapture(resultCode: Int, resultData: Intent) {
    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val projection = manager.getMediaProjection(resultCode, resultData)
      ?: throw IllegalStateException("permission was not granted")
    this.projection = projection
    projection.registerCallback(projectionCallback, null)

    val metrics = screenMetrics()
    val scale = MAX_DIMENSION.toFloat() / maxOf(metrics.widthPixels, metrics.heightPixels)
    // Never upscale a small screen; that would only cost bandwidth.
    val width = (metrics.widthPixels * minOf(scale, 1f)).toInt().coerceAtLeast(1)
    val height = (metrics.heightPixels * minOf(scale, 1f)).toInt().coerceAtLeast(1)

    val imageReader = ImageReader.newInstance(width, height, android.graphics.PixelFormat.RGBA_8888, 2)
    reader = imageReader

    virtualDisplay = projection.createVirtualDisplay(
      "ILink",
      width,
      height,
      metrics.densityDpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      imageReader.surface,
      null,
      null,
    )

    imageReader.setOnImageAvailableListener({ r -> onFrame(r, width, height) }, null)
    ScreenEventBus.emitState(true, null)
    Log.i(TAG, "capturing at ${width}x$height")
  }

  private fun onFrame(reader: ImageReader, width: Int, height: Int) {
    val image = reader.acquireLatestImage() ?: return
    try {
      val now = System.currentTimeMillis()
      // Throttle here rather than at the source: the display pushes frames as fast as it can.
      if (now - lastFrameAt < MIN_FRAME_INTERVAL_MS) return
      lastFrameAt = now

      val plane = image.planes[0]
      val rowPadding = plane.rowStride - plane.pixelStride * width
      val bitmapWidth = width + rowPadding / plane.pixelStride
      val bitmap = Bitmap.createBitmap(bitmapWidth, height, Bitmap.Config.ARGB_8888)
      bitmap.copyPixelsFromBuffer(plane.buffer)

      // Crop away the row-stride padding rather than shipping it.
      val cropped = if (bitmapWidth != width) {
        Bitmap.createBitmap(bitmap, 0, 0, width, height).also { bitmap.recycle() }
      } else {
        bitmap
      }

      val stream = ByteArrayOutputStream()
      cropped.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)
      cropped.recycle()

      ScreenEventBus.emitFrame(
        Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP),
        width,
        height,
      )
    } catch (e: Exception) {
      Log.w(TAG, "frame encode failed", e)
    } finally {
      image.close()
    }
  }

  @Suppress("DEPRECATION")
  private fun screenMetrics(): DisplayMetrics {
    val windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val metrics = DisplayMetrics()
    val bounds: Rect = windowManager.currentWindowMetrics.bounds
    metrics.widthPixels = bounds.width()
    metrics.heightPixels = bounds.height()
    metrics.densityDpi = resources.configuration.densityDpi
    return metrics
  }

  override fun onDestroy() {
    virtualDisplay?.release()
    reader?.close()
    projection?.unregisterCallback(projectionCallback)
    projection?.stop()
    virtualDisplay = null
    reader = null
    projection = null
    ScreenEventBus.emitState(false, null)
    super.onDestroy()
  }

  private fun createChannel() {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        "Screen sharing",
        NotificationManager.IMPORTANCE_LOW,
      ).apply { setShowBadge(false) },
    )
  }

  private fun buildNotification(): Notification =
    Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("Sharing your screen with your Mac")
      .setContentText("Tap the ILink app to stop")
      .setSmallIcon(R.drawable.ic_stat_ilink)
      .setOngoing(true)
      .build()
}

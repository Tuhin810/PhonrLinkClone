package com.phonelinkclone

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/**
 * File picking, chunked reads, and chunked writes.
 *
 * Written as a native module rather than pulling in a filesystem library: reading a content URI
 * in fixed-size chunks and publishing to Downloads through MediaStore is exactly what the
 * protocol needs, and a general-purpose fs bridge would be a much larger dependency to keep
 * alive for it.
 */
class FileTransferModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "FileTransfer"
    private const val PICK_REQUEST = 0x9101
  }

  override fun getName(): String = NAME

  private var pickPromise: Promise? = null

  /** Incoming transfers being assembled, keyed by a token handed back to JS. */
  private val incoming = mutableMapOf<String, File>()

  private val activityListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
      ) {
        if (requestCode != PICK_REQUEST) return
        val promise = pickPromise ?: return
        pickPromise = null

        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
          // Cancelling is a normal outcome, not an error.
          promise.resolve(null)
          return
        }
        promise.resolve(describe(uri))
      }
    }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  @ReactMethod
  fun pickFile(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("no_activity", "The app must be in the foreground to pick a file")
      return
    }
    // Reject an outstanding pick so a promise is never left dangling.
    pickPromise?.reject("superseded", "Another file picker was opened")
    pickPromise = promise
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    try {
      activity.startActivityForResult(intent, PICK_REQUEST)
    } catch (e: Exception) {
      pickPromise = null
      promise.reject("picker_failed", e)
    }
  }

  /** Reads `length` bytes at `offset` and returns them base64-encoded. */
  @ReactMethod
  fun readChunk(uriString: String, offset: Double, length: Double, promise: Promise) {
    try {
      reactContext.contentResolver.openInputStream(Uri.parse(uriString))!!.use { stream ->
        var skipped = 0L
        val target = offset.toLong()
        // skip() may return short; loop until we reach the offset or the stream ends.
        while (skipped < target) {
          val n = stream.skip(target - skipped)
          if (n <= 0) break
          skipped += n
        }
        val buffer = ByteArray(length.toInt())
        var read = 0
        while (read < buffer.size) {
          val n = stream.read(buffer, read, buffer.size - read)
          if (n < 0) break
          read += n
        }
        val slice = if (read == buffer.size) buffer else buffer.copyOf(read)
        promise.resolve(Base64.encodeToString(slice, Base64.NO_WRAP))
      }
    } catch (e: Exception) {
      promise.reject("read_chunk_failed", e)
    }
  }

  /** Begins assembling an incoming file in cache; returns a token for the later calls. */
  @ReactMethod
  fun beginReceive(fileName: String, promise: Promise) {
    try {
      val token = UUID.randomUUID().toString()
      val temp = File(reactContext.cacheDir, "phonelink-$token")
      temp.createNewFile()
      incoming[token] = temp
      promise.resolve(token)
    } catch (e: Exception) {
      promise.reject("begin_receive_failed", e)
    }
  }

  /**
   * Appends a chunk. Chunks are written in arrival order, so the sender must send them in
   * order — the protocol carries an index, and the JS layer buffers anything out of sequence.
   */
  @ReactMethod
  fun appendChunk(token: String, base64: String, promise: Promise) {
    val temp = incoming[token]
    if (temp == null) {
      promise.reject("unknown_transfer", "No transfer for token $token")
      return
    }
    try {
      FileOutputStream(temp, true).use { it.write(Base64.decode(base64, Base64.NO_WRAP)) }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("append_chunk_failed", e)
    }
  }

  /** Publishes the assembled file to Downloads/PhoneLinkClone and clears the temp copy. */
  @ReactMethod
  fun finishReceive(token: String, fileName: String, mimeType: String, promise: Promise) {
    val temp = incoming.remove(token)
    if (temp == null) {
      promise.reject("unknown_transfer", "No transfer for token $token")
      return
    }
    try {
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
        put(MediaStore.MediaColumns.MIME_TYPE, mimeType.ifBlank { "application/octet-stream" })
        put(
          MediaStore.MediaColumns.RELATIVE_PATH,
          "${Environment.DIRECTORY_DOWNLOADS}/PhoneLinkClone",
        )
      }
      val uri = reactContext.contentResolver
        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("MediaStore refused the file")

      reactContext.contentResolver.openOutputStream(uri)!!.use { out ->
        temp.inputStream().use { it.copyTo(out) }
      }
      temp.delete()
      promise.resolve(uri.toString())
    } catch (e: Exception) {
      temp.delete()
      promise.reject("finish_receive_failed", e)
    }
  }

  /** Drops a partial transfer, e.g. when the link goes away mid-file. */
  @ReactMethod
  fun abortReceive(token: String) {
    incoming.remove(token)?.delete()
  }

  private fun describe(uri: Uri): WritableMap {
    val map = Arguments.createMap()
    map.putString("uri", uri.toString())
    map.putString("mimeType", reactContext.contentResolver.getType(uri) ?: "application/octet-stream")

    reactContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (nameIndex >= 0) map.putString("name", cursor.getString(nameIndex))
        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
          map.putDouble("size", cursor.getLong(sizeIndex).toDouble())
        }
      }
    }
    return map
  }
}

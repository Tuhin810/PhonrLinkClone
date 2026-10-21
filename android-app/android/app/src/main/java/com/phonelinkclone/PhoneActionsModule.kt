package com.phonelinkclone

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.telecom.TelecomManager
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

/**
 * What the Mac's contacts page drives: reading the address book, placing a call and sending
 * a text. All three run on the phone; the Mac only asks. Call audio stays on the phone —
 * see docs/CONSTRAINTS.md #1.
 */
class PhoneActionsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "PhoneActions"
  }

  override fun getName(): String = NAME

  private fun granted(permission: String): Boolean =
    ContextCompat.checkSelfPermission(reactContext, permission) ==
      PackageManager.PERMISSION_GRANTED

  /** Every contact with at least one number, grouped, sorted by name, numbers de-duplicated. */
  @ReactMethod
  fun getContacts(promise: Promise) {
    if (!granted(Manifest.permission.READ_CONTACTS)) {
      promise.reject("permission_denied", "Contacts permission has not been granted on the phone")
      return
    }
    try {
      val contacts = LinkedHashMap<String, ContactRow>()
      val projection = arrayOf(
        Phone.CONTACT_ID,
        Phone.DISPLAY_NAME_PRIMARY,
        Phone.NUMBER,
        Phone.TYPE,
        Phone.LABEL,
        Phone.STARRED,
      )
      reactContext.contentResolver.query(
        Phone.CONTENT_URI,
        projection,
        null,
        null,
        "${Phone.DISPLAY_NAME_PRIMARY} COLLATE NOCASE ASC",
      )?.use { cursor ->
        val idCol = cursor.getColumnIndexOrThrow(Phone.CONTACT_ID)
        val nameCol = cursor.getColumnIndexOrThrow(Phone.DISPLAY_NAME_PRIMARY)
        val numberCol = cursor.getColumnIndexOrThrow(Phone.NUMBER)
        val typeCol = cursor.getColumnIndexOrThrow(Phone.TYPE)
        val labelCol = cursor.getColumnIndexOrThrow(Phone.LABEL)
        val starredCol = cursor.getColumnIndexOrThrow(Phone.STARRED)
        while (cursor.moveToNext()) {
          val id = cursor.getString(idCol) ?: continue
          val number = cursor.getString(numberCol)?.trim().orEmpty()
          if (number.isEmpty()) continue
          val row = contacts.getOrPut(id) {
            ContactRow(
              id = id,
              name = cursor.getString(nameCol)?.trim().takeUnless { it.isNullOrEmpty() } ?: number,
              starred = cursor.getInt(starredCol) == 1,
            )
          }
          // The same number is often stored twice ("+91 98..." and "098..."); keep one.
          if (!row.seenDigits.add(number.filter { it.isDigit() }.takeLast(10))) continue
          val label = Phone.getTypeLabel(
            reactContext.resources,
            cursor.getInt(typeCol),
            cursor.getString(labelCol),
          )?.toString()
          row.phones.add(number to label)
        }
      }
      val result = Arguments.createArray()
      for (row in contacts.values) result.pushMap(row.toMap())
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("contacts_failed", e)
    }
  }

  private class ContactRow(val id: String, val name: String, val starred: Boolean) {
    val phones = mutableListOf<Pair<String, String?>>()
    val seenDigits = mutableSetOf<String>()

    fun toMap(): WritableMap = Arguments.createMap().apply {
      putString("id", id)
      putString("name", name)
      putBoolean("starred", starred)
      putArray("phones", Arguments.createArray().apply {
        for ((number, label) in phones) {
          pushMap(Arguments.createMap().apply {
            putString("number", number)
            if (!label.isNullOrEmpty()) putString("label", label)
          })
        }
      })
    }
  }

  /**
   * Places a call through the system dialer. `TelecomManager.placeCall` works from the
   * background, unlike starting a dial activity, which Android blocks for background apps.
   */
  @ReactMethod
  fun placeCall(number: String, promise: Promise) {
    if (!granted(Manifest.permission.CALL_PHONE)) {
      promise.reject("permission_denied", "Phone call permission has not been granted on the phone")
      return
    }
    try {
      val telecom = reactContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      @Suppress("MissingPermission")
      telecom.placeCall(Uri.fromParts("tel", number, null), Bundle())
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("call_failed", e)
    }
  }

  /** Sends an SMS from the default SIM, split into parts when it is longer than one message. */
  @ReactMethod
  fun sendSms(number: String, body: String, promise: Promise) {
    if (!granted(Manifest.permission.SEND_SMS)) {
      promise.reject("permission_denied", "SMS permission has not been granted on the phone")
      return
    }
    try {
      val sms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        reactContext.getSystemService(SmsManager::class.java)
      } else {
        @Suppress("DEPRECATION")
        SmsManager.getDefault()
      }
      val parts = sms.divideMessage(body)
      if (parts.size > 1) {
        sms.sendMultipartTextMessage(number, null, parts, null, null)
      } else {
        sms.sendTextMessage(number, null, body, null, null)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("sms_failed", e)
    }
  }
}

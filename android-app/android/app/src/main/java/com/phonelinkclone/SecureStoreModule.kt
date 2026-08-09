package com.phonelinkclone

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Storage for the device's long-term private key.
 *
 * Backed by `EncryptedSharedPreferences`, whose master key lives in the Android Keystore — so
 * the secret is not readable from a backup or an adb pull of app data. AsyncStorage would have
 * been simpler and plaintext, which is not acceptable for a private key.
 */
class SecureStoreModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "SecureStore"
    private const val FILE = "phonelink_secure"
  }

  override fun getName(): String = NAME

  private val prefs: SharedPreferences by lazy {
    val masterKey = MasterKey.Builder(reactContext, MasterKey.DEFAULT_MASTER_KEY_ALIAS)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
      .build()
    EncryptedSharedPreferences.create(
      reactContext,
      FILE,
      masterKey,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  @ReactMethod
  fun getItem(key: String, promise: Promise) {
    try {
      promise.resolve(prefs.getString(key, null))
    } catch (e: Exception) {
      promise.reject("secure_store_read_failed", e)
    }
  }

  @ReactMethod
  fun setItem(key: String, value: String, promise: Promise) {
    try {
      prefs.edit().putString(key, value).apply()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("secure_store_write_failed", e)
    }
  }

  @ReactMethod
  fun removeItem(key: String, promise: Promise) {
    try {
      prefs.edit().remove(key).apply()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("secure_store_delete_failed", e)
    }
  }
}

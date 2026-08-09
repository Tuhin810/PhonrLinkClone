package com.phonelinkclone

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager

/**
 * Detects incoming calls.
 *
 * Uses the `PHONE_STATE` broadcast rather than `TelephonyCallback`, because from Android 12 the
 * callback API reports only the *state* — it carries no caller number at all. The broadcast
 * still supplies `EXTRA_INCOMING_NUMBER` on many devices when `READ_CALL_LOG` is granted; where
 * the OEM withholds it, the Mac shows the call without a number rather than nothing.
 *
 * Answering remotely is deliberately out of scope — see docs/CONSTRAINTS.md #1.
 */
class PhoneStateReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return

    when (intent.getStringExtra(TelephonyManager.EXTRA_STATE)) {
      TelephonyManager.EXTRA_STATE_RINGING -> {
        @Suppress("DEPRECATION")
        val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
        CallEventBus.emitRinging(number?.takeIf { it.isNotBlank() })
      }
      // Both "answered" and "hung up" end the alert: the Mac only ever showed a heads-up, and
      // once the call is no longer ringing that banner is stale either way.
      TelephonyManager.EXTRA_STATE_OFFHOOK,
      TelephonyManager.EXTRA_STATE_IDLE -> CallEventBus.emitEnded()
    }
  }
}

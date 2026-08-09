# Phase 7 — Incoming Call Alerts — COMPLETE (pending a real call)

**Completed:** 2026-08-09

Detection and alerting only. The app never answers, rejects, or routes audio — see
docs/CONSTRAINTS.md #1.

## What was built
Android:
- `PhoneStateReceiver.kt` — manifest-registered receiver for `ACTION_PHONE_STATE_CHANGED`.
- `CallEventBus.kt` — decouples the system-invoked receiver from the React context, and
  de-duplicates the several RINGING callbacks the platform delivers per call.
- `CallStateModule.kt` — forwards ringing/ended to JS, optional contact-name lookup, and a
  permission check the UI can use.
- Manifest: `READ_PHONE_STATE`, `READ_CALL_LOG`, `READ_CONTACTS` (optional), requested at
  runtime.

Mac:
- `NotificationPresenter.showCall()` — a single, `urgency: 'critical'`, `timeoutType: 'never'`
  banner that explicitly reads **"Answer on your phone"**. A notification that looked actionable
  but could not act would be worse than none.
- `dismissCall()` on `call_ended`, on disconnect, and before showing a newer call.
- Green in-app call banner in the popup, cleared the same way.

## Key decision: broadcast, not TelephonyCallback
The phase spec called for `TelephonyManager.registerTelephonyCallback` (API 31+). **That API
carries no caller number** — from Android 12 the callback reports state only, so the Mac would
show "someone is calling" and nothing else. The `PHONE_STATE` broadcast still supplies
`EXTRA_INCOMING_NUMBER` on most OEMs when `READ_CALL_LOG` is granted, so it is used instead.
Where an OEM withholds the number, the alert still fires with an unknown caller.

Both `OFFHOOK` and `IDLE` end the alert: once the call is no longer ringing, the heads-up is
stale whether it was answered or dismissed.

## Verified
- Android build installs; `READ_PHONE_STATE`, `READ_CALL_LOG` and `READ_CONTACTS` all show
  `granted=true` on device.
- `PhoneStateReceiver` is registered for `android.intent.action.PHONE_STATE` (confirmed in
  `dumpsys package`).
- Mac compiles and its 7 handshake tests still pass.

## Not verified
- **An actual incoming call.** `PHONE_STATE` is a protected broadcast, so it cannot be simulated
  from adb — the system refuses. Tuhin: ring the phone from another number with both apps
  running. Expected: a macOS banner reading "Incoming call — <name or number>" with
  "Answer on your phone", plus a green banner in the popup, both clearing when the call stops
  ringing. The Mac log will show `[call] incoming from …` and `[call] ended`.

## Known gaps carried forward
- **The caller number is OEM-dependent.** If Samsung withholds `EXTRA_INCOMING_NUMBER`, the
  alert shows an unknown caller. A `CallScreeningService` would get the number reliably but
  requires taking over call screening — too invasive for this.
- **No call history** — only live alerts.
- **No test coverage for the call path**: the Mac's routing lives in `main.ts`, which imports
  electron and so cannot be exercised by the node test runner. Moving envelope routing into a
  testable module is worth doing in Phase 9.

## Next phase
Phase 8 — file transfer. See `docs/phases/phase-08-file-transfer.md`.

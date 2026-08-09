# Phase 7 — Incoming Call Alerts

## Goal
Mac shows who's calling. Answering stays on the phone (CONSTRAINTS #1).

## Deliverables
- Kotlin `CallStateModule`: `registerTelephonyCallback` (API 31+) with `PhoneStateListener`
  fallback for older devices
- `CALL_STATE_RINGING` → `call_incoming`; `IDLE` after ringing/offhook → `call_ended`
- Caller number via the callback param; contact-name lookup only if contacts permission granted
- Permissions: `READ_PHONE_STATE` (+ `READ_CALL_LOG` where the OEM requires it), requested
  at runtime with a clear rationale screen
- Mac: high-priority native notification with sound + in-app banner, auto-dismissed on
  `call_ended`
- Explicit UI copy on the Mac banner: "Answer on your phone"

## Exit check
Call the phone → banner within ~1s with number (name if available). Reject or answer on the
phone → banner clears.

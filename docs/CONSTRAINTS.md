# Known Constraints

These are accepted limitations, not bugs. Surface them in-app where a user would otherwise
be confused.

## 1. Remote call *answering* is out of scope; declining is implemented
Windows Phone Link works because the PC pairs as a Bluetooth hands-free device and the phone
routes call audio to it over HFP. macOS provides no API to act as a hands-free *device*, and
streaming the audio ourselves would need `CAPTURE_AUDIO_OUTPUT` on Android — a privileged
permission unavailable to normal apps. So a remote "Answer" button would connect the call while
the audio stayed on the phone: a promise the app cannot keep.

**What Phase 7 delivers:** alerts, plus **Decline** and **Silence ringer** from the Mac
(`TelecomManager.endCall()` under `ANSWER_PHONE_CALLS`). Those are useful without audio routing
— killing a spam call without touching the phone. Answering is deliberately absent.

`ANSWER_PHONE_CALLS` draws extra Google Play scrutiny; fine for sideloaded personal use.

## 2. Android 10+ background clipboard reads are restricted
`ClipboardManager` reads only work when the app has focus or is the default IME. **Confirmed on
device in Phase 6**: the foreground service keeps the process alive but grants no read access,
so copying in another app cannot reach us passively. Writing is unrestricted, so Mac -> phone
is unaffected.

What is implemented instead of fighting this:
1. Passive listener — works while the PhoneLink app is on screen.
2. **Share sheet target** ("Share -> PhoneLink") — the dependable route, works from any app.
3. "Send clipboard to Mac" button in the app.
4. Accessibility service — deliberately NOT built. It is a heavy, invasive permission for a
   convenience feature; revisit only if the share-sheet route proves inadequate.

Samsung / Xiaomi / OnePlus add further battery restrictions — Phase 9 adds per-OEM battery
optimization whitelist instructions in-app.

## 3. mDNS fails on some networks
Router client isolation (common on guest and public wifi) blocks peer discovery. Expected
result: app shows "disconnected" and keeps retrying. Not a defect. Phase 4 ships a manual
IP entry escape hatch in Settings for these networks.

## 4. Play Store policy
`BIND_NOTIFICATION_LISTENER_SERVICE` + `READ_PHONE_STATE` + `READ_CALL_LOG` draw extra review.
Target is personal/sideloaded use, so this is acceptable — but do not assume publishability.

## 5. Notification listener permission cannot be auto-granted
The user must toggle it manually in Android system settings
(`Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`). Onboarding must deep-link there and
explain why.

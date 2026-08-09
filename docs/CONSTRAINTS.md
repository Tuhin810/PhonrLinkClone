# Known Constraints

These are accepted limitations, not bugs. Surface them in-app where a user would otherwise
be confused.

## 1. Remote call answering is out of scope
Windows Phone Link routes call audio via proprietary OEM/Bluetooth integration. A DIY app can
**detect and alert** but not answer or route audio. `ANSWER_PHONE_CALLS` is also heavily
scrutinized by Google Play. Phase 7 delivers alerts only; the answer action stays on the phone.

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

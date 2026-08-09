# Phase 2 — Android Notification Capture — COMPLETE

**Completed:** 2026-08-09

## What was built
Kotlin, in `android-app/android/app/src/main/java/com/phonelinkclone/`:
- `NotificationRelayService.kt` — `NotificationListenerService`; extracts package/title/text and
  the small icon as a 64x64 base64 PNG. Skips our own package (loop guard) and `isOngoing`
  notifications (media controls, progress bars — desktop noise).
- `NotificationEventBus.kt` — rendezvous between the system-owned listener service and the
  React context, which have independent lifetimes. Events with no sink registered are dropped
  rather than queued.
- `NotificationBridgeModule.kt` — JS API: `isNotificationAccessGranted`,
  `openNotificationAccessSettings`, foreground-service start/stop, and event emission over
  `RCTDeviceEventEmitter`.
- `LinkForegroundService.kt` — persistent "PhoneLink Clone is running" notification.
- `PhoneLinkPackage.kt` — registered manually in `MainApplication.kt` (not autolinked; these
  modules live in the app, not a library).

TypeScript, in `android-app/src/`:
- `config.ts` — `MAC_HOST` / `MAC_PORT`; currently `192.168.1.9`. Phase 4 replaces this.
- `native/notificationBridge.ts` — typed wrapper over the native module.
- `net/linkClient.ts` — WS client, exponential backoff with jitter, ping/pong heartbeat.
- `useNotificationMirror.ts` — wires permission state, foreground service, native events and
  the socket together.
- `App.tsx` — dashboard: status dot, permission banner, sent/dropped counters, 20-item feed.

Project: RN 0.86.2 bare, TypeScript, new architecture on.

## Exit check result
**All four legs passed.** Environment: Samsung device `RZCW8063A3P`, Android 16 / API 36;
macOS 25.5.0 at 192.168.1.9; phone at 192.168.1.10; same wifi. The Mac side was a throwaway
Node `ws` listener (the real receiver is Phase 3) that validated frames with the shared
`tryParseEnvelope`.

1. **Notification mirroring** — `adb shell cmd notification post` → listener printed
   `[notification] com.android.shell | FeedCheck | rendering | icon:1212b64`. Icon arrived as
   valid base64.
2. **Dismissal** — snoozing the notification produced
   `[notification_dismiss] {"id":"0|com.android.shell|2020|DismissTag|2000"}`, and the row
   disappeared from the in-app feed.
3. **Reconnect** — killed the listener for 20s; the phone reconnected on its own when it came
   back (`[open] 192.168.1.10`). Note: this exercised the backoff path via a dead peer rather
   than by literally toggling wifi.
4. **Dashboard** — screenshot confirmed green "Connected to Mac", target address, sent/dropped
   counters, and the notification row rendering with app package, title and body.

## Bugs found on device and fixed
- **Crash on launch: `SecurityException` starting the foreground service.** On targetSdk 36 the
  `connectedDevice` FGS type requires `FOREGROUND_SERVICE_CONNECTED_DEVICE` **and** at least
  one transport permission from a set (Bluetooth / wifi-state / multicast / NFC / UWB). Only
  the former was declared, so `startForeground()` threw and killed the app. Fixed by declaring
  `CHANGE_WIFI_MULTICAST_STATE` — the one we actually need, since Phase 4 mDNS depends on it —
  and by wrapping `startForeground()` in a try/catch so an OEM rejection degrades instead of
  crashing.

## Decisions made
- **minSdk raised 24 → 26** — `startForegroundService()` and notification channels need API 26,
  and the foreground service is mandatory for this app anyway.
- **FGS type `connectedDevice`, not `dataSync`** — `dataSync` carries a daily runtime cap on
  Android 15+ that would kill a persistent link.
- **Shared package via `file:../shared` + Metro `watchFolders`** — resolves the open question
  from Phase 1. TS `paths` maps `@phonelink/shared` → `../shared/src`.
- **Legacy bridge module, not a TurboModule** — RN 0.86's interop layer supports it and it
  keeps Phase 2 free of codegen setup. Revisit if a later phase needs sync native calls.
- **Dropped-while-offline messages are counted and shown, not queued** — silent loss would be
  worse; queuing is a Phase 9 concern.

## Known gaps carried forward
- **Cleartext WS blocked in release builds.** `usesCleartextTraffic` is false for release, so a
  release APK cannot use `ws://`. Debug builds are unaffected. **Phase 5 must settle this** when
  it adds encryption.
- **Icon renders blank for white-on-transparent icons** in the in-app feed (the row background
  is white). Cosmetic; the base64 payload itself is correct. Phase 9 polish.
- **A dev-only warning toast** ("Open debugger to view warnings") appears in debug builds; it
  did not correlate with any logcat error and does not affect behaviour. Worth identifying in
  Phase 3 when a debugger is attached anyway.
- **No per-app filter** — every app's notifications are mirrored. Phase 9 owns the filter UI.
- **No automated tests** — carried over from Phase 1.
- **Wifi-toggle reconnect not literally tested** — the equivalent dead-peer path was.

## How to re-verify
```bash
# Mac: a raw listener that validates frames with the shared protocol package
node -e "
const {WebSocketServer}=require('ws');
const {tryParseEnvelope}=require('./shared/dist');
new WebSocketServer({port:47711,host:'0.0.0.0'}).on('connection',s=>{
  console.log('open');
  s.on('message',r=>{const e=tryParseEnvelope(r.toString());
    if(e&&e.type==='ping')return s.send('{\"type\":\"pong\"}');
    console.log(e&&e.type,e);});
});"

# Phone: set MAC_HOST in android-app/src/config.ts, then
cd android-app && npm run android

# Trigger a notification
adb shell cmd notification post -S bigtext -t Test TestTag "hello"
```

## Next phase
Phase 3 — Mac receiver (Electron tray app). See `docs/phases/phase-03-mac-receiver.md`.
This completes the vertical slice.

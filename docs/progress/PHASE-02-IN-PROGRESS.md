# Phase 2 — Android Notification Capture — IN PROGRESS

**Not complete.** Code is written and typechecks, but the Exit check has NOT been run:
the Gradle build and on-device test are pending (Tuhin is running them). Do not mark this
phase ✅ or start Phase 3 until the Exit check passes and this file is replaced by
`PHASE-02-COMPLETE.md`.

## What is written
- RN 0.86.2 bare project scaffolded in `android-app/` (TypeScript, new architecture on)
- Kotlin, in `android/app/src/main/java/com/phonelinkclone/`:
  - `NotificationRelayService.kt` — `NotificationListenerService`; extracts package/title/text,
    small icon → 64x64 base64 PNG; skips own package and ongoing notifications
  - `NotificationEventBus.kt` — decouples the system-owned listener service from the React
    context, which have independent lifetimes
  - `NotificationBridgeModule.kt` — JS API: permission check, settings deep link,
    foreground-service control, event emission via `RCTDeviceEventEmitter`
  - `LinkForegroundService.kt` — persistent "PhoneLink Clone is running" notification
  - `PhoneLinkPackage.kt` — registered in `MainApplication.kt`
- TypeScript, in `android-app/src/`:
  - `config.ts` — `MAC_HOST` **must be edited to your Mac's LAN IP**
  - `native/notificationBridge.ts` — typed wrapper over the native module
  - `net/linkClient.ts` — WS client, exponential backoff + jitter, ping/pong heartbeat
  - `useNotificationMirror.ts` — wires permission, service, native events and socket together
  - `App.tsx` — dashboard: status dot, permission banner, sent/dropped counters, 20-item feed

## Verified so far
- `npx tsc --noEmit` passes clean.
- Gradle build: **not run.**
- On-device Exit check: **not run.**

## Decisions made
- **minSdk raised 24 → 26.** `startForegroundService()` and notification channels need API 26,
  and the foreground service is mandatory for this app anyway.
- **Foreground service type `connectedDevice`, not `dataSync`.** targetSdk 36 requires a typed
  service; `dataSync` carries a daily runtime cap on Android 15+ that would kill a persistent
  link. `connectedDevice` describes a LAN link to a paired Mac accurately.
- **Shared package via `file:../shared` + Metro `watchFolders`.** Resolves the open question
  from Phase 1. TS `paths` maps `@phonelink/shared` → `../shared/src` for typechecking.
- **Ongoing notifications filtered out** — media controls and progress bars update constantly
  and are desktop noise.
- **Legacy bridge module, not a TurboModule.** RN 0.86's interop layer supports it, and it
  keeps Phase 2 free of codegen setup.
- **Dropped-while-offline messages are counted and shown, not queued.** Silent loss would be
  worse; queuing is a Phase 9 concern.

## Known gaps carried forward
- **No Mac receiver yet** — that is Phase 3. Until then the Exit check needs a raw WS listener.
- **Cleartext WS in release builds.** `usesCleartextTraffic` is false for release, so a release
  build cannot use `ws://`. Fine for Phase 2 debug builds; Phase 5 adds encryption and should
  settle this properly.
- **No per-app filter** — every app's notifications are mirrored. Phase 9 owns the filter UI.
- **No automated tests** — carried over from Phase 1.

## Exit check (to run)
```bash
# 1. On the Mac, start a raw WebSocket listener:
npx wscat --listen 47711

# 2. Set your Mac's LAN IP in android-app/src/config.ts (MAC_HOST)

# 3. Build and run on a device on the same wifi:
cd android-app && npm run android

# 4. In the app, tap the yellow banner → enable PhoneLink Clone in system settings → return
# 5. Trigger any notification on the phone
```
Expected: a `notification` envelope prints in the wscat listener; the app's feed shows the same
item; turning wifi off flips the status to "Disconnected" and it recovers when wifi returns.

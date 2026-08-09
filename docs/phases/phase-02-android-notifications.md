# Phase 2 — Android Notification Capture

## Goal
Android app reads system notifications and pushes them to a hardcoded Mac IP over plain
WebSocket. No discovery, no crypto, no UI polish yet.

## Deliverables
- RN bare-workflow project in `android-app/` (TypeScript template)
- Kotlin `NotificationListenerModule`
  - extends `NotificationListenerService`
  - `onNotificationPosted` → package name, title, text, small-icon bitmap → base64
  - `onNotificationRemoved` → `notification_dismiss`
  - filters out own package to avoid feedback loops
- Kotlin `ForegroundService` with persistent "PhoneLink Clone is running" notification
- `DeviceEventEmitter` bridge → TS listener
- TS WebSocket client with reconnect backoff, Mac IP from a constant
- Manifest: `BIND_NOTIFICATION_LISTENER_SERVICE`, `FOREGROUND_SERVICE`, `INTERNET`,
  `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`
- Minimal Dashboard screen: connection status + last 20 notifications

## Risks
- Notification listener permission is manual (see CONSTRAINTS #5) — deep-link from onboarding.
- Icon base64 can be large; downscale to 64x64 PNG before encoding.

## Exit check
Trigger a notification on the phone → the `notification` envelope appears in a `wscat`/`nc`
listener on the Mac. Kill wifi → app shows "disconnected", retries, recovers on reconnect.

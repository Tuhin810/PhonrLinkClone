# Phase 3 — Mac Receiver (vertical slice complete)

## Goal
Electron tray app accepts the Android WebSocket connection and posts real macOS notifications.

## Deliverables
- `mac-app/` Electron + TypeScript, main/renderer split
- Main: `ws` server on a fixed LAN port, `parseEnvelope()` on every frame
- `notification` → `new Notification({ title, body, icon })`
- `notification_dismiss` → close the matching native notification (track by envelope `id`)
- Tray icon + small `BrowserWindow` popup (no dock icon, no full window)
- Popup UI: connection status, paired device name, scrolling notification feed
- Heartbeat: `ping`/`pong` every 15s, mark disconnected after 2 misses

## Exit check
End-to-end: notification on phone → native macOS notification on Mac, over LAN, within ~1s.
Dismiss on phone → banner clears on Mac. **This is the milestone worth demoing.**

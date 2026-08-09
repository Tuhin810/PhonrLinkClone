# Phase 9 — Polish

## Deliverables
- Reconnect: exponential backoff with jitter, capped; instant retry on network-change event
- Android battery optimization exemption prompt + per-OEM instructions (CONSTRAINTS #2)
- Mac `app.setLoginItemSettings({ openAtLogin: true })`, user-toggleable
- Per-app notification mirroring filter (enabled packages in AsyncStorage) with an app picker
- Empty/error states: "disconnected", "not paired", "notification access not granted"
- README with build + sideload instructions for both apps

## Exit check
Reboot both devices → everything reconnects with no manual steps.

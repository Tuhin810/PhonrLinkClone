# Phase 4 — mDNS Discovery

## Goal
Remove hardcoded IPs.

## Deliverables
- Mac advertises `_phonelink._tcp` via `bonjour-service` (name, port, deviceName in TXT)
- Android browses via `react-native-zeroconf`, connects to the first matching service
- Manual IP override field in Android Settings (escape hatch for CONSTRAINTS #3)
- Background re-browse on disconnect, with backoff

## Exit check
Fresh install on both sides, same wifi, zero configuration → connects. Move phone to mobile
data → "disconnected". Return to wifi → reconnects without user action.

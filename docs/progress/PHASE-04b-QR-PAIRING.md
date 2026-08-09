# Phase 4b — QR pairing (address only)

**Added:** 2026-08-09 — an unplanned addition on top of Phase 4, at Tuhin's request.

Scanning a QR replaces typing the Mac's IP by hand. This is **Phase 5's pairing mechanism
pulled forward, without the crypto** — the code carries only an address today.

## What was built
Shared:
- `PairingPayload` + `parsePairingPayload()` in `shared/src/protocol.ts`. The payload is
  `{ app: 'phonelink', v, host, port, device }`. `app` discriminates it from any other QR, and
  `v` is versioned separately from `PROTOCOL_VERSION` so Phase 5 can add `pubKey` and
  `pairingToken` additively.

Mac:
- `main.ts` renders the payload to a QR data URL with `qrcode`, cached per address (the state
  push runs on every notification). Sent to the renderer alongside the rest of the state.
- The popup shows the QR **only while no phone is connected** — once paired it is clutter.
- `--dev` now opens the popup on launch, so the UI can be iterated on without tray clicks.

Android:
- `src/discovery/ScanQrScreen.tsx` — `react-native-vision-camera` v4 `useCodeScanner`, with
  camera-permission handling and a cancel action. On a valid payload it saves the host as the
  manual address, which the existing socket logic picks up.
- "Scan QR from Mac" action in the dashboard header; `CAMERA` permission in the manifest.

Also done in this pass: **the tray icon is now the Bootstrap `phone-fill` glyph**, rasterised
at 16px and 32px (retina) by `mac-app/scripts/generate-tray-icon.js` — analytic drawing with
supersampling, so no SVG rasteriser or asset pipeline is needed. Re-run that script to change it.

## Verified
- Payload encodes and round-trips through `parsePairingPayload`; a non-PhoneLink QR
  (`https://example.com`) is rejected.
- QR renders to a data URL (~3.4KB) and the popup markup/CSP allow `data:` images.
- The scanner screen opens on the phone and `CAMERA` is granted.

## Not verified
- **The actual scan.** Pointing the phone at the Mac screen needs a human; the camera preview
  is also invisible to `adb screencap` (SurfaceView), so this cannot be checked remotely.
  Tuhin to confirm: open the Mac popup with no phone connected, tap "Scan QR from Mac" on the
  phone, point at the code — the phone should connect immediately.

## Note
Repeatedly killing the Mac app with `pkill` (rather than quitting it) left stale Bonjour
registrations, so macOS kept bumping the advertised hostname (`Tuhins-MacBook-Air-2`, `-3`, …).
Cosmetic and transient — the name settles once the stale registrations expire. Quitting via the
popup's Quit runs `unpublishAll` and avoids it.

## Version note
`react-native-vision-camera` was pinned to **v4** (4.7.3). v5 is a nitro-module rewrite with no
`useCodeScanner`; do not upgrade without rewriting `ScanQrScreen.tsx` against the new
`useObjectOutput` API.

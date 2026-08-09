# Phase 3 — Mac Receiver — COMPLETE

**Completed:** 2026-08-09
**The vertical slice (phases 1–3) is now working end to end.**

## What was built
`mac-app/`, Electron 33 + TypeScript, main/renderer split:
- `src/main/linkServer.ts` — `ws` server on 0.0.0.0:47711. Validates every frame with the
  shared `tryParseEnvelope`, answers `ping` with `pong`, runs its own 15s heartbeat and
  terminates a socket after 2 missed pongs. A new connection replaces the old one rather than
  being rejected — that is what a phone reconnecting after a network blip looks like.
- `src/main/notifications.ts` — posts macOS notifications, tracks handles by envelope `id` so
  a phone-side dismissal can close the banner. Map is bounded at 50 entries.
- `src/main/main.ts` — tray icon, popup positioning, envelope routing, state push to renderer.
  Dock icon hidden. Later-phase envelope types are explicitly ignored (not errors), with
  `assertNever` in the default branch so a new message type breaks the build here.
- `src/main/trayIcon.ts` — 16x16 template PNG inlined as base64; no asset pipeline needed.
- `src/main/network.ts` — lists LAN IPv4 addresses for the popup.
- `src/main/preload.ts` — context-isolated bridge exposing exactly three calls.
- `src/renderer/` — popup UI (status dot, address, notification feed, Quit) with a strict CSP
  and light/dark support.

## Exit check result
**Passed.** Environment: macOS 25.5.0 at 192.168.1.9, Electron 33.4.11; Samsung `RZCW8063A3P`
on Android 16 / API 36 at 192.168.1.10; same wifi.

- **Mirroring:** real WhatsApp notifications and an `adb`-posted test notification both arrived
  and displayed. Main-process log showed `[link] connected` → `[envelope] notification` →
  `[notification shown] com.whatsapp: …`. The `show` event fires on actual macOS display, so
  this confirms delivery rather than just the call being made. Latency was visually immediate.
- **Dismissal:** snoozing the notification on the phone produced `[envelope]
  notification_dismiss` on the Mac, and the row disappeared from the popup feed.
- **Popup UI:** screenshot confirmed green "Phone connected", `192.168.1.9 : 47711`, and the
  notification feed rendering with app package, title, body and WhatsApp icons in dark mode.

## Environment problems hit and fixed
These cost most of the phase and will recur on a fresh clone:
- **`ELECTRON_RUN_AS_NODE=1` is exported by the VS Code integrated terminal.** It makes the
  Electron binary boot as plain Node, so `require('electron')` returns undefined and the app
  dies on `app.dock`. Fixed by pinning `env -u ELECTRON_RUN_AS_NODE` into the `start`/`dev`
  scripts. **If Electron ever fails with "Cannot read properties of undefined", check this
  first.**
- **npm 11 blocks lifecycle scripts by default**, so Electron's postinstall never ran and the
  binary was missing/partial. `node node_modules/electron/install.js` also extracted
  incompletely (app bundle without Frameworks). Fixed by extracting the cached zip directly:
  `ditto -x -k ~/Library/Caches/electron/*/electron-v33.4.11-darwin-arm64.zip node_modules/electron/dist`
  then writing `node_modules/electron/path.txt` with `Electron.app/Contents/MacOS/Electron`.

## Decisions made
- **Mac is the server, phone is the client** — the Mac has the stable address on the LAN.
- **tsc consumes `shared/dist`, not `shared/src`** (unlike Metro, which bundles source). The
  `paths` mapping was removed and `build` now chains `npm --prefix ../shared run build` first.
- **Tray icon inlined as base64** rather than shipping an asset directory.
- **Later-phase envelopes explicitly ignored** in the switch, so `assertNever` still guarantees
  exhaustiveness when Phases 6–8 add handling.
- **Dev logging left in** (`[link]`, `[envelope]`, `[notification shown]`) — it is how this
  phase was verified and the same lines will verify Phases 6–8.

## Known gaps carried forward
- **No packaged .app** — runs via `npm start` from source. Packaging and launch-at-login are
  Phase 9.
- **Notification permission not requested explicitly.** macOS granted it implicitly here; a
  first run on a clean machine may need approval in System Settings → Notifications.
- **`notification_dismiss` closes the banner only if still on screen** — macOS retires banners
  quickly, so the effect is often invisible. Working as intended.
- **No pairing or encryption** — any device on the LAN can connect to port 47711 today.
  Phase 5 closes this. Do not use on an untrusted network until then.
- **Hardcoded IP still on the phone side** — Phase 4.
- **Still no automated tests** — carried from Phases 1 and 2.

## How to re-verify
```bash
cd mac-app && npm start          # tray icon appears; popup on click
adb shell cmd notification post -S bigtext -t Test TestTag "hello"
```
Expect a macOS banner within ~1s and a matching row in the popup feed.

## Next phase
Phase 4 — mDNS discovery, removing the hardcoded IP.
See `docs/phases/phase-04-discovery.md`.

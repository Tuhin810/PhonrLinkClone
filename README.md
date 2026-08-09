# PhoneLink Clone

LAN-only Android ↔ Mac sync: notification mirroring, incoming-call alerts, clipboard sync,
and file transfer. No cloud, no relay — if the devices aren't on the same wifi, the app
shows "disconnected" and keeps retrying.

## Status
**Phase 3 of 9 complete — the vertical slice works end to end.** Android notifications now
mirror to macOS Notification Center over the LAN. See
[docs/progress/PHASE-03-COMPLETE.md](docs/progress/PHASE-03-COMPLETE.md).
Next up: Phase 4, mDNS discovery to remove the hardcoded IP.

```bash
cd mac-app && npm start      # menu bar receiver
cd android-app && npm run android
```

Working on this in a new session? **Read [INSTRUCTIONS.md](INSTRUCTIONS.md) first** — it
explains how to determine current progress and the rules every phase follows.
See [docs/ROADMAP.md](docs/ROADMAP.md) for the phase plan and
[docs/CONSTRAINTS.md](docs/CONSTRAINTS.md) for accepted limitations.

## Layout
- `shared/` — protocol types + runtime validators, consumed by both apps
- `android-app/` — React Native, bare workflow (native Kotlin modules required)
- `mac-app/` — Electron, tray-only UI
- `docs/phases/` — one spec per phase, each with an exit check

## Build shared
```bash
cd shared && npm install && npm run build
```

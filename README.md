# PhoneLink Clone

LAN-only Android ↔ Mac sync: notification mirroring, incoming-call alerts, clipboard sync,
and file transfer. No cloud, no relay — if the devices aren't on the same wifi, the app
shows "disconnected" and keeps retrying.

## Status
**Phase 1 of 9 complete** (protocol contract) — see
[docs/progress/PHASE-01-COMPLETE.md](docs/progress/PHASE-01-COMPLETE.md).
Next up: Phase 2, Android notification capture.

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

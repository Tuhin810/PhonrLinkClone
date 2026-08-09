# PhoneLink Clone

LAN-only Android ↔ Mac sync: notification mirroring, incoming-call alerts, clipboard sync,
and file transfer. No cloud, no relay — if the devices aren't on the same wifi, the app
shows "disconnected" and keeps retrying.

## Status
**Phase 4 of 9 complete.** Android notifications mirror to macOS Notification Center over the
LAN, with mDNS discovery and a manual-address fallback. See
[docs/progress/PHASE-04-COMPLETE.md](docs/progress/PHASE-04-COMPLETE.md) — note that the
discovery path could not be verified on the test network, which filters multicast.
**Phase 5 of 9 complete**: devices pair by QR and the channel is encrypted with tweetnacl —
the LAN port no longer accepts unpaired devices. See
[docs/progress/PHASE-05-COMPLETE.md](docs/progress/PHASE-05-COMPLETE.md).
**Phase 6 of 9 complete**: clipboard sync both directions, plus a real test suite
(`npm test` in `shared/` and `mac-app/` — 27 tests). See
[docs/progress/PHASE-06-COMPLETE.md](docs/progress/PHASE-06-COMPLETE.md).
**Phase 7 of 9 complete**: incoming calls raise a banner on the Mac (detection only — you
still answer on the phone). See
[docs/progress/PHASE-07-COMPLETE.md](docs/progress/PHASE-07-COMPLETE.md).
Next up: Phase 8, file transfer.

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

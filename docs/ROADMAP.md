# PhoneLink Clone — Phased Roadmap

LAN-only Android ↔ Mac sync. No cloud, no relay. "Disconnected" is a valid resting state.

Each phase is independently testable and ends with an explicit **Exit check** you can run
before approving the next phase. Nothing from a later phase gets built early.

| Phase | Name | Deliverable | Status |
|-------|------|-------------|--------|
| 1 | Protocol contract | `shared/` package: `Envelope` type + runtime validators | ✅ [Done](progress/PHASE-01-COMPLETE.md) |
| 2 | Android notification capture | Kotlin `NotificationListenerModule` + WS client, hardcoded Mac IP | ✅ [Done](progress/PHASE-02-COMPLETE.md) |
| 3 | Mac receiver | Electron tray app, WS server, native macOS notifications | ⬜ Not started |
| 4 | Discovery | mDNS/Bonjour both sides, remove hardcoded IPs | ⬜ Not started |
| 5 | Pairing + crypto | QR pairing, shared secret, tweetnacl-encrypted channel | ⬜ Not started |
| 6 | Clipboard sync | Bidirectional, echo-loop guarded | ⬜ Not started |
| 7 | Call alerts | `CallStateModule` → Mac banner (detect only, never answer) | ⬜ Not started |
| 8 | File transfer | Chunked offer/chunk/complete, both directions | ⬜ Not started |
| 9 | Polish | Reconnect, battery whitelist prompt, launch-at-login | ⬜ Not started |

**Vertical slice = phases 1–3.** Get a notification from the phone onto the Mac screen over
LAN before touching anything else.

## Session hand-off
New sessions: read `INSTRUCTIONS.md` first. Completed phases each have a record in
`docs/progress/PHASE-XX-COMPLETE.md` — the highest-numbered file is the current state.

## Rules that hold across all phases
- `shared/src/protocol.ts` is the single source of truth. Neither side invents fields.
- TypeScript everywhere on the JS layers. Kotlin only for the Android native modules.
- Every phase leaves the repo in a runnable state.
- Constraints in `docs/CONSTRAINTS.md` are flagged, never silently worked around.

## Layout
```
phonelink-clone/
├── shared/      # protocol types + validators (consumed by both apps)
├── android-app/ # React Native, bare workflow (native Kotlin modules required)
├── mac-app/     # Electron, tray-only UI
└── docs/        # this roadmap + per-phase specs + constraints
```

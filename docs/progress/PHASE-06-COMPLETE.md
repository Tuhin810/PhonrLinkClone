# Phase 6 — Clipboard Sync — COMPLETE (one direction verified, one pending)

**Completed:** 2026-08-09

## What was built
Shared:
- `CLIPBOARD_MAX_BYTES` (256KB). Oversized clips are skipped and reported, not truncated.

Android:
- `ClipboardModule.kt` — `OnPrimaryClipChangedListener`, `getText`/`setText`, events to JS.
  Remembers the last value it wrote so an inbound paste is not echoed back.
- `src/clipboard/useClipboardSync.ts` — content-based echo guard, size cap, per-device toggle.
- Toggle in the dashboard; the socket routes inbound `clipboard_update` to the clipboard.

Mac:
- `src/main/clipboardSync.ts` — 1s poll (Electron has no clipboard-change event), content-based
  echo guard, size cap, enable/disable. Seeds `lastSeen` on start and on re-enable so existing
  clipboard content is never replayed as a change.
- "Clipboard: on/off" button in the popup.

**Echo-loop guard:** both sides compare content against the last value seen or written.
`sourceDevice` is a second line of defence only — a poll cannot tell who put text on the
clipboard, so content comparison is what actually stops a copy bouncing forever.

## Tests — the repo now has a real suite
This is the gap flagged in Phase 5, closed. `npm test` in both packages:
- `shared/test/protocol.test.ts` + `crypto.test.ts` — 20 tests: envelope validation (unknown
  types, missing fields, bad chunk indices, oversized chunks, bad enum values), pairing payload
  parsing/versioning, pairing proofs (wrong token, replayed key, malformed input), and the
  sealed channel (key agreement, no plaintext leakage, wrong key, tampered frame, unsealed frame).
- `mac-app/test/handshake.test.ts` — 7 tests driving the **real** `LinkServer` against a stub
  keystore: every rejection path plus successful pairing, encrypted traffic, trusted reconnect,
  and stale-token replay.

All 27 pass.

## Exit check result
- **Mac → phone: verified.** Copied `HELLO-FROM-MAC` on the Mac; the Mac logged
  `[clipboard] local change, 14 chars -> phone` and the phone's keyboard clipboard suggestion
  showed the same string.
- **Phone → Mac: verified**, via the share-sheet route added after the first attempt failed.
  Sharing `SHARED-FROM-PHONE-99` to PhoneLink produced `[clipboard] from phone, 20 chars` on the
  Mac and `pbpaste` returned the same string.
- **No echo loop observed** during the Mac → phone test.

## Incident during testing
A blind `adb shell input tap` intended for the PhoneLink app landed in WhatsApp while it was
foregrounded, and **sent a message to one of Tuhin's contacts**. Reported immediately and
device UI automation abandoned. Rule going forward: never drive the phone's UI blind — check
what is foregrounded first, or hand the step to the user.

## Making phone → Mac actually work
Passive listening alone is a dead end on modern Android (see the constraint below), so the
phone gained two explicit routes, both of which work from a cold start:
- **Share sheet target** — `ACTION_SEND` / `text/plain` intent filter, plus `onNewIntent` on
  `MainActivity` so a share into an already-running app is not ignored. Long-press text
  anywhere → Share → PhoneLink.
- **"Send clipboard to Mac"** button in the dashboard.

**Sends are queued until the link is up.** Sharing into the app usually *starts* the app, so
the socket is still connecting when the text arrives — the first attempt dropped it silently,
which is the worst outcome for an explicit user action. Queued text flushes on connect.

## Constraint confirmed (docs/CONSTRAINTS.md #2)
**Phone → Mac only works while the PhoneLink app has focus.** Android 10+ blocks clipboard
reads for apps that are not foreground or the default IME; the foreground service keeps the
process alive but does not grant read access. Mac → phone is unaffected, because *writing* is
unrestricted. The accessibility-service fallback named in the constraint remains unimplemented —
it is a large hammer for this, and worth a conversation before building it.

## Known gaps carried forward
- Passive phone → Mac capture still needs the app on screen; the share sheet is the answer for
  everything else. The accessibility fallback is deliberately not built — an invasive
  permission for a convenience feature.
- Clipboard state is not synced on connect — only changes after connection propagate.
- No history or undo; the newest value wins.
- Toggles are per-device and not persisted across restarts.

## How to re-verify
```bash
cd shared && npm test        # 20 tests
cd mac-app && npm test       # 7 tests
```
Mac → phone: copy text on the Mac, then check the phone's clipboard.
Phone → Mac: open the PhoneLink app on the phone, copy text **while it is in focus**, then
paste on the Mac.

## Next phase
Phase 7 — incoming call alerts. See `docs/phases/phase-07-calls.md`.

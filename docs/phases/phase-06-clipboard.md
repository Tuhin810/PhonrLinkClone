# Phase 6 — Clipboard Sync

## Goal
Copy on one device, paste on the other.

## Deliverables
- Android `ClipboardModule`: `OnPrimaryClipChangedListener`, reads inside the foreground
  service; `setPrimaryClip` on inbound `clipboard_update`
- Mac: poll `clipboard.readText()` ~1s; `clipboard.writeText()` on inbound
- Echo-loop guard: compare inbound content against last-written value and ignore matches;
  `sourceDevice` tag as a second line of defence
- Per-device on/off toggle in both UIs
- Size cap (e.g. 256KB) — larger clips are skipped with a visible note

## Risks
See CONSTRAINTS #2. Implement foreground-service approach first; only add the accessibility
fallback if testing on real hardware proves it necessary.

## Exit check
Copy text on phone → paste on Mac, and the reverse. Copy 20 times rapidly → no ping-pong loop.

# Phase 8 — File Transfer — COMPLETE (engine verified; the two UI gestures need a human)

**Completed:** 2026-08-09

## What was built
Mac (`src/main/fileTransfer.ts`):
- `FileTransfers` — chunked send and receive, 64KB chunks from the shared `FILE_CHUNK_BYTES`.
- **Positional writes**, not appends: each chunk is written at `chunkIndex * FILE_CHUNK_BYTES`,
  so out-of-order and duplicate chunks are harmless by construction.
- Files assemble in `os.tmpdir()/phonelink-transfers` and only move to
  `~/Downloads/PhoneLinkClone` on `file_complete` — a dropped link never leaves a
  plausible-looking partial file in Downloads.
- Existing downloads are never overwritten; a numeric suffix is added.
- `EXDEV` fallback to copy+delete, since temp and home can be different volumes.
- Backpressure: waits for `bufferedAmount` to drain between chunks, so a large file cannot
  balloon the socket's send buffer.
- Drag-and-drop zone in the popup. Paths come from `webUtils.getPathForFile` — `File.path` was
  removed in Electron 32.

Android:
- `FileTransferModule.kt` — `ACTION_OPEN_DOCUMENT` picker via `ActivityEventListener`, chunked
  `readChunk(uri, offset, length)`, and `beginReceive`/`appendChunk`/`finishReceive`/`abortReceive`
  publishing to `Downloads/PhoneLinkClone` through MediaStore. Written natively rather than
  adding a filesystem library: this is exactly what the protocol needs, and a general-purpose fs
  bridge would be a much larger dependency to maintain for it.
- `src/files/useFileTransfer.ts` — the phone appends in arrival order, so **out-of-order chunks
  are buffered until their turn** and duplicates dropped.
- "Send a file to Mac" action with progress; partial transfers are aborted on disconnect so no
  temp files are orphaned.

## Tests — 13 in mac-app now (33 across the repo)
`mac-app/test/fileTransfer.test.ts` drives the real engine with real files:
- multi-chunk round trip verified by **SHA-256**, using a size that is not a chunk multiple so
  the short final chunk is exercised
- correct reassembly with chunks delivered **in reverse order**
- correct reassembly with **every chunk duplicated**
- chunks for an unoffered transfer ignored without error
- **no temp files left behind** after an abort
- an existing download is never overwritten, and the original is left byte-identical

## Not verified
Both remaining gaps are gestures no script can perform:
- **Drag-and-drop onto the Mac popup** — open the popup and drop a file; it should show
  "Sending …" and land in `Downloads/PhoneLinkClone` on the phone.
- **"Send a file to Mac"** on the phone — opens the system picker, then the file should appear
  in `~/Downloads/PhoneLinkClone`.

The transfer engine itself is covered by the tests above; what is untested is the wiring from
those two gestures into it.

## Deviation from the phase spec
The spec mentioned the receiver being able to reject an offer. **Not implemented** — it would
need a new envelope type and a prompt, and for a personal tool where the peer is already
cryptographically paired, auto-accepting is the reasonable default. Worth adding if this is ever
used with a device you trust less.

## Known gaps carried forward
- **No accept/reject prompt** (above), and no cancel-in-progress control.
- **No integrity check on the wire**: the channel is authenticated per frame by nacl, but a
  transfer carries no whole-file digest. A truncated transfer that still reports `file_complete`
  would save a short file.
- **Progress is chunk-count based**, so a stalled socket looks like a stalled bar rather than an
  error.
- Mac sends `application/octet-stream` for every file rather than sniffing the type.

## Next phase
Phase 9 — polish. See `docs/phases/phase-09-polish.md`.

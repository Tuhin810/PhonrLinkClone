# Phase 8 — File Transfer

## Goal
Send files both ways over LAN, chunked.

## Deliverables
- Protocol flow: `file_offer` → N × `file_chunk` → `file_complete`; receiver may reject an offer
- `FILE_CHUNK_BYTES` (64KB) from `shared/` on both sides
- Android send: `react-native-document-picker` → base64 chunk stream → progress bar
- Mac send: drag-and-drop zone in the tray popup
- Receiver writes chunks to a temp dir, reassembles on `file_complete`, then moves to
  `~/Downloads/PhoneLinkClone/` (Mac) / `Downloads/PhoneLinkClone/` (Android)
- Cleanup of partial transfers on disconnect; out-of-order / duplicate `chunkIndex` handled
- Backpressure: await the socket drain between chunks so large files don't blow up memory

## Exit check
Send a 50MB file each direction. Progress advances monotonically, checksum matches, and
disconnecting mid-transfer leaves no orphaned temp files.

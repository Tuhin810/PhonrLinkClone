# Phase 1 — Protocol Contract  ✅

## Goal
One shared TypeScript package defining the WebSocket message envelope, consumed unchanged by
both apps. Locking this first prevents the two sides diverging.

## Deliverables
- `shared/src/protocol.ts` — `Envelope` discriminated union, all 12 message types
- `shared/src/validate.ts` — runtime `parseEnvelope()` guard (WS input is untrusted)
- `shared/src/index.ts`, `package.json`, `tsconfig.json`

## Design notes
- Discriminated union on `type` so both sides get exhaustiveness checking in switches.
- Runtime validation is hand-rolled (zero deps) — the shape is small and stable, and the
  package must import cleanly into both a Metro bundler and Electron main.
- `PROTOCOL_VERSION` is sent in `pair_request`/`pair_confirm` so a version mismatch fails
  loudly at pairing rather than silently mid-session.
- Chunk size constant lives here (`FILE_CHUNK_BYTES = 64 * 1024`) so sender and receiver
  cannot disagree.

## Exit check
```bash
cd shared && npm install && npm run build   # compiles clean, emits dist/ + .d.ts
```

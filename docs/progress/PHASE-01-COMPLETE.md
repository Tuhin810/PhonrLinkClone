# Phase 1 — Protocol Contract — COMPLETE

**Completed:** 2026-08-09

## What was built
- `shared/src/protocol.ts` — `Envelope` discriminated union covering all 12 message types,
  plus shared constants: `PROTOCOL_VERSION`, `DEFAULT_PORT` (47711), `SERVICE_TYPE`,
  `FILE_CHUNK_BYTES` (64KB), `PING_INTERVAL_MS`, `MISSED_PINGS_BEFORE_DISCONNECT`. Also
  exports `assertNever()` for exhaustiveness checking in switch handlers.
- `shared/src/validate.ts` — zero-dependency runtime validation: `validateEnvelope()`,
  `parseEnvelope()` (throws `ProtocolError`), `tryParseEnvelope()` (returns null),
  `encodeEnvelope()`.
- `shared/src/index.ts` — re-exports both modules.
- `shared/package.json`, `shared/tsconfig.json` — CommonJS build, `strict` +
  `noUncheckedIndexedAccess`, emits `dist/` with `.d.ts`.

## Exit check result
Spec check: `cd shared && npm install && npm run build` compiles clean and emits `dist/` with
declaration files. **Ran it — passed.** `dist/` contains `index`, `protocol`, and `validate`
in both `.js` and `.d.ts` form.

Additionally smoke-tested the validator against the built output (macOS 25.5.0, Node v26.3.0):
a valid `notification` envelope round-trips; an unknown `type`, a `notification` missing
required fields, and a `file_chunk` with `chunkIndex >= totalChunks` are all rejected; a bare
`ping` parses.

## Decisions made
- **Hand-rolled validation instead of zod/valibot** — the package must import cleanly into
  both the Metro bundler (React Native) and Electron main. Zero dependencies removes any
  bundler-compatibility risk, and the shape is small and stable enough not to need a schema
  library.
- **Validation is mandatory on inbound frames, even after pairing** — a malformed or hostile
  frame must never reach a handler as a half-populated `Envelope`.
- **Shared constants live in the protocol module** — `FILE_CHUNK_BYTES` in particular, so a
  Phase 8 sender and receiver cannot disagree on chunk size.
- **CommonJS output** — safest interop target for both Electron main and Metro.

## Deviations from the phase spec
- Added `protocolVersion: number` to `pair_request` and `pair_confirm` (not in the original
  envelope sketch). A version mismatch now fails loudly at pairing time rather than surfacing
  as confusing behaviour mid-session.
- `file_chunk` validation enforces `chunkIndex < totalChunks` and caps `data` at the base64
  expansion of `FILE_CHUNK_BYTES`. Stricter than specified; prevents memory blowups in Phase 8.

## Known gaps carried forward
- **No automated test suite.** Validation was verified by a one-off smoke script, not by
  committed tests. If the protocol grows, add tests — owner: whichever phase next changes
  `protocol.ts`.
- **No workspace wiring yet.** `android-app/` and `mac-app/` are empty directories; how they
  consume `@phonelink/shared` (npm workspace vs. relative file: dependency) gets decided in
  Phase 2 when the first consumer exists.

## How to re-verify
```bash
cd shared && npm install && npm run build
node -e "
const {parseEnvelope, tryParseEnvelope} = require('./dist');
console.log(parseEnvelope('{\"type\":\"ping\"}'));
console.log('bad type ->', tryParseEnvelope('{\"type\":\"nope\"}'));
"
```

## Next phase
Phase 2 — Android notification capture. See `docs/phases/phase-02-android-notifications.md`.

# Phase 5 — Pairing + Encrypted Channel — COMPLETE (pending one human step)

**Completed:** 2026-08-09

The LAN port is no longer open to anything that connects. Every frame after the handshake is
encrypted. The one thing not machine-verifiable — physically scanning the QR — is left for
Tuhin to confirm.

## Security model
- Each device holds a long-term X25519 (`nacl.box`) keypair.
- The Mac's QR carries its public key plus a **one-time pairing token**.
- The phone proves it read the screen by returning a keyed hash over its own public key
  (`pairingProof`). Without that proof, an unknown device is refused — this is what stops any
  LAN device from pairing itself.
- On success both sides store the peer's public key. Later reconnects need no token: only the
  holder of the matching **private** key can decrypt, so the encryption authenticates the
  session by itself.
- The token is rotated immediately after a successful pairing, so a screenshot of an old QR
  cannot pair a second device.
- Everything after the handshake is `nacl.box` sealed with a precomputed shared key. Frames
  failing decryption or validation are dropped, never thrown.

## What was built
Shared (`shared/src/crypto.ts`):
- `generateKeyPair`, `deriveSharedKey`, `generatePairingToken`, `pairingProof`,
  `verifyPairingProof` (constant-time via `nacl.verify`), `sealEnvelope`, `openEnvelope`,
  `tryOpenEnvelope`. All primitives are tweetnacl — nothing hand-rolled.
- `PROTOCOL_VERSION` bumped to **2**; `pair_request` gained optional `pairingProof`; the QR
  payload is now v2 with `pubKey` and `token`.

Mac:
- `src/main/keystore.ts` — long-term identity and the trusted-phone list, sealed with
  Electron's `safeStorage` (macOS Keychain-backed). Chosen over `keytar` because it ships with
  Electron: no native module to build or keep alive.
- `src/main/linkServer.ts` — handshake, rejection paths, token rotation, sealed send/receive.
- Popup shows the paired device's name, an **Unpair** button, and the reason for any rejected
  connection attempt (silence would look like a bug).

Android:
- `SecureStoreModule.kt` — `EncryptedSharedPreferences` with an Android Keystore master key,
  for the private key. AsyncStorage would have been plaintext on disk, which is unacceptable
  for a secret.
- `src/crypto/identity.ts` (secure store) and `src/crypto/pairing.ts` (paired Mac, public data
  only — AsyncStorage is fine there).
- `linkClient.ts` — sends `pair_request`, waits for `pair_confirm`, then seals every frame.
  **`send()` refuses to transmit before the channel is encrypted**: dropping a notification
  beats leaking one in clear text.
- `index.js` imports `react-native-get-random-values` first — tweetnacl needs a CSPRNG that RN
  does not provide.
- UI shows pairing state and an Unpair action; copy now explains that typing an address alone
  does not pair the devices.

## Exit check result
Crypto primitives (Node, against the built `shared`):
proof verifies; wrong token rejected; tampered public key rejected; shared keys agree from both
sides; ciphertext contains no plaintext; round-trip succeeds; wrong key rejected; tampered
frame rejected. **All pass.**

Handshake, driving the **real** `LinkServer` against a stub keystore:

| # | Case | Result |
|---|---|---|
| 1 | Unpaired device, no token | rejected |
| 2 | Wrong token | rejected |
| 3 | Protocol version mismatch (v1 vs v2) | rejected |
| 4 | Correct token | paired, and an encrypted notification decoded correctly |
| 5 | Reconnect with no token, trusted key | accepted |
| 6 | Old token replayed by a different device | rejected |

On-device: the phone now shows **"Not paired — scan the QR in the Mac app"** and no longer
connects, confirming the previously-open port is closed.

## Not verified
- **The QR scan itself.** Needs a human to point the phone at the screen; the camera preview is
  also invisible to `adb screencap`. Open the Mac popup with no phone connected, tap "Scan QR
  from Mac", point at the code — the phone should pair and connect, and the Mac popup should
  then show the phone's name.

## Bug found on device and fixed
- **Rapid connect/disconnect loop immediately after scanning the QR.** The Mac re-sends
  `pair_confirm` on every connection, so the phone's `onPaired` handler built a fresh `PairedMac`
  object each time. That object was a dependency of the socket effect, so referential inequality
  tore the socket down and redialled — which re-paired, which rebuilt the object, endlessly.
  Fixed by depending on stable primitives (`paired?.pubKey`, `identity?.publicKey`) instead of
  the objects, reading current values through a ref, and making the state updaters no-ops when
  nothing actually changed. Verified: 80s on a single connection with a notification mirrored
  successfully mid-way.

## Known gaps carried forward
- **No forward secrecy** — a compromised long-term key decrypts recorded past traffic. Session
  keys would fix it; out of scope for a personal LAN tool.
- **Release-build cleartext**: `ws://` is still blocked by `usesCleartextTraffic` in release.
  The payload is now encrypted at the application layer, so this is a packaging question for
  Phase 9, not a security one.
- **Unpair is one-sided** — unpairing on one device does not tell the other. The phone simply
  gets rejected and shows it is not paired.
- **No pairing timeout** — the token stays valid until it is used or the app restarts.
- **Still no automated tests in the repo**; the crypto and handshake checks above were
  throwaway scripts. This is the phase where that starts to hurt — Phase 6 should fix it.

## Next phase
Phase 6 — clipboard sync. See `docs/phases/phase-06-clipboard.md`.

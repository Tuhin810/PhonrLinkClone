# Phase 5 — Pairing + Encrypted Channel

## Goal
Only a paired phone can talk to the Mac, and the LAN traffic is encrypted.

## Deliverables
- Mac generates a keypair + pairing token, renders a QR (`qrcode` pkg) containing
  `{ pubKey, host, port, pairingToken }`
- Android scans it (`react-native-vision-camera` + QR scanner); 6-digit code entry fallback
- `pair_request` / `pair_confirm` exchange, `PROTOCOL_VERSION` checked here
- `tweetnacl` box for all subsequent frames — **no custom crypto**
- Key storage: Android Keystore, macOS Keychain via `keytar`
- "Unpair" action on both sides

## Exit check
Unpaired client is rejected. Paired client survives an app restart on both sides. Frames on
the wire are ciphertext (verify with a packet capture or a raw WS probe).

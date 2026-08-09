# Phase 4 — mDNS Discovery — COMPLETE (with one leg unverifiable on this network)

**Completed:** 2026-08-09

> **Read this first:** every deliverable is built, but the zero-configuration discovery path
> could **not** be verified here — this wifi filters multicast, so no mDNS reaches the phone at
> all. The manual-address fallback (the designed escape hatch for exactly this) was verified
> end to end. Re-verify discovery on a network that permits multicast before trusting it.

## What was built
Mac (`mac-app/`):
- `src/main/advertiser.ts` — publishes `_phonelink._tcp` on 47711 via `bonjour-service`, with
  TXT records carrying the device name and `PROTOCOL_VERSION`. `unpublishAll` on quit sends
  goodbye packets so the phone drops a dead Mac promptly.

Android (`android-app/`):
- `src/discovery/discovery.ts` — `MacDiscovery`, wrapping `react-native-zeroconf`. Browses for
  the service, picks the IPv4 address, re-scans every 15s while nothing is found, and reports
  diagnostics to the UI.
- `src/discovery/settings.ts` — manual host persisted in AsyncStorage.
- `src/types/react-native-zeroconf.d.ts` — hand-written typings; the package ships none.
- `src/useNotificationMirror.ts` — reworked: the socket now follows whichever target is
  current, and tearing down/rebuilding it is driven by target changes. A manual address
  outranks discovery (an explicit instruction should not be silently overridden).
- `App.tsx` — target line showing source (`manual` / discovered device name), a manual-address
  panel, and a fallback banner after 25s of fruitless discovery.
- **`MAC_HOST` is gone** — the hardcoded IP no longer exists anywhere.

New deps: `bonjour-service` (Mac), `react-native-zeroconf` + `@react-native-async-storage/async-storage`
(Android — both needed a native rebuild).

## Exit check result
Environment: macOS 25.5.0 at 192.168.1.9; Samsung `RZCW8063A3P`, Android 16 / API 36 at
192.168.1.10; same wifi, same subnet.

| Leg | Result |
|---|---|
| Mac advertises the service | **Pass** — `dns-sd -B _phonelink._tcp` shows `PhoneLink (Tuhins-MacBook-Air)` |
| Phone discovers the Mac | **Fail — network, not code.** See diagnosis below |
| Manual address connects | **Pass** — saved `192.168.1.9`, phone connected, `[link] connected` on the Mac, and a test notification mirrored (`[notification shown] com.android.shell: Phase4`) |
| Fallback UI appears | **Pass** — banner and manual panel render after ~25s of no results |

### Diagnosis of the discovery failure
Not a bug in our code, and worth not re-investigating from scratch later:
- Android's NSD stack runs correctly — logcat shows `MdnsDiscoveryManager: Registering listener
  for serviceType: _phonelink._tcp.local`, `MdnsSocketProvider: Start monitoring sockets`, and
  `WifiService: acquireMulticastLock`. The scan starts; nothing ever arrives.
- **Control test:** pointing the same scan at `_companion-link._tcp` — which macOS always
  advertises and `dns-sd` confirms is present on this LAN — also found nothing. So the phone
  receives no mDNS responses for *any* service type.
- Unicast TCP between the two devices works fine (that is how Phases 2–3 passed, and how the
  manual address works now).

Conclusion: this access point filters multicast between clients. That is
**docs/CONSTRAINTS.md #3**, the anticipated case, and the reason the manual override exists.

## Decisions made
- **Manual address outranks discovery** — if the user typed an address, honour it.
- **Discovery only runs when no manual address is set** — nothing to look for otherwise.
- **Periodic re-scan every 15s** — Android's zeroconf scans are effectively one-shot, so a Mac
  that appears later (or after a wifi change) needs a re-arm.
- **Discovery diagnostics rendered on screen** — RN console output only reaches Metro, never
  logcat, which made this failure invisible until surfaced in the UI. Kept deliberately: the
  same blindness will affect Phases 6–8.
- **A 25s timer flips the copy** from "Searching…" to "may block discovery" rather than
  implying a result is still coming.

## Known gaps carried forward
- **Discovery path unverified.** Re-run on a multicast-permitting network. If it fails there
  too, suspect `react-native-zeroconf` on Android 16 before suspecting the network.
- **No `NetInfo` reconnect trigger** — reconnection is backoff-driven, not network-change
  driven. Phase 9.
- **No IP validation** on the manual field — a typo just fails to connect.
- Everything still carried from earlier phases: no pairing/encryption (**Phase 5, and the LAN
  port is still open to anyone**), no release-build cleartext story, no automated tests.

## How to re-verify
```bash
cd mac-app && npm start
(dns-sd -B _phonelink._tcp &) ; sleep 5; pkill -f "dns-sd -B"   # Mac advertises?
cd android-app && npm run android
```
On a multicast-permitting network the phone should connect with no configuration. On this one,
open the app, tap the yellow banner, enter the Mac's IP and Save.

## Next phase
Phase 5 — pairing + encrypted channel. See `docs/phases/phase-05-pairing-crypto.md`.
This one matters: the port is currently open to any device on the LAN.

"use strict";
/**
 * The single source of truth for every message crossing the phone <-> Mac WebSocket.
 * Both apps import this package; neither side invents fields.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAIRING_PAYLOAD_VERSION = exports.MISSED_PINGS_BEFORE_DISCONNECT = exports.PING_INTERVAL_MS = exports.CLIPBOARD_MAX_BYTES = exports.FILE_CHUNK_BYTES = exports.SERVICE_TYPE = exports.DEFAULT_PORT = exports.PROTOCOL_VERSION = void 0;
exports.parsePairingPayload = parsePairingPayload;
exports.assertNever = assertNever;
/**
 * Bumped on any breaking change. Exchanged during pairing so mismatches fail loudly.
 * v2 added the encrypted channel and `pairingProof`; v3 added `call_action`; v4 added screen
 * mirroring and remote input; v5 added contacts, placing calls and sending SMS from the Mac.
 */
exports.PROTOCOL_VERSION = 5;
/** Default LAN port the Mac listens on. */
exports.DEFAULT_PORT = 47711;
/** mDNS service type advertised by the Mac and browsed by the phone. */
exports.SERVICE_TYPE = 'phonelink';
/** Chunk size for file transfer. Shared so sender and receiver cannot disagree. */
exports.FILE_CHUNK_BYTES = 64 * 1024;
/**
 * Clipboard payloads above this are skipped rather than sent. Large clips are usually images
 * or file contents coerced to text, and shipping them chunk-free would stall the link.
 */
exports.CLIPBOARD_MAX_BYTES = 256 * 1024;
/** Heartbeat cadence, and how many missed pongs before we call it disconnected. */
exports.PING_INTERVAL_MS = 15000;
exports.MISSED_PINGS_BEFORE_DISCONNECT = 2;
exports.PAIRING_PAYLOAD_VERSION = 2;
/** Parses a scanned QR string. Returns null for anything that is not our payload. */
function parsePairingPayload(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null)
        return null;
    const o = parsed;
    if (o['app'] !== 'phonelink')
        return null;
    if (typeof o['v'] !== 'number' || o['v'] > exports.PAIRING_PAYLOAD_VERSION)
        return null;
    if (typeof o['host'] !== 'string' || !o['host'])
        return null;
    if (typeof o['port'] !== 'number' || !Number.isInteger(o['port']))
        return null;
    return {
        app: 'phonelink',
        v: o['v'],
        host: o['host'],
        port: o['port'],
        device: typeof o['device'] === 'string' ? o['device'] : 'Mac',
        pubKey: typeof o['pubKey'] === 'string' ? o['pubKey'] : undefined,
        token: typeof o['token'] === 'string' ? o['token'] : undefined,
    };
}
/**
 * Compile-time exhaustiveness helper. Call it from the `default:` branch of a switch over
 * `envelope.type` so adding a message type breaks every incomplete handler.
 */
function assertNever(value) {
    throw new Error(`Unhandled envelope: ${JSON.stringify(value)}`);
}

"use strict";
/**
 * The single source of truth for every message crossing the phone <-> Mac WebSocket.
 * Both apps import this package; neither side invents fields.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MISSED_PINGS_BEFORE_DISCONNECT = exports.PING_INTERVAL_MS = exports.FILE_CHUNK_BYTES = exports.SERVICE_TYPE = exports.DEFAULT_PORT = exports.PROTOCOL_VERSION = void 0;
exports.assertNever = assertNever;
/** Bumped on any breaking change. Exchanged during pairing so mismatches fail loudly. */
exports.PROTOCOL_VERSION = 1;
/** Default LAN port the Mac listens on. */
exports.DEFAULT_PORT = 47711;
/** mDNS service type advertised by the Mac and browsed by the phone. */
exports.SERVICE_TYPE = 'phonelink';
/** Chunk size for file transfer. Shared so sender and receiver cannot disagree. */
exports.FILE_CHUNK_BYTES = 64 * 1024;
/** Heartbeat cadence, and how many missed pongs before we call it disconnected. */
exports.PING_INTERVAL_MS = 15000;
exports.MISSED_PINGS_BEFORE_DISCONNECT = 2;
/**
 * Compile-time exhaustiveness helper. Call it from the `default:` branch of a switch over
 * `envelope.type` so adding a message type breaks every incomplete handler.
 */
function assertNever(value) {
    throw new Error(`Unhandled envelope: ${JSON.stringify(value)}`);
}
//# sourceMappingURL=protocol.js.map
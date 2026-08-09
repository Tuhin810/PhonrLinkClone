/**
 * The single source of truth for every message crossing the phone <-> Mac WebSocket.
 * Both apps import this package; neither side invents fields.
 */

/**
 * Bumped on any breaking change. Exchanged during pairing so mismatches fail loudly.
 * v2 added the encrypted channel and `pairingProof`.
 */
export const PROTOCOL_VERSION = 2;

/** Default LAN port the Mac listens on. */
export const DEFAULT_PORT = 47711;

/** mDNS service type advertised by the Mac and browsed by the phone. */
export const SERVICE_TYPE = 'phonelink';

/** Chunk size for file transfer. Shared so sender and receiver cannot disagree. */
export const FILE_CHUNK_BYTES = 64 * 1024;

/** Heartbeat cadence, and how many missed pongs before we call it disconnected. */
export const PING_INTERVAL_MS = 15000;
export const MISSED_PINGS_BEFORE_DISCONNECT = 2;

export type DeviceKind = 'phone' | 'mac';

/**
 * Payload encoded into the pairing QR code the Mac shows and the phone scans.
 *
 * Phase 4.5 carries only the address, so scanning replaces typing an IP by hand. Phase 5 adds
 * `pubKey` and `pairingToken` here — keep the shape additive so an older phone scanning a
 * newer code fails on `v` rather than on a missing field.
 */
export interface PairingPayload {
  /** Discriminator so we never act on some other app's QR code. */
  app: 'phonelink';
  /** Payload version, independent of PROTOCOL_VERSION. */
  v: number;
  host: string;
  port: number;
  device: string;
  /** Mac's long-term public key. Present from v2. */
  pubKey?: string;
  /** One-time pairing token. Present from v2. */
  token?: string;
}

export const PAIRING_PAYLOAD_VERSION = 2;

/** Parses a scanned QR string. Returns null for anything that is not our payload. */
export function parsePairingPayload(raw: string): PairingPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (o['app'] !== 'phonelink') return null;
  if (typeof o['v'] !== 'number' || o['v'] > PAIRING_PAYLOAD_VERSION) return null;
  if (typeof o['host'] !== 'string' || !o['host']) return null;
  if (typeof o['port'] !== 'number' || !Number.isInteger(o['port'])) return null;
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

export interface NotificationMessage {
  type: 'notification';
  /** Stable per-notification id, reused by notification_dismiss. */
  id: string;
  /** Android package name, e.g. "com.whatsapp". */
  app: string;
  title: string;
  text: string;
  timestamp: number;
  /** Base64 PNG of the small icon, downscaled to 64x64 by the sender. */
  icon?: string;
}

export interface NotificationDismissMessage {
  type: 'notification_dismiss';
  id: string;
}

export interface CallIncomingMessage {
  type: 'call_incoming';
  callerName?: string;
  callerNumber: string;
  timestamp: number;
}

export interface CallEndedMessage {
  type: 'call_ended';
  timestamp: number;
}

export interface ClipboardUpdateMessage {
  type: 'clipboard_update';
  content: string;
  /** Set by the originator; a secondary guard against echo loops. */
  sourceDevice: DeviceKind;
  timestamp: number;
}

export interface FileOfferMessage {
  type: 'file_offer';
  fileId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
}

export interface FileChunkMessage {
  type: 'file_chunk';
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  /** Base64 of at most FILE_CHUNK_BYTES raw bytes. */
  data: string;
}

export interface FileCompleteMessage {
  type: 'file_complete';
  fileId: string;
}

export interface PairRequestMessage {
  type: 'pair_request';
  deviceName: string;
  pubKey: string;
  protocolVersion: number;
  /**
   * Keyed hash over `pubKey` using the token from the Mac's QR, proving the phone read the
   * screen. Absent when reconnecting with an already-trusted key.
   */
  pairingProof?: string;
}

export interface PairConfirmMessage {
  type: 'pair_confirm';
  deviceName: string;
  pubKey: string;
  protocolVersion: number;
}

export interface PingMessage {
  type: 'ping';
}

export interface PongMessage {
  type: 'pong';
}

export type Envelope =
  | NotificationMessage
  | NotificationDismissMessage
  | CallIncomingMessage
  | CallEndedMessage
  | ClipboardUpdateMessage
  | FileOfferMessage
  | FileChunkMessage
  | FileCompleteMessage
  | PairRequestMessage
  | PairConfirmMessage
  | PingMessage
  | PongMessage;

export type EnvelopeType = Envelope['type'];

/**
 * Compile-time exhaustiveness helper. Call it from the `default:` branch of a switch over
 * `envelope.type` so adding a message type breaks every incomplete handler.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled envelope: ${JSON.stringify(value)}`);
}

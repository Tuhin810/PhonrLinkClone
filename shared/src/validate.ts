/**
 * Runtime validation for inbound WebSocket frames.
 *
 * Everything arriving over the socket is untrusted, even after pairing: a malformed or
 * hostile frame must never reach a handler as a half-populated Envelope. Hand-rolled rather
 * than schema-library-backed so the package imports cleanly into both Metro and Electron
 * main with zero dependencies.
 */
import { Envelope, FILE_CHUNK_BYTES } from './protocol';

export class ProtocolError extends Error {}

type Rec = Record<string, unknown>;

function str(o: Rec, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new ProtocolError(`"${k}" must be a string`);
  return v;
}

function optStr(o: Rec, k: string): string | undefined {
  const v = o[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new ProtocolError(`"${k}" must be a string if present`);
  return v;
}

function num(o: Rec, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ProtocolError(`"${k}" must be a finite number`);
  }
  return v;
}

function intAtLeast(o: Rec, k: string, min: number): number {
  const v = num(o, k);
  if (!Number.isInteger(v) || v < min) {
    throw new ProtocolError(`"${k}" must be an integer >= ${min}`);
  }
  return v;
}

/** Normalised screen coordinate; anything outside 0..1 is a bug on the sending side. */
function unitInterval(o: Rec, k: string): number {
  const v = num(o, k);
  if (v < 0 || v > 1) throw new ProtocolError(`"${k}" must be between 0 and 1`);
  return v;
}

/** Validates a parsed JSON value as an Envelope. Throws ProtocolError on any mismatch. */
export function validateEnvelope(value: unknown): Envelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProtocolError('envelope must be a JSON object');
  }
  const o = value as Rec;
  const type = o['type'];
  if (typeof type !== 'string') throw new ProtocolError('missing "type"');

  switch (type) {
    case 'notification':
      return {
        type,
        id: str(o, 'id'),
        app: str(o, 'app'),
        title: str(o, 'title'),
        text: str(o, 'text'),
        timestamp: num(o, 'timestamp'),
        icon: optStr(o, 'icon'),
      };

    case 'notification_dismiss':
      return { type, id: str(o, 'id') };

    case 'call_incoming':
      return {
        type,
        callerName: optStr(o, 'callerName'),
        callerNumber: str(o, 'callerNumber'),
        timestamp: num(o, 'timestamp'),
      };

    case 'call_ended':
      return { type, timestamp: num(o, 'timestamp') };

    case 'call_action': {
      const action = str(o, 'action');
      if (action !== 'decline' && action !== 'silence') {
        throw new ProtocolError('"action" must be "decline" or "silence"');
      }
      return { type, action };
    }

    case 'clipboard_update': {
      const sourceDevice = str(o, 'sourceDevice');
      if (sourceDevice !== 'phone' && sourceDevice !== 'mac') {
        throw new ProtocolError('"sourceDevice" must be "phone" or "mac"');
      }
      return {
        type,
        content: str(o, 'content'),
        sourceDevice,
        timestamp: num(o, 'timestamp'),
      };
    }

    case 'file_offer':
      return {
        type,
        fileId: str(o, 'fileId'),
        fileName: str(o, 'fileName'),
        sizeBytes: intAtLeast(o, 'sizeBytes', 0),
        mimeType: str(o, 'mimeType'),
      };

    case 'file_chunk': {
      const totalChunks = intAtLeast(o, 'totalChunks', 1);
      const chunkIndex = intAtLeast(o, 'chunkIndex', 0);
      if (chunkIndex >= totalChunks) {
        throw new ProtocolError('"chunkIndex" must be < "totalChunks"');
      }
      const data = str(o, 'data');
      // Base64 inflates by 4/3; reject anything that could not have been a legal chunk.
      if (data.length > Math.ceil(FILE_CHUNK_BYTES / 3) * 4) {
        throw new ProtocolError('"data" exceeds FILE_CHUNK_BYTES');
      }
      return { type, fileId: str(o, 'fileId'), chunkIndex, totalChunks, data };
    }

    case 'file_complete':
      return { type, fileId: str(o, 'fileId') };

    case 'pair_request':
      return {
        type,
        deviceName: str(o, 'deviceName'),
        pubKey: str(o, 'pubKey'),
        protocolVersion: intAtLeast(o, 'protocolVersion', 1),
        pairingProof: optStr(o, 'pairingProof'),
      };

    case 'pair_confirm':
      return {
        type,
        deviceName: str(o, 'deviceName'),
        pubKey: str(o, 'pubKey'),
        protocolVersion: intAtLeast(o, 'protocolVersion', 1),
      };

    case 'screen_control': {
      const action = str(o, 'action');
      if (action !== 'start' && action !== 'stop') {
        throw new ProtocolError('"action" must be "start" or "stop"');
      }
      return { type, action };
    }

    case 'screen_frame':
      return {
        type,
        data: str(o, 'data'),
        width: intAtLeast(o, 'width', 1),
        height: intAtLeast(o, 'height', 1),
        timestamp: num(o, 'timestamp'),
      };

    case 'screen_state': {
      const streaming = o['streaming'];
      const inputAvailable = o['inputAvailable'];
      if (typeof streaming !== 'boolean') {
        throw new ProtocolError('"streaming" must be a boolean');
      }
      return {
        type,
        streaming,
        reason: optStr(o, 'reason'),
        inputAvailable: typeof inputAvailable === 'boolean' ? inputAvailable : false,
      };
    }

    case 'input_tap':
      return { type, x: unitInterval(o, 'x'), y: unitInterval(o, 'y') };

    case 'input_swipe':
      return {
        type,
        x1: unitInterval(o, 'x1'),
        y1: unitInterval(o, 'y1'),
        x2: unitInterval(o, 'x2'),
        y2: unitInterval(o, 'y2'),
        durationMs: intAtLeast(o, 'durationMs', 1),
      };

    case 'input_key': {
      const key = str(o, 'key');
      if (key !== 'back' && key !== 'home' && key !== 'recents' && key !== 'notifications') {
        throw new ProtocolError(`unknown key "${key}"`);
      }
      return { type, key };
    }

    case 'input_text':
      return { type, text: str(o, 'text') };

    case 'ping':
    case 'pong':
      return { type };

    default:
      throw new ProtocolError(`unknown envelope type "${type}"`);
  }
}

/** Parses a raw WebSocket text frame into an Envelope. Throws ProtocolError. */
export function parseEnvelope(raw: string): Envelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProtocolError('frame is not valid JSON');
  }
  return validateEnvelope(parsed);
}

/** Non-throwing variant for hot paths that just want to drop bad frames. */
export function tryParseEnvelope(raw: string): Envelope | null {
  try {
    return parseEnvelope(raw);
  } catch {
    return null;
  }
}

export function encodeEnvelope(envelope: Envelope): string {
  return JSON.stringify(envelope);
}

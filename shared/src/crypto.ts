import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64, decodeUTF8, encodeUTF8 } from 'tweetnacl-util';
import type { Envelope } from './protocol';
import { ProtocolError, validateEnvelope } from './validate';

/**
 * Channel encryption. Deliberately thin: everything cryptographic is tweetnacl, nothing here
 * invents a construction of its own.
 *
 * Model:
 * - Each device holds a long-term X25519 box keypair.
 * - Pairing exchanges public keys; the QR the Mac shows also carries a one-time token, and the
 *   phone proves it saw the screen by returning a MAC over its own public key keyed by that
 *   token. That stops any LAN device from pairing itself just by connecting.
 * - After pairing, every frame is a sealed box under the precomputed shared key. Holding the
 *   peer's public key is not enough to talk: you need the matching private key, so encryption
 *   authenticates subsequent sessions without a separate challenge.
 */

export interface KeyPair {
  publicKey: string;
  secretKey: string;
}

export function generateKeyPair(): KeyPair {
  const pair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(pair.publicKey),
    secretKey: encodeBase64(pair.secretKey),
  };
}

/** Precomputed shared key for a peer. Cheaper than deriving it per frame. */
export function deriveSharedKey(ownSecretKey: string, peerPublicKey: string): string {
  const shared = nacl.box.before(
    decodeBase64(peerPublicKey),
    decodeBase64(ownSecretKey),
  );
  return encodeBase64(shared);
}

/** One-time pairing token shown in the QR. */
export function generatePairingToken(): string {
  return encodeBase64(nacl.randomBytes(16));
}

/**
 * Proof that the phone read the token off the Mac's screen: a keyed hash over its own public
 * key. Constant-time compared on the Mac via `nacl.verify`.
 */
export function pairingProof(token: string, publicKey: string): string {
  const material = decodeUTF8(`${token}:${publicKey}`);
  return encodeBase64(nacl.hash(material).subarray(0, 32));
}

export function verifyPairingProof(
  token: string,
  publicKey: string,
  proof: string,
): boolean {
  let provided: Uint8Array;
  try {
    provided = decodeBase64(proof);
  } catch {
    return false;
  }
  const expected = decodeBase64(pairingProof(token, publicKey));
  if (provided.length !== expected.length) return false;
  return nacl.verify(provided, expected);
}

/** Wire format for an encrypted frame. */
interface SealedFrame {
  n: string;
  c: string;
}

export function sealEnvelope(envelope: Envelope, sharedKey: string): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box.after(
    decodeUTF8(JSON.stringify(envelope)),
    nonce,
    decodeBase64(sharedKey),
  );
  const frame: SealedFrame = { n: encodeBase64(nonce), c: encodeBase64(box) };
  return JSON.stringify(frame);
}

/**
 * Decrypts and validates a frame. Throws ProtocolError on anything malformed or unauthentic —
 * a frame that fails here never reaches a handler.
 */
export function openEnvelope(raw: string, sharedKey: string): Envelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProtocolError('sealed frame is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ProtocolError('sealed frame must be an object');
  }
  const frame = parsed as Record<string, unknown>;
  if (typeof frame['n'] !== 'string' || typeof frame['c'] !== 'string') {
    throw new ProtocolError('sealed frame missing "n" or "c"');
  }

  let opened: Uint8Array | null;
  try {
    opened = nacl.box.open.after(
      decodeBase64(frame['c']),
      decodeBase64(frame['n']),
      decodeBase64(sharedKey),
    );
  } catch {
    throw new ProtocolError('sealed frame is not decodable');
  }
  // null means authentication failed: wrong key, or the frame was tampered with.
  if (!opened) throw new ProtocolError('sealed frame failed authentication');

  try {
    return validateEnvelope(JSON.parse(encodeUTF8(opened)));
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    throw new ProtocolError('decrypted payload is not valid JSON');
  }
}

export function tryOpenEnvelope(raw: string, sharedKey: string): Envelope | null {
  try {
    return openEnvelope(raw, sharedKey);
  } catch {
    return null;
  }
}

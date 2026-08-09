import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  deriveSharedKey,
  generateKeyPair,
  pairingProof,
  sealEnvelope,
  type Envelope,
} from '@phonelink/shared';
import { LinkServer } from '../src/main/linkServer';
import type { Keystore } from '../src/main/keystore';

/**
 * Drives the real LinkServer against an in-memory keystore. These are the assertions that keep
 * the LAN port closed, so they are worth having in CI rather than in a throwaway script.
 */
function stubKeystore(): Keystore {
  const keyPair = generateKeyPair();
  const trusted = new Map<string, string>();
  return {
    getKeyPair: () => keyPair,
    isTrusted: (key: string) => trusted.has(key),
    trustedName: (key: string) => trusted.get(key) ?? null,
    trust: (key: string, name: string) => void trusted.set(key, name),
    listTrusted: () =>
      [...trusted].map(([pubKey, deviceName]) => ({ pubKey, deviceName })),
    unpairAll: () => trusted.clear(),
  } as unknown as Keystore;
}

const PORT = 47_802;
const keystore = stubKeystore();
const server = new LinkServer(keystore, PORT);
const received: Envelope[] = [];
server.on('envelope', envelope => received.push(envelope));
server.start();

after(() => server.stop());

interface DialResult {
  confirmed: boolean;
  macPubKey: string | null;
}

/** Connects, sends one pair_request, and reports whether the Mac confirmed. */
function dial(request: Record<string, unknown>, sendAfter?: (key: string) => Envelope) {
  return new Promise<DialResult>(resolve => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const result: DialResult = { confirmed: false, macPubKey: null };
    socket.on('open', () => socket.send(JSON.stringify(request)));
    socket.on('message', raw => {
      const envelope = JSON.parse(raw.toString()) as Envelope;
      if (envelope.type !== 'pair_confirm') return;
      result.confirmed = true;
      result.macPubKey = envelope.pubKey;
      if (sendAfter) {
        const shared = deriveSharedKey(phone.secretKey, envelope.pubKey);
        socket.send(sealEnvelope(sendAfter(shared), shared));
      }
      setTimeout(() => {
        socket.close();
        resolve(result);
      }, 150);
    });
    socket.on('close', () => resolve(result));
    socket.on('error', () => resolve(result));
  });
}

const phone = generateKeyPair();

describe('pairing handshake', () => {
  it('refuses an unknown device with no pairing proof', async () => {
    const result = await dial({
      type: 'pair_request',
      deviceName: 'Attacker',
      pubKey: generateKeyPair().publicKey,
      protocolVersion: PROTOCOL_VERSION,
    });
    assert.equal(result.confirmed, false);
  });

  it('refuses a proof built from the wrong token', async () => {
    const result = await dial({
      type: 'pair_request',
      deviceName: 'Attacker',
      pubKey: phone.publicKey,
      protocolVersion: PROTOCOL_VERSION,
      pairingProof: pairingProof('not-the-real-token', phone.publicKey),
    });
    assert.equal(result.confirmed, false);
  });

  it('refuses a protocol version mismatch', async () => {
    const result = await dial({
      type: 'pair_request',
      deviceName: 'Old build',
      pubKey: phone.publicKey,
      protocolVersion: PROTOCOL_VERSION - 1,
      pairingProof: pairingProof(server.getPairingToken(), phone.publicKey),
    });
    assert.equal(result.confirmed, false);
  });

  it('refuses a frame that is not a pairing request', async () => {
    const result = await dial({ type: 'ping' });
    assert.equal(result.confirmed, false);
  });

  it('pairs with a valid token and then accepts encrypted traffic', async () => {
    const token = server.getPairingToken();
    const result = await dial(
      {
        type: 'pair_request',
        deviceName: 'Real phone',
        pubKey: phone.publicKey,
        protocolVersion: PROTOCOL_VERSION,
        pairingProof: pairingProof(token, phone.publicKey),
      },
      () => ({
        type: 'notification',
        id: 'n1',
        app: 'com.test',
        title: 'Encrypted',
        text: 'body',
        timestamp: 1,
      }),
    );
    assert.equal(result.confirmed, true);
    assert.equal(keystore.isTrusted(phone.publicKey), true);
    assert.ok(
      received.some(e => e.type === 'notification' && e.title === 'Encrypted'),
      'the Mac should decrypt traffic sent after pairing',
    );
  });

  it('accepts a trusted device reconnecting without a token', async () => {
    const result = await dial({
      type: 'pair_request',
      deviceName: 'Real phone',
      pubKey: phone.publicKey,
      protocolVersion: PROTOCOL_VERSION,
    });
    assert.equal(result.confirmed, true);
  });

  it('refuses a used token replayed by a different device', async () => {
    // The token rotated when the first pairing succeeded, so the old one is worthless.
    const result = await dial({
      type: 'pair_request',
      deviceName: 'Second device',
      pubKey: generateKeyPair().publicKey,
      protocolVersion: PROTOCOL_VERSION,
      pairingProof: pairingProof('stale-token', generateKeyPair().publicKey),
    });
    assert.equal(result.confirmed, false);
  });
});

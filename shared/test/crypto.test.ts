import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveSharedKey,
  generateKeyPair,
  generatePairingToken,
  pairingProof,
  sealEnvelope,
  tryOpenEnvelope,
  verifyPairingProof,
} from '../src';

const sample = {
  type: 'notification',
  id: 'k1',
  app: 'com.whatsapp',
  title: 'Secret title',
  text: 'Secret body',
  timestamp: 1,
} as const;

describe('pairing proof', () => {
  it('verifies with the matching token and key', () => {
    const token = generatePairingToken();
    const phone = generateKeyPair();
    assert.equal(
      verifyPairingProof(token, phone.publicKey, pairingProof(token, phone.publicKey)),
      true,
    );
  });

  it('rejects a proof made with a different token', () => {
    const phone = generateKeyPair();
    const proof = pairingProof(generatePairingToken(), phone.publicKey);
    assert.equal(verifyPairingProof(generatePairingToken(), phone.publicKey, proof), false);
  });

  it('rejects a proof replayed for a different public key', () => {
    const token = generatePairingToken();
    const phone = generateKeyPair();
    const attacker = generateKeyPair();
    const proof = pairingProof(token, phone.publicKey);
    assert.equal(verifyPairingProof(token, attacker.publicKey, proof), false);
  });

  it('rejects a malformed proof without throwing', () => {
    assert.equal(verifyPairingProof(generatePairingToken(), 'k', 'not base64 %%%'), false);
  });
});

describe('sealed channel', () => {
  const mac = generateKeyPair();
  const phone = generateKeyPair();
  const macKey = deriveSharedKey(mac.secretKey, phone.publicKey);
  const phoneKey = deriveSharedKey(phone.secretKey, mac.publicKey);

  it('derives the same shared key from both sides', () => {
    assert.equal(macKey, phoneKey);
  });

  it('round-trips an envelope', () => {
    const opened = tryOpenEnvelope(sealEnvelope(sample, macKey), phoneKey);
    assert.equal(opened?.type, 'notification');
    assert.equal(opened && 'title' in opened ? opened.title : null, 'Secret title');
  });

  it('leaks no plaintext into the frame', () => {
    const sealed = sealEnvelope(sample, macKey);
    assert.equal(sealed.includes('Secret'), false);
    assert.equal(sealed.includes('whatsapp'), false);
  });

  it('rejects a frame sealed for someone else', () => {
    const stranger = deriveSharedKey(generateKeyPair().secretKey, mac.publicKey);
    assert.equal(tryOpenEnvelope(sealEnvelope(sample, macKey), stranger), null);
  });

  it('rejects a tampered frame', () => {
    const frame = JSON.parse(sealEnvelope(sample, macKey)) as { c: string };
    frame.c = `A${frame.c.slice(1)}`;
    assert.equal(tryOpenEnvelope(JSON.stringify(frame), phoneKey), null);
  });

  it('rejects frames that are not sealed at all', () => {
    assert.equal(tryOpenEnvelope(JSON.stringify(sample), phoneKey), null);
    assert.equal(tryOpenEnvelope('{}', phoneKey), null);
  });
});

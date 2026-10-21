import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FILE_CHUNK_BYTES,
  ProtocolError,
  parseEnvelope,
  parsePairingPayload,
  tryParseEnvelope,
} from '../src';

describe('envelope validation', () => {
  it('accepts a well-formed notification', () => {
    const envelope = parseEnvelope(
      JSON.stringify({
        type: 'notification',
        id: 'k1',
        app: 'com.whatsapp',
        title: 'Title',
        text: 'Body',
        timestamp: 1,
      }),
    );
    assert.equal(envelope.type, 'notification');
  });

  it('rejects unknown message types', () => {
    assert.throws(() => parseEnvelope('{"type":"launch_missiles"}'), ProtocolError);
  });

  it('rejects missing required fields', () => {
    assert.equal(tryParseEnvelope('{"type":"notification","id":"1"}'), null);
  });

  it('rejects non-JSON frames', () => {
    assert.equal(tryParseEnvelope('not json at all'), null);
  });

  it('rejects a chunk index beyond the chunk count', () => {
    assert.equal(
      tryParseEnvelope(
        JSON.stringify({
          type: 'file_chunk',
          fileId: 'f',
          chunkIndex: 5,
          totalChunks: 3,
          data: '',
        }),
      ),
      null,
    );
  });

  it('rejects an oversized chunk payload', () => {
    assert.equal(
      tryParseEnvelope(
        JSON.stringify({
          type: 'file_chunk',
          fileId: 'f',
          chunkIndex: 0,
          totalChunks: 1,
          data: 'A'.repeat(FILE_CHUNK_BYTES * 2),
        }),
      ),
      null,
    );
  });

  it('rejects an unknown clipboard source device', () => {
    assert.equal(
      tryParseEnvelope(
        JSON.stringify({
          type: 'clipboard_update',
          content: 'x',
          sourceDevice: 'toaster',
          timestamp: 1,
        }),
      ),
      null,
    );
  });

  it('accepts a contacts list and normalises missing fields', () => {
    const envelope = parseEnvelope(
      JSON.stringify({
        type: 'contacts_list',
        contacts: [{ id: '7', name: 'Mom', phones: [{ number: '+91 98000 00000' }] }],
      }),
    );
    assert.equal(envelope.type, 'contacts_list');
    if (envelope.type !== 'contacts_list') return;
    assert.equal(envelope.contacts[0]?.starred, false);
    assert.equal(envelope.contacts[0]?.phones[0]?.label, undefined);
  });

  it('rejects a contact whose phones are not a list', () => {
    assert.equal(
      tryParseEnvelope(
        JSON.stringify({
          type: 'contacts_list',
          contacts: [{ id: '7', name: 'Mom', phones: '+91 98000 00000' }],
        }),
      ),
      null,
    );
  });

  it('requires a body to send a text', () => {
    assert.equal(tryParseEnvelope('{"type":"sms_send","id":"1","number":"123"}'), null);
    const envelope = parseEnvelope('{"type":"sms_send","id":"1","number":"123","body":"hi"}');
    assert.equal(envelope.type, 'sms_send');
  });

  it('requires a boolean outcome on a phone action result', () => {
    assert.equal(tryParseEnvelope('{"type":"phone_action_result","id":"1","ok":"yes"}'), null);
  });
});

describe('pairing payload', () => {
  it('round-trips a v2 payload', () => {
    const raw = JSON.stringify({
      app: 'phonelink',
      v: 2,
      host: '192.168.1.9',
      port: 47711,
      device: 'Mac',
      pubKey: 'abc',
      token: 'def',
    });
    const parsed = parsePairingPayload(raw);
    assert.equal(parsed?.host, '192.168.1.9');
    assert.equal(parsed?.token, 'def');
  });

  it('ignores QR codes belonging to other apps', () => {
    assert.equal(parsePairingPayload('https://example.com'), null);
    assert.equal(parsePairingPayload('{"app":"other","v":2,"host":"h","port":1}'), null);
  });

  it('refuses a payload version newer than we understand', () => {
    assert.equal(
      parsePairingPayload('{"app":"phonelink","v":99,"host":"h","port":1}'),
      null,
    );
  });
});

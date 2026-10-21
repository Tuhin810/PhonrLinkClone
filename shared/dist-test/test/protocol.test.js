"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const src_1 = require("../src");
(0, node_test_1.describe)('envelope validation', () => {
    (0, node_test_1.it)('accepts a well-formed notification', () => {
        const envelope = (0, src_1.parseEnvelope)(JSON.stringify({
            type: 'notification',
            id: 'k1',
            app: 'com.whatsapp',
            title: 'Title',
            text: 'Body',
            timestamp: 1,
        }));
        strict_1.default.equal(envelope.type, 'notification');
    });
    (0, node_test_1.it)('rejects unknown message types', () => {
        strict_1.default.throws(() => (0, src_1.parseEnvelope)('{"type":"launch_missiles"}'), src_1.ProtocolError);
    });
    (0, node_test_1.it)('rejects missing required fields', () => {
        strict_1.default.equal((0, src_1.tryParseEnvelope)('{"type":"notification","id":"1"}'), null);
    });
    (0, node_test_1.it)('rejects non-JSON frames', () => {
        strict_1.default.equal((0, src_1.tryParseEnvelope)('not json at all'), null);
    });
    (0, node_test_1.it)('rejects a chunk index beyond the chunk count', () => {
        strict_1.default.equal((0, src_1.tryParseEnvelope)(JSON.stringify({
            type: 'file_chunk',
            fileId: 'f',
            chunkIndex: 5,
            totalChunks: 3,
            data: '',
        })), null);
    });
    (0, node_test_1.it)('rejects an oversized chunk payload', () => {
        strict_1.default.equal((0, src_1.tryParseEnvelope)(JSON.stringify({
            type: 'file_chunk',
            fileId: 'f',
            chunkIndex: 0,
            totalChunks: 1,
            data: 'A'.repeat(src_1.FILE_CHUNK_BYTES * 2),
        })), null);
    });
    (0, node_test_1.it)('rejects an unknown clipboard source device', () => {
        strict_1.default.equal((0, src_1.tryParseEnvelope)(JSON.stringify({
            type: 'clipboard_update',
            content: 'x',
            sourceDevice: 'toaster',
            timestamp: 1,
        })), null);
    });
    (0, node_test_1.it)('accepts a contacts list and normalises missing fields', () => {
        const envelope = (0, src_1.parseEnvelope)(JSON.stringify({
            type: 'contacts_list',
            contacts: [{ id: '7', name: 'Mom', phones: [{ number: '+91 98000 00000' }] }],
        }));
        strict_1.default.equal(envelope.type, 'contacts_list');
        if (envelope.type !== 'contacts_list')
            return;
        strict_1.default.equal(envelope.contacts[0]?.starred, false);
        strict_1.default.equal(envelope.contacts[0]?.phones[0]?.label, undefined);
    });
    (0, node_test_1.it)('rejects a contact whose phones are not a list', () => {
        strict_1.default.equal((0, src_1.tryParseEnvelope)(JSON.stringify({
            type: 'contacts_list',
            contacts: [{ id: '7', name: 'Mom', phones: '+91 98000 00000' }],
        })), null);
    });
    (0, node_test_1.it)('requires a body to send a text', () => {
        strict_1.default.equal((0, src_1.tryParseEnvelope)('{"type":"sms_send","id":"1","number":"123"}'), null);
        const envelope = (0, src_1.parseEnvelope)('{"type":"sms_send","id":"1","number":"123","body":"hi"}');
        strict_1.default.equal(envelope.type, 'sms_send');
    });
    (0, node_test_1.it)('accepts answering a call, and nothing beyond the known call actions', () => {
        strict_1.default.equal((0, src_1.parseEnvelope)('{"type":"call_action","action":"answer"}').type, 'call_action');
        strict_1.default.equal((0, src_1.tryParseEnvelope)('{"type":"call_action","action":"transfer"}'), null);
    });
    (0, node_test_1.it)('requires a boolean outcome on a phone action result', () => {
        strict_1.default.equal((0, src_1.tryParseEnvelope)('{"type":"phone_action_result","id":"1","ok":"yes"}'), null);
    });
});
(0, node_test_1.describe)('pairing payload', () => {
    (0, node_test_1.it)('round-trips a v2 payload', () => {
        const raw = JSON.stringify({
            app: 'phonelink',
            v: 2,
            host: '192.168.1.9',
            port: 47711,
            device: 'Mac',
            pubKey: 'abc',
            token: 'def',
        });
        const parsed = (0, src_1.parsePairingPayload)(raw);
        strict_1.default.equal(parsed?.host, '192.168.1.9');
        strict_1.default.equal(parsed?.token, 'def');
    });
    (0, node_test_1.it)('ignores QR codes belonging to other apps', () => {
        strict_1.default.equal((0, src_1.parsePairingPayload)('https://example.com'), null);
        strict_1.default.equal((0, src_1.parsePairingPayload)('{"app":"other","v":2,"host":"h","port":1}'), null);
    });
    (0, node_test_1.it)('refuses a payload version newer than we understand', () => {
        strict_1.default.equal((0, src_1.parsePairingPayload)('{"app":"phonelink","v":99,"host":"h","port":1}'), null);
    });
});

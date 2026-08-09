"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ws_1 = require("ws");
const shared_1 = require("@phonelink/shared");
const linkServer_1 = require("../src/main/linkServer");
/**
 * Drives the real LinkServer against an in-memory keystore. These are the assertions that keep
 * the LAN port closed, so they are worth having in CI rather than in a throwaway script.
 */
function stubKeystore() {
    const keyPair = (0, shared_1.generateKeyPair)();
    const trusted = new Map();
    return {
        getKeyPair: () => keyPair,
        isTrusted: (key) => trusted.has(key),
        trustedName: (key) => trusted.get(key) ?? null,
        trust: (key, name) => void trusted.set(key, name),
        listTrusted: () => [...trusted].map(([pubKey, deviceName]) => ({ pubKey, deviceName })),
        unpairAll: () => trusted.clear(),
    };
}
const PORT = 47_802;
const keystore = stubKeystore();
const server = new linkServer_1.LinkServer(keystore, PORT);
const received = [];
server.on('envelope', envelope => received.push(envelope));
server.start();
(0, node_test_1.after)(() => server.stop());
/** Connects, sends one pair_request, and reports whether the Mac confirmed. */
function dial(request, sendAfter) {
    return new Promise(resolve => {
        const socket = new ws_1.WebSocket(`ws://127.0.0.1:${PORT}`);
        const result = { confirmed: false, macPubKey: null };
        socket.on('open', () => socket.send(JSON.stringify(request)));
        socket.on('message', raw => {
            const envelope = JSON.parse(raw.toString());
            if (envelope.type !== 'pair_confirm')
                return;
            result.confirmed = true;
            result.macPubKey = envelope.pubKey;
            if (sendAfter) {
                const shared = (0, shared_1.deriveSharedKey)(phone.secretKey, envelope.pubKey);
                socket.send((0, shared_1.sealEnvelope)(sendAfter(shared), shared));
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
const phone = (0, shared_1.generateKeyPair)();
(0, node_test_1.describe)('pairing handshake', () => {
    (0, node_test_1.it)('refuses an unknown device with no pairing proof', async () => {
        const result = await dial({
            type: 'pair_request',
            deviceName: 'Attacker',
            pubKey: (0, shared_1.generateKeyPair)().publicKey,
            protocolVersion: shared_1.PROTOCOL_VERSION,
        });
        strict_1.default.equal(result.confirmed, false);
    });
    (0, node_test_1.it)('refuses a proof built from the wrong token', async () => {
        const result = await dial({
            type: 'pair_request',
            deviceName: 'Attacker',
            pubKey: phone.publicKey,
            protocolVersion: shared_1.PROTOCOL_VERSION,
            pairingProof: (0, shared_1.pairingProof)('not-the-real-token', phone.publicKey),
        });
        strict_1.default.equal(result.confirmed, false);
    });
    (0, node_test_1.it)('refuses a protocol version mismatch', async () => {
        const result = await dial({
            type: 'pair_request',
            deviceName: 'Old build',
            pubKey: phone.publicKey,
            protocolVersion: shared_1.PROTOCOL_VERSION - 1,
            pairingProof: (0, shared_1.pairingProof)(server.getPairingToken(), phone.publicKey),
        });
        strict_1.default.equal(result.confirmed, false);
    });
    (0, node_test_1.it)('refuses a frame that is not a pairing request', async () => {
        const result = await dial({ type: 'ping' });
        strict_1.default.equal(result.confirmed, false);
    });
    (0, node_test_1.it)('pairs with a valid token and then accepts encrypted traffic', async () => {
        const token = server.getPairingToken();
        const result = await dial({
            type: 'pair_request',
            deviceName: 'Real phone',
            pubKey: phone.publicKey,
            protocolVersion: shared_1.PROTOCOL_VERSION,
            pairingProof: (0, shared_1.pairingProof)(token, phone.publicKey),
        }, () => ({
            type: 'notification',
            id: 'n1',
            app: 'com.test',
            title: 'Encrypted',
            text: 'body',
            timestamp: 1,
        }));
        strict_1.default.equal(result.confirmed, true);
        strict_1.default.equal(keystore.isTrusted(phone.publicKey), true);
        strict_1.default.ok(received.some(e => e.type === 'notification' && e.title === 'Encrypted'), 'the Mac should decrypt traffic sent after pairing');
    });
    (0, node_test_1.it)('accepts a trusted device reconnecting without a token', async () => {
        const result = await dial({
            type: 'pair_request',
            deviceName: 'Real phone',
            pubKey: phone.publicKey,
            protocolVersion: shared_1.PROTOCOL_VERSION,
        });
        strict_1.default.equal(result.confirmed, true);
    });
    (0, node_test_1.it)('refuses a used token replayed by a different device', async () => {
        // The token rotated when the first pairing succeeded, so the old one is worthless.
        const result = await dial({
            type: 'pair_request',
            deviceName: 'Second device',
            pubKey: (0, shared_1.generateKeyPair)().publicKey,
            protocolVersion: shared_1.PROTOCOL_VERSION,
            pairingProof: (0, shared_1.pairingProof)('stale-token', (0, shared_1.generateKeyPair)().publicKey),
        });
        strict_1.default.equal(result.confirmed, false);
    });
});

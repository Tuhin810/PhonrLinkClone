"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const src_1 = require("../src");
const sample = {
    type: 'notification',
    id: 'k1',
    app: 'com.whatsapp',
    title: 'Secret title',
    text: 'Secret body',
    timestamp: 1,
};
(0, node_test_1.describe)('pairing proof', () => {
    (0, node_test_1.it)('verifies with the matching token and key', () => {
        const token = (0, src_1.generatePairingToken)();
        const phone = (0, src_1.generateKeyPair)();
        strict_1.default.equal((0, src_1.verifyPairingProof)(token, phone.publicKey, (0, src_1.pairingProof)(token, phone.publicKey)), true);
    });
    (0, node_test_1.it)('rejects a proof made with a different token', () => {
        const phone = (0, src_1.generateKeyPair)();
        const proof = (0, src_1.pairingProof)((0, src_1.generatePairingToken)(), phone.publicKey);
        strict_1.default.equal((0, src_1.verifyPairingProof)((0, src_1.generatePairingToken)(), phone.publicKey, proof), false);
    });
    (0, node_test_1.it)('rejects a proof replayed for a different public key', () => {
        const token = (0, src_1.generatePairingToken)();
        const phone = (0, src_1.generateKeyPair)();
        const attacker = (0, src_1.generateKeyPair)();
        const proof = (0, src_1.pairingProof)(token, phone.publicKey);
        strict_1.default.equal((0, src_1.verifyPairingProof)(token, attacker.publicKey, proof), false);
    });
    (0, node_test_1.it)('rejects a malformed proof without throwing', () => {
        strict_1.default.equal((0, src_1.verifyPairingProof)((0, src_1.generatePairingToken)(), 'k', 'not base64 %%%'), false);
    });
});
(0, node_test_1.describe)('sealed channel', () => {
    const mac = (0, src_1.generateKeyPair)();
    const phone = (0, src_1.generateKeyPair)();
    const macKey = (0, src_1.deriveSharedKey)(mac.secretKey, phone.publicKey);
    const phoneKey = (0, src_1.deriveSharedKey)(phone.secretKey, mac.publicKey);
    (0, node_test_1.it)('derives the same shared key from both sides', () => {
        strict_1.default.equal(macKey, phoneKey);
    });
    (0, node_test_1.it)('round-trips an envelope', () => {
        const opened = (0, src_1.tryOpenEnvelope)((0, src_1.sealEnvelope)(sample, macKey), phoneKey);
        strict_1.default.equal(opened?.type, 'notification');
        strict_1.default.equal(opened && 'title' in opened ? opened.title : null, 'Secret title');
    });
    (0, node_test_1.it)('leaks no plaintext into the frame', () => {
        const sealed = (0, src_1.sealEnvelope)(sample, macKey);
        strict_1.default.equal(sealed.includes('Secret'), false);
        strict_1.default.equal(sealed.includes('whatsapp'), false);
    });
    (0, node_test_1.it)('rejects a frame sealed for someone else', () => {
        const stranger = (0, src_1.deriveSharedKey)((0, src_1.generateKeyPair)().secretKey, mac.publicKey);
        strict_1.default.equal((0, src_1.tryOpenEnvelope)((0, src_1.sealEnvelope)(sample, macKey), stranger), null);
    });
    (0, node_test_1.it)('rejects a tampered frame', () => {
        const frame = JSON.parse((0, src_1.sealEnvelope)(sample, macKey));
        frame.c = `A${frame.c.slice(1)}`;
        strict_1.default.equal((0, src_1.tryOpenEnvelope)(JSON.stringify(frame), phoneKey), null);
    });
    (0, node_test_1.it)('rejects frames that are not sealed at all', () => {
        strict_1.default.equal((0, src_1.tryOpenEnvelope)(JSON.stringify(sample), phoneKey), null);
        strict_1.default.equal((0, src_1.tryOpenEnvelope)('{}', phoneKey), null);
    });
});

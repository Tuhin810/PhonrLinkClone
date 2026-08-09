"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateKeyPair = generateKeyPair;
exports.deriveSharedKey = deriveSharedKey;
exports.generatePairingToken = generatePairingToken;
exports.pairingProof = pairingProof;
exports.verifyPairingProof = verifyPairingProof;
exports.sealEnvelope = sealEnvelope;
exports.openEnvelope = openEnvelope;
exports.tryOpenEnvelope = tryOpenEnvelope;
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const tweetnacl_util_1 = require("tweetnacl-util");
const validate_1 = require("./validate");
function generateKeyPair() {
    const pair = tweetnacl_1.default.box.keyPair();
    return {
        publicKey: (0, tweetnacl_util_1.encodeBase64)(pair.publicKey),
        secretKey: (0, tweetnacl_util_1.encodeBase64)(pair.secretKey),
    };
}
/** Precomputed shared key for a peer. Cheaper than deriving it per frame. */
function deriveSharedKey(ownSecretKey, peerPublicKey) {
    const shared = tweetnacl_1.default.box.before((0, tweetnacl_util_1.decodeBase64)(peerPublicKey), (0, tweetnacl_util_1.decodeBase64)(ownSecretKey));
    return (0, tweetnacl_util_1.encodeBase64)(shared);
}
/** One-time pairing token shown in the QR. */
function generatePairingToken() {
    return (0, tweetnacl_util_1.encodeBase64)(tweetnacl_1.default.randomBytes(16));
}
/**
 * Proof that the phone read the token off the Mac's screen: a keyed hash over its own public
 * key. Constant-time compared on the Mac via `nacl.verify`.
 */
function pairingProof(token, publicKey) {
    const material = (0, tweetnacl_util_1.decodeUTF8)(`${token}:${publicKey}`);
    return (0, tweetnacl_util_1.encodeBase64)(tweetnacl_1.default.hash(material).subarray(0, 32));
}
function verifyPairingProof(token, publicKey, proof) {
    let provided;
    try {
        provided = (0, tweetnacl_util_1.decodeBase64)(proof);
    }
    catch {
        return false;
    }
    const expected = (0, tweetnacl_util_1.decodeBase64)(pairingProof(token, publicKey));
    if (provided.length !== expected.length)
        return false;
    return tweetnacl_1.default.verify(provided, expected);
}
function sealEnvelope(envelope, sharedKey) {
    const nonce = tweetnacl_1.default.randomBytes(tweetnacl_1.default.box.nonceLength);
    const box = tweetnacl_1.default.box.after((0, tweetnacl_util_1.decodeUTF8)(JSON.stringify(envelope)), nonce, (0, tweetnacl_util_1.decodeBase64)(sharedKey));
    const frame = { n: (0, tweetnacl_util_1.encodeBase64)(nonce), c: (0, tweetnacl_util_1.encodeBase64)(box) };
    return JSON.stringify(frame);
}
/**
 * Decrypts and validates a frame. Throws ProtocolError on anything malformed or unauthentic —
 * a frame that fails here never reaches a handler.
 */
function openEnvelope(raw, sharedKey) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new validate_1.ProtocolError('sealed frame is not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new validate_1.ProtocolError('sealed frame must be an object');
    }
    const frame = parsed;
    if (typeof frame['n'] !== 'string' || typeof frame['c'] !== 'string') {
        throw new validate_1.ProtocolError('sealed frame missing "n" or "c"');
    }
    let opened;
    try {
        opened = tweetnacl_1.default.box.open.after((0, tweetnacl_util_1.decodeBase64)(frame['c']), (0, tweetnacl_util_1.decodeBase64)(frame['n']), (0, tweetnacl_util_1.decodeBase64)(sharedKey));
    }
    catch {
        throw new validate_1.ProtocolError('sealed frame is not decodable');
    }
    // null means authentication failed: wrong key, or the frame was tampered with.
    if (!opened)
        throw new validate_1.ProtocolError('sealed frame failed authentication');
    try {
        return (0, validate_1.validateEnvelope)(JSON.parse((0, tweetnacl_util_1.encodeUTF8)(opened)));
    }
    catch (error) {
        if (error instanceof validate_1.ProtocolError)
            throw error;
        throw new validate_1.ProtocolError('decrypted payload is not valid JSON');
    }
}
function tryOpenEnvelope(raw, sharedKey) {
    try {
        return openEnvelope(raw, sharedKey);
    }
    catch {
        return null;
    }
}

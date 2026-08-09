"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Keystore = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const shared_1 = require("@phonelink/shared");
/**
 * Long-term identity and the set of paired phones.
 *
 * Secrets are sealed with Electron's `safeStorage`, which is backed by the macOS Keychain, so
 * the private key is not sitting in plaintext in the user's Application Support directory.
 * `safeStorage` is used rather than `keytar` because it ships with Electron — no native module
 * to build, and one less dependency to keep alive.
 */
class Keystore {
    file;
    identity;
    constructor() {
        this.file = node_path_1.default.join(electron_1.app.getPath('userData'), 'identity.bin');
        this.identity = this.load();
    }
    getKeyPair() {
        return this.identity.keyPair;
    }
    isTrusted(pubKey) {
        return pubKey in this.identity.trustedPhones;
    }
    trustedName(pubKey) {
        return this.identity.trustedPhones[pubKey]?.deviceName ?? null;
    }
    trust(pubKey, deviceName) {
        this.identity.trustedPhones[pubKey] = { deviceName, pairedAt: Date.now() };
        this.save();
    }
    listTrusted() {
        return Object.entries(this.identity.trustedPhones).map(([pubKey, entry]) => ({
            pubKey,
            deviceName: entry.deviceName,
        }));
    }
    /** Forgets every paired phone. The Mac's own identity is kept. */
    unpairAll() {
        this.identity.trustedPhones = {};
        this.save();
    }
    load() {
        try {
            if (node_fs_1.default.existsSync(this.file)) {
                const blob = node_fs_1.default.readFileSync(this.file);
                const json = electron_1.safeStorage.isEncryptionAvailable()
                    ? electron_1.safeStorage.decryptString(blob)
                    : blob.toString('utf8');
                const parsed = JSON.parse(json);
                if (parsed.keyPair?.publicKey && parsed.keyPair?.secretKey) {
                    parsed.trustedPhones ??= {};
                    return parsed;
                }
            }
        }
        catch {
            // A corrupt or undecryptable store means re-pairing, which is recoverable. Silently
            // regenerating beats refusing to start.
        }
        const fresh = { keyPair: (0, shared_1.generateKeyPair)(), trustedPhones: {} };
        this.identity = fresh;
        this.save();
        return fresh;
    }
    save() {
        const json = JSON.stringify(this.identity);
        const blob = electron_1.safeStorage.isEncryptionAvailable()
            ? electron_1.safeStorage.encryptString(json)
            : Buffer.from(json, 'utf8');
        node_fs_1.default.writeFileSync(this.file, blob, { mode: 0o600 });
    }
}
exports.Keystore = Keystore;

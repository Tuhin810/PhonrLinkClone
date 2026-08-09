import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { generateKeyPair, type KeyPair } from '@phonelink/shared';

interface StoredIdentity {
  keyPair: KeyPair;
  trustedPhones: Record<string, { deviceName: string; pairedAt: number }>;
}

/**
 * Long-term identity and the set of paired phones.
 *
 * Secrets are sealed with Electron's `safeStorage`, which is backed by the macOS Keychain, so
 * the private key is not sitting in plaintext in the user's Application Support directory.
 * `safeStorage` is used rather than `keytar` because it ships with Electron — no native module
 * to build, and one less dependency to keep alive.
 */
export class Keystore {
  private readonly file: string;
  private identity: StoredIdentity;

  constructor() {
    this.file = path.join(app.getPath('userData'), 'identity.bin');
    this.identity = this.load();
  }

  getKeyPair(): KeyPair {
    return this.identity.keyPair;
  }

  isTrusted(pubKey: string): boolean {
    return pubKey in this.identity.trustedPhones;
  }

  trustedName(pubKey: string): string | null {
    return this.identity.trustedPhones[pubKey]?.deviceName ?? null;
  }

  trust(pubKey: string, deviceName: string): void {
    this.identity.trustedPhones[pubKey] = { deviceName, pairedAt: Date.now() };
    this.save();
  }

  listTrusted(): { pubKey: string; deviceName: string }[] {
    return Object.entries(this.identity.trustedPhones).map(([pubKey, entry]) => ({
      pubKey,
      deviceName: entry.deviceName,
    }));
  }

  /** Forgets every paired phone. The Mac's own identity is kept. */
  unpairAll(): void {
    this.identity.trustedPhones = {};
    this.save();
  }

  private load(): StoredIdentity {
    try {
      if (fs.existsSync(this.file)) {
        const blob = fs.readFileSync(this.file);
        const json = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(blob)
          : blob.toString('utf8');
        const parsed = JSON.parse(json) as StoredIdentity;
        if (parsed.keyPair?.publicKey && parsed.keyPair?.secretKey) {
          parsed.trustedPhones ??= {};
          return parsed;
        }
      }
    } catch {
      // A corrupt or undecryptable store means re-pairing, which is recoverable. Silently
      // regenerating beats refusing to start.
    }
    const fresh: StoredIdentity = { keyPair: generateKeyPair(), trustedPhones: {} };
    this.identity = fresh;
    this.save();
    return fresh;
  }

  private save(): void {
    const json = JSON.stringify(this.identity);
    const blob = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf8');
    fs.writeFileSync(this.file, blob, { mode: 0o600 });
  }
}

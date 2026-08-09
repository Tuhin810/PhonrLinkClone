import { generateKeyPair, type KeyPair } from '@phonelink/shared';
import { SecureStore } from '../native/secureStore';

const KEY_IDENTITY = 'phonelink:identity';

let cached: KeyPair | null = null;

/**
 * This device's long-term keypair, created once and then reused. Kept in the Keystore-backed
 * secure store; losing it just means re-pairing.
 */
export async function getIdentity(): Promise<KeyPair> {
  if (cached) return cached;

  const stored = await SecureStore.getItem(KEY_IDENTITY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as KeyPair;
      if (parsed.publicKey && parsed.secretKey) {
        cached = parsed;
        return parsed;
      }
    } catch {
      // Corrupt entry: regenerate rather than failing to start.
    }
  }

  const fresh = generateKeyPair();
  await SecureStore.setItem(KEY_IDENTITY, JSON.stringify(fresh));
  cached = fresh;
  return fresh;
}

export async function resetIdentity(): Promise<void> {
  cached = null;
  await SecureStore.removeItem(KEY_IDENTITY);
}

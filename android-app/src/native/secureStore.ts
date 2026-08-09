import { NativeModules } from 'react-native';

interface SecureStoreNative {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const native = NativeModules.SecureStore as SecureStoreNative | undefined;

/**
 * Keystore-backed storage, used for the device's long-term private key.
 * Never put a secret in AsyncStorage — that is plaintext on disk.
 */
export const SecureStore = {
  getItem(key: string): Promise<string | null> {
    if (!native) return Promise.reject(new Error('SecureStore native module unavailable'));
    return native.getItem(key);
  },
  setItem(key: string, value: string): Promise<void> {
    if (!native) return Promise.reject(new Error('SecureStore native module unavailable'));
    return native.setItem(key, value);
  },
  removeItem(key: string): Promise<void> {
    if (!native) return Promise.reject(new Error('SecureStore native module unavailable'));
    return native.removeItem(key);
  },
};

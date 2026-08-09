import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_MAC = 'phonelink:pairedMac';

/**
 * The Mac we are paired with. Only public data lives here, so AsyncStorage is fine — the
 * private key is in the secure store.
 */
export interface PairedMac {
  host: string;
  port: number;
  deviceName: string;
  pubKey: string;
}

export async function getPairedMac(): Promise<PairedMac | null> {
  const raw = await AsyncStorage.getItem(KEY_MAC);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PairedMac;
    return parsed.pubKey && parsed.host ? parsed : null;
  } catch {
    return null;
  }
}

export async function setPairedMac(mac: PairedMac): Promise<void> {
  await AsyncStorage.setItem(KEY_MAC, JSON.stringify(mac));
}

export async function clearPairedMac(): Promise<void> {
  await AsyncStorage.removeItem(KEY_MAC);
}

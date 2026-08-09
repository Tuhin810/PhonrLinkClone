import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_MANUAL_HOST = 'phonelink:manualHost';

/**
 * Manual address override, the escape hatch for networks where mDNS cannot work — guest wifi
 * and routers with client isolation block multicast. See docs/CONSTRAINTS.md #3.
 *
 * When set, it wins over discovery: the user asked for a specific address, so we do not
 * silently prefer something we found ourselves.
 */
export async function getManualHost(): Promise<string | null> {
  const value = await AsyncStorage.getItem(KEY_MANUAL_HOST);
  return value && value.trim() ? value.trim() : null;
}

export async function setManualHost(host: string | null): Promise<void> {
  if (host === null || !host.trim()) {
    await AsyncStorage.removeItem(KEY_MANUAL_HOST);
    return;
  }
  await AsyncStorage.setItem(KEY_MANUAL_HOST, host.trim());
}

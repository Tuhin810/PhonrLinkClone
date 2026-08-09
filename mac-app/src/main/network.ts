import { networkInterfaces } from 'node:os';

/**
 * IPv4 LAN addresses of this Mac, shown in the popup so the phone can be pointed at one.
 * Phase 4 makes this informational rather than load-bearing, once mDNS handles discovery.
 */
export function localAddresses(): string[] {
  const result: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) result.push(entry.address);
    }
  }
  return result;
}

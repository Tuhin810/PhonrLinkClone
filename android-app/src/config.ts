import { DEFAULT_PORT } from '@phonelink/shared';

/** Port the Mac listens on. Fixed on both sides via the shared protocol package. */
export const MAC_PORT = DEFAULT_PORT;

/** How many notifications the dashboard keeps in its feed. */
export const FEED_LIMIT = 20;

export function macWsUrl(host: string, port: number = MAC_PORT): string {
  return `ws://${host}:${port}`;
}

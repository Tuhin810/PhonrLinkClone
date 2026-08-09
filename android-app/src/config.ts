import { DEFAULT_PORT } from '@phonelink/shared';

/**
 * Phase 2 has no discovery — the Mac's LAN address is hardcoded here. Phase 4 replaces this
 * with mDNS and a manual-override setting.
 *
 * Set this to your Mac's LAN IP (System Settings → Network), e.g. '192.168.1.42'.
 */
export const MAC_HOST = '192.168.1.9';
export const MAC_PORT = DEFAULT_PORT;

export const MAC_WS_URL = `ws://${MAC_HOST}:${MAC_PORT}`;

/** How many notifications the dashboard keeps in its feed. */
export const FEED_LIMIT = 20;

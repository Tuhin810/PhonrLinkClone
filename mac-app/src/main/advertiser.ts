import os from 'node:os';
import { Bonjour, type Service } from 'bonjour-service';
import { DEFAULT_PORT, PROTOCOL_VERSION, SERVICE_TYPE } from '@phonelink/shared';

/**
 * Advertises this Mac over mDNS so the phone can find it without a hardcoded IP.
 *
 * Some networks (guest wifi, routers with client isolation) block multicast entirely. That is
 * expected, not a bug — the phone falls back to a manually entered address. See
 * docs/CONSTRAINTS.md #3.
 */
export class Advertiser {
  private bonjour: Bonjour | null = null;
  private service: Service | null = null;

  constructor(
    private readonly port: number = DEFAULT_PORT,
    private readonly deviceName: string = os.hostname().replace(/\.local$/, ''),
  ) {}

  start(): void {
    if (this.service) return;
    this.bonjour = new Bonjour();
    this.service = this.bonjour.publish({
      name: `PhoneLink (${this.deviceName})`,
      type: SERVICE_TYPE,
      protocol: 'tcp',
      port: this.port,
      // The phone reads these to show a device name and to reject version mismatches early.
      txt: {
        device: this.deviceName,
        version: String(PROTOCOL_VERSION),
      },
    });
    console.log(`[mdns] advertising _${SERVICE_TYPE}._tcp on ${this.port} as ${this.deviceName}`);
  }

  stop(): void {
    // unpublishAll sends goodbye packets so the phone drops us promptly instead of retrying
    // a dead address until its own timeout.
    this.bonjour?.unpublishAll(() => this.bonjour?.destroy());
    this.service = null;
    this.bonjour = null;
  }
}

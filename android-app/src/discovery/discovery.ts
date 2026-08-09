import Zeroconf, { type ZeroconfService } from 'react-native-zeroconf';
import { SERVICE_TYPE } from '@phonelink/shared';

export interface DiscoveredMac {
  host: string;
  port: number;
  deviceName: string;
}

type Handler = (mac: DiscoveredMac | null) => void;
/** Diagnostics surfaced in the UI: JS console output only reaches Metro, not logcat. */
type DiagnosticHandler = (line: string) => void;

const RESCAN_INTERVAL_MS = 15_000;

/**
 * Browses for the Mac over mDNS.
 *
 * Discovery failing is a normal resting state, not an error: multicast is blocked on plenty of
 * networks, and the phone may simply be on mobile data. We keep re-scanning quietly and let
 * the UI show "disconnected".
 */
export class MacDiscovery {
  private zeroconf: Zeroconf | null = null;
  private rescanTimer: ReturnType<typeof setInterval> | null = null;
  private found: DiscoveredMac | null = null;

  constructor(
    private readonly onChange: Handler,
    private readonly onDiagnostic: DiagnosticHandler = () => undefined,
  ) {}

  start(): void {
    if (this.zeroconf) return;
    const zeroconf = new Zeroconf();
    this.zeroconf = zeroconf;

    zeroconf.on('found', name => this.onDiagnostic(`found ${String(name)}`));

    zeroconf.on('resolved', (service: ZeroconfService) => {
      const address = pickIPv4(service.addresses);
      this.onDiagnostic(
        `resolved ${service.name ?? '?'} addrs=${(service.addresses ?? []).join(',') || 'none'} port=${service.port ?? '?'}`,
      );
      if (!address || !service.port) return;
      const deviceName =
        (service.txt?.device as string | undefined) ?? service.name ?? 'Mac';
      this.found = { host: address, port: service.port, deviceName };
      this.onChange(this.found);
    });

    zeroconf.on('remove', () => {
      // The Mac went away (quit, or sent goodbye packets). Drop it and keep looking.
      this.found = null;
      this.onChange(null);
      this.scan();
    });

    zeroconf.on('error', error => {
      // Multicast blocked or the interface changed; the periodic rescan handles recovery.
      this.onDiagnostic(`error ${String(error)}`);
    });

    this.scan();
    // Zeroconf scans are one-shot on Android; re-arm periodically so a Mac that appears later
    // (or after a wifi change) still gets picked up.
    this.rescanTimer = setInterval(() => {
      if (!this.found) this.scan();
    }, RESCAN_INTERVAL_MS);
  }

  stop(): void {
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer);
      this.rescanTimer = null;
    }
    try {
      this.zeroconf?.stop();
      this.zeroconf?.removeDeviceListeners();
    } catch {
      // Nothing useful to do if teardown fails; the module is going away anyway.
    }
    this.zeroconf = null;
    this.found = null;
  }

  private scan(): void {
    try {
      this.zeroconf?.stop();
      this.zeroconf?.scan(SERVICE_TYPE, 'tcp', 'local.');
      this.onDiagnostic(`scanning _${SERVICE_TYPE}._tcp`);
    } catch (error) {
      this.onDiagnostic(`scan threw ${String(error)}`);
      // Scan can throw if wifi just dropped; the next interval tick retries.
    }
  }
}

function pickIPv4(addresses: string[] | undefined): string | null {
  if (!addresses) return null;
  // Zeroconf returns IPv6 entries too; the WebSocket URL is simpler with a plain IPv4.
  return addresses.find(address => /^\d+\.\d+\.\d+\.\d+$/.test(address)) ?? null;
}

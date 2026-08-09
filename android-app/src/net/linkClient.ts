import {
  Envelope,
  MISSED_PINGS_BEFORE_DISCONNECT,
  PING_INTERVAL_MS,
  PROTOCOL_VERSION,
  deriveSharedKey,
  encodeEnvelope,
  pairingProof,
  sealEnvelope,
  tryOpenEnvelope,
  tryParseEnvelope,
} from '@phonelink/shared';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface LinkClientOptions {
  url: string;
  /** This device's long-term keypair. */
  identity: { publicKey: string; secretKey: string };
  deviceName: string;
  /** Mac's public key, once paired. Null on a first pairing. */
  macPubKey: string | null;
  /** One-time token from the QR, used only for a first pairing. */
  pairingToken?: string | null;
  onStateChange(state: ConnectionState): void;
  onEnvelope?(envelope: Envelope): void;
  /** Called when the Mac confirms pairing, so its key can be persisted. */
  onPaired?(macPubKey: string, deviceName: string): void;
}

const BASE_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/**
 * WebSocket client to the Mac, with reconnect backoff and a ping/pong heartbeat.
 *
 * Being disconnected is a normal resting state (different networks, phone on mobile data),
 * so this never surfaces errors as failures — it just keeps retrying quietly.
 */
export class LinkClient {
  private socket: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private missedPongs = 0;
  private stopped = true;
  /** Null until the handshake completes; every later frame is sealed with it. */
  private sharedKey: string | null = null;

  constructor(private readonly options: LinkClientOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
    this.sharedKey = null;
    this.setState('disconnected');
  }

  /** Queues nothing: if the socket is down the message is dropped, by design for Phase 2. */
  send(envelope: Envelope): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    // Refuse to send anything before the channel is encrypted. Silently leaking a
    // notification in clear text would be worse than dropping it.
    if (!this.sharedKey) return false;
    this.socket.send(sealEnvelope(envelope, this.sharedKey));
    return true;
  }

  getState(): ConnectionState {
    return this.state;
  }

  private connect(): void {
    if (this.stopped) return;
    this.clearTimers();
    this.setState('connecting');

    const socket = new WebSocket(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      this.retryAttempt = 0;
      this.missedPongs = 0;
      this.sharedKey = null;
      // Connected at the socket level, but not usable until the Mac confirms pairing.
      const { identity, deviceName, pairingToken } = this.options;
      socket.send(
        encodeEnvelope({
          type: 'pair_request',
          deviceName,
          pubKey: identity.publicKey,
          protocolVersion: PROTOCOL_VERSION,
          // Only sent on a first pairing; afterwards our key alone is the credential.
          ...(pairingToken
            ? { pairingProof: pairingProof(pairingToken, identity.publicKey) }
            : {}),
        }),
      );
    };

    socket.onmessage = event => {
      if (typeof event.data !== 'string') return;

      // Before the handshake completes the only expected frame is a clear-text pair_confirm.
      if (!this.sharedKey) {
        const handshake = tryParseEnvelope(event.data);
        if (!handshake || handshake.type !== 'pair_confirm') return;
        if (handshake.protocolVersion !== PROTOCOL_VERSION) {
          // Version mismatch: fail loudly rather than talking past each other.
          socket.close();
          return;
        }
        this.sharedKey = deriveSharedKey(
          this.options.identity.secretKey,
          handshake.pubKey,
        );
        this.setState('connected');
        this.startHeartbeat();
        this.options.onPaired?.(handshake.pubKey, handshake.deviceName);
        return;
      }

      const envelope = tryOpenEnvelope(event.data, this.sharedKey);
      // Frames that fail decryption or validation are dropped, never thrown.
      if (!envelope) return;
      if (envelope.type === 'pong') {
        this.missedPongs = 0;
        return;
      }
      if (envelope.type === 'ping') {
        this.send({ type: 'pong' });
        return;
      }
      this.options.onEnvelope?.(envelope);
    };

    socket.onerror = () => {
      // onclose always follows; reconnect is handled there to avoid scheduling twice.
    };

    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.sharedKey = null;
      this.clearTimers();
      this.setState('disconnected');
      this.scheduleReconnect();
    };
  }

  private startHeartbeat(): void {
    this.pingTimer = setInterval(() => {
      if (this.missedPongs >= MISSED_PINGS_BEFORE_DISCONNECT) {
        // The socket looks open but the peer is gone (sleeping Mac, dropped wifi).
        this.socket?.close();
        return;
      }
      this.missedPongs += 1;
      this.send({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    // Exponential backoff with jitter so a restarting Mac doesn't meet a tight retry loop.
    const delay = Math.min(BASE_RETRY_MS * 2 ** this.retryAttempt, MAX_RETRY_MS);
    const jittered = delay * (0.5 + Math.random() * 0.5);
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => this.connect(), jittered);
  }

  private clearTimers(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange(state);
  }
}

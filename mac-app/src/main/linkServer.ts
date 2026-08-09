import { EventEmitter } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import {
  DEFAULT_PORT,
  Envelope,
  MISSED_PINGS_BEFORE_DISCONNECT,
  PING_INTERVAL_MS,
  PROTOCOL_VERSION,
  deriveSharedKey,
  encodeEnvelope,
  generatePairingToken,
  sealEnvelope,
  tryOpenEnvelope,
  tryParseEnvelope,
  verifyPairingProof,
} from '@phonelink/shared';
import type { Keystore } from './keystore';

export type ConnectionState = 'waiting' | 'connected' | 'paused';

export interface LinkServerEvents {
  state: [ConnectionState];
  envelope: [Envelope];
  /** Emitted when a new phone completes pairing, so the UI can say so. */
  paired: [string];
  /** Rejected connection attempts, surfaced rather than silently dropped. */
  rejected: [string];
}

/**
 * Accepts the phone's WebSocket connection on the LAN.
 *
 * The Mac is the server because it has the stable address; the phone dials in. Only one phone
 * is expected, so a new connection replaces the old one rather than being rejected — that is
 * what happens when the phone reconnects after a network blip and the stale socket has not
 * timed out yet.
 */
export class LinkServer extends EventEmitter<LinkServerEvents> {
  private server: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private missedPongs = 0;
  private state: ConnectionState = 'waiting';
  /**
   * While paused we drop the current phone and refuse new connections. Without this a
   * "disconnect" would last about a second: the phone's own backoff would reconnect
   * immediately, which is not what the button means.
   */
  private paused = false;

  /** Regenerated whenever the QR is shown, so a token cannot be reused indefinitely. */
  private pairingToken = generatePairingToken();
  /** Shared key for the current session; null until the handshake completes. */
  private sharedKey: string | null = null;
  private peerName: string | null = null;

  constructor(
    private readonly keystore: Keystore,
    private readonly port: number = DEFAULT_PORT,
  ) {
    super();
  }

  /** Token embedded in the pairing QR. */
  getPairingToken(): string {
    return this.pairingToken;
  }

  /** Invalidates the current token; called after a successful pairing. */
  rotatePairingToken(): void {
    this.pairingToken = generatePairingToken();
  }

  getPeerName(): string | null {
    return this.peerName;
  }

  /** Whether the socket's send buffer has drained; used as backpressure by file transfers. */
  isDrained(): boolean {
    return !this.socket || this.socket.bufferedAmount < 1_000_000;
  }

  start(): void {
    // 0.0.0.0 so the phone can reach us; this is a LAN-only app by design.
    this.server = new WebSocketServer({ port: this.port, host: '0.0.0.0' });
    this.server.on('connection', socket => this.adopt(socket));
  }

  stop(): void {
    this.clearHeartbeat();
    this.socket?.close();
    this.socket = null;
    this.server?.close();
    this.server = null;
    this.setState('waiting');
  }

  getState(): ConnectionState {
    return this.state;
  }

  send(envelope: Envelope): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    // Only the handshake travels in clear; everything after it is sealed.
    this.socket.send(
      this.sharedKey ? sealEnvelope(envelope, this.sharedKey) : encodeEnvelope(envelope),
    );
    return true;
  }

  /** Drops the phone and refuses reconnections until [resume] is called. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.clearHeartbeat();
    this.socket?.close();
    this.socket = null;
    this.setState('paused');
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.setState('waiting');
  }

  isPaused(): boolean {
    return this.paused;
  }

  private adopt(socket: WebSocket): void {
    if (this.paused) {
      socket.close();
      return;
    }
    this.socket?.close();
    this.socket = socket;
    this.missedPongs = 0;
    this.sharedKey = null;
    this.peerName = null;
    // Not 'connected' yet: an unpaired socket must not be treated as a working link.
    this.startHeartbeat();

    socket.on('message', raw => {
      const text = raw.toString();

      // Before the handshake the only acceptable frame is a clear-text pair_request.
      if (!this.sharedKey) {
        this.handleHandshake(socket, text);
        return;
      }

      const envelope = tryOpenEnvelope(text, this.sharedKey);
      // A frame that fails decryption or validation is dropped, never thrown.
      if (!envelope) return;

      if (envelope.type === 'pong') {
        this.missedPongs = 0;
        return;
      }
      if (envelope.type === 'ping') {
        this.send({ type: 'pong' });
        return;
      }
      this.emit('envelope', envelope);
    });

    socket.on('close', () => {
      if (this.socket !== socket) return; // superseded by a newer connection
      this.socket = null;
      this.sharedKey = null;
      this.peerName = null;
      this.clearHeartbeat();
      if (!this.paused) this.setState('waiting');
    });

    socket.on('error', () => {
      // 'close' always follows; nothing to do here.
    });
  }

  /**
   * Completes (or refuses) the pairing handshake.
   *
   * A phone is accepted if it either proves it read the QR token, or presents a public key we
   * already trust. Anything else is closed: without this, any device on the LAN could connect.
   */
  private handleHandshake(socket: WebSocket, text: string): void {
    const envelope = tryParseEnvelope(text);
    if (!envelope || envelope.type !== 'pair_request') {
      this.reject(socket, 'expected a pairing request');
      return;
    }
    if (envelope.protocolVersion !== PROTOCOL_VERSION) {
      this.reject(
        socket,
        `protocol mismatch (phone v${envelope.protocolVersion}, Mac v${PROTOCOL_VERSION})`,
      );
      return;
    }

    const alreadyTrusted = this.keystore.isTrusted(envelope.pubKey);
    const provedToken =
      typeof envelope.pairingProof === 'string' &&
      verifyPairingProof(this.pairingToken, envelope.pubKey, envelope.pairingProof);

    if (!alreadyTrusted && !provedToken) {
      this.reject(socket, `unpaired device "${envelope.deviceName}" — scan the QR to pair`);
      return;
    }

    const keyPair = this.keystore.getKeyPair();
    this.sharedKey = deriveSharedKey(keyPair.secretKey, envelope.pubKey);
    this.peerName = envelope.deviceName;

    // Reply in clear: the phone cannot derive the shared key until it has our public key.
    socket.send(
      encodeEnvelope({
        type: 'pair_confirm',
        deviceName: 'Mac',
        pubKey: keyPair.publicKey,
        protocolVersion: PROTOCOL_VERSION,
      }),
    );

    if (!alreadyTrusted) {
      this.keystore.trust(envelope.pubKey, envelope.deviceName);
      // A token is single-use; a leaked screenshot should not pair a second device later.
      this.rotatePairingToken();
      this.emit('paired', envelope.deviceName);
    }

    this.setState('connected');
  }

  private reject(socket: WebSocket, reason: string): void {
    this.emit('rejected', reason);
    socket.close();
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.missedPongs >= MISSED_PINGS_BEFORE_DISCONNECT) {
        // Socket looks open but the peer is gone — a sleeping phone or a dropped wifi link.
        this.socket?.terminate();
        return;
      }
      this.missedPongs += 1;
      this.send({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }

  private clearHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit('state', state);
  }
}

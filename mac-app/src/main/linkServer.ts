import { EventEmitter } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import {
  DEFAULT_PORT,
  Envelope,
  MISSED_PINGS_BEFORE_DISCONNECT,
  PING_INTERVAL_MS,
  encodeEnvelope,
  tryParseEnvelope,
} from '@phonelink/shared';

export type ConnectionState = 'waiting' | 'connected';

export interface LinkServerEvents {
  state: [ConnectionState];
  envelope: [Envelope];
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

  constructor(private readonly port: number = DEFAULT_PORT) {
    super();
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
    this.socket.send(encodeEnvelope(envelope));
    return true;
  }

  private adopt(socket: WebSocket): void {
    this.socket?.close();
    this.socket = socket;
    this.missedPongs = 0;
    this.setState('connected');
    this.startHeartbeat();

    socket.on('message', raw => {
      const envelope = tryParseEnvelope(raw.toString());
      // A malformed frame is dropped, never thrown — it must not take the link down.
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
      this.clearHeartbeat();
      this.setState('waiting');
    });

    socket.on('error', () => {
      // 'close' always follows; nothing to do here.
    });
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

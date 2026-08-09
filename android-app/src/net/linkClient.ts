import {
  Envelope,
  MISSED_PINGS_BEFORE_DISCONNECT,
  PING_INTERVAL_MS,
  encodeEnvelope,
  tryParseEnvelope,
} from '@phonelink/shared';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface LinkClientOptions {
  url: string;
  onStateChange(state: ConnectionState): void;
  onEnvelope?(envelope: Envelope): void;
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
    this.setState('disconnected');
  }

  /** Queues nothing: if the socket is down the message is dropped, by design for Phase 2. */
  send(envelope: Envelope): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(encodeEnvelope(envelope));
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
      this.setState('connected');
      this.startHeartbeat();
    };

    socket.onmessage = event => {
      if (typeof event.data !== 'string') return;
      const envelope = tryParseEnvelope(event.data);
      // Malformed frames are dropped rather than thrown — a bad frame must not kill the link.
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

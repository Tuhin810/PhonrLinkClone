"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkServer = void 0;
const node_events_1 = require("node:events");
const ws_1 = require("ws");
const shared_1 = require("@phonelink/shared");
/**
 * Accepts the phone's WebSocket connection on the LAN.
 *
 * The Mac is the server because it has the stable address; the phone dials in. Only one phone
 * is expected, so a new connection replaces the old one rather than being rejected — that is
 * what happens when the phone reconnects after a network blip and the stale socket has not
 * timed out yet.
 */
class LinkServer extends node_events_1.EventEmitter {
    keystore;
    port;
    server = null;
    socket = null;
    pingTimer = null;
    missedPongs = 0;
    state = 'waiting';
    /**
     * While paused we drop the current phone and refuse new connections. Without this a
     * "disconnect" would last about a second: the phone's own backoff would reconnect
     * immediately, which is not what the button means.
     */
    paused = false;
    /** Regenerated whenever the QR is shown, so a token cannot be reused indefinitely. */
    pairingToken = (0, shared_1.generatePairingToken)();
    /** Shared key for the current session; null until the handshake completes. */
    sharedKey = null;
    peerName = null;
    constructor(keystore, port = shared_1.DEFAULT_PORT) {
        super();
        this.keystore = keystore;
        this.port = port;
    }
    /** Token embedded in the pairing QR. */
    getPairingToken() {
        return this.pairingToken;
    }
    /** Invalidates the current token; called after a successful pairing. */
    rotatePairingToken() {
        this.pairingToken = (0, shared_1.generatePairingToken)();
    }
    getPeerName() {
        return this.peerName;
    }
    start() {
        // 0.0.0.0 so the phone can reach us; this is a LAN-only app by design.
        this.server = new ws_1.WebSocketServer({ port: this.port, host: '0.0.0.0' });
        this.server.on('connection', socket => this.adopt(socket));
    }
    stop() {
        this.clearHeartbeat();
        this.socket?.close();
        this.socket = null;
        this.server?.close();
        this.server = null;
        this.setState('waiting');
    }
    getState() {
        return this.state;
    }
    send(envelope) {
        if (!this.socket || this.socket.readyState !== ws_1.WebSocket.OPEN)
            return false;
        // Only the handshake travels in clear; everything after it is sealed.
        this.socket.send(this.sharedKey ? (0, shared_1.sealEnvelope)(envelope, this.sharedKey) : (0, shared_1.encodeEnvelope)(envelope));
        return true;
    }
    /** Drops the phone and refuses reconnections until [resume] is called. */
    pause() {
        if (this.paused)
            return;
        this.paused = true;
        this.clearHeartbeat();
        this.socket?.close();
        this.socket = null;
        this.setState('paused');
    }
    resume() {
        if (!this.paused)
            return;
        this.paused = false;
        this.setState('waiting');
    }
    isPaused() {
        return this.paused;
    }
    adopt(socket) {
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
            const envelope = (0, shared_1.tryOpenEnvelope)(text, this.sharedKey);
            // A frame that fails decryption or validation is dropped, never thrown.
            if (!envelope)
                return;
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
            if (this.socket !== socket)
                return; // superseded by a newer connection
            this.socket = null;
            this.sharedKey = null;
            this.peerName = null;
            this.clearHeartbeat();
            if (!this.paused)
                this.setState('waiting');
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
    handleHandshake(socket, text) {
        const envelope = (0, shared_1.tryParseEnvelope)(text);
        if (!envelope || envelope.type !== 'pair_request') {
            this.reject(socket, 'expected a pairing request');
            return;
        }
        if (envelope.protocolVersion !== shared_1.PROTOCOL_VERSION) {
            this.reject(socket, `protocol mismatch (phone v${envelope.protocolVersion}, Mac v${shared_1.PROTOCOL_VERSION})`);
            return;
        }
        const alreadyTrusted = this.keystore.isTrusted(envelope.pubKey);
        const provedToken = typeof envelope.pairingProof === 'string' &&
            (0, shared_1.verifyPairingProof)(this.pairingToken, envelope.pubKey, envelope.pairingProof);
        if (!alreadyTrusted && !provedToken) {
            this.reject(socket, `unpaired device "${envelope.deviceName}" — scan the QR to pair`);
            return;
        }
        const keyPair = this.keystore.getKeyPair();
        this.sharedKey = (0, shared_1.deriveSharedKey)(keyPair.secretKey, envelope.pubKey);
        this.peerName = envelope.deviceName;
        // Reply in clear: the phone cannot derive the shared key until it has our public key.
        socket.send((0, shared_1.encodeEnvelope)({
            type: 'pair_confirm',
            deviceName: 'Mac',
            pubKey: keyPair.publicKey,
            protocolVersion: shared_1.PROTOCOL_VERSION,
        }));
        if (!alreadyTrusted) {
            this.keystore.trust(envelope.pubKey, envelope.deviceName);
            // A token is single-use; a leaked screenshot should not pair a second device later.
            this.rotatePairingToken();
            this.emit('paired', envelope.deviceName);
        }
        this.setState('connected');
    }
    reject(socket, reason) {
        this.emit('rejected', reason);
        socket.close();
    }
    startHeartbeat() {
        this.clearHeartbeat();
        this.pingTimer = setInterval(() => {
            if (this.missedPongs >= shared_1.MISSED_PINGS_BEFORE_DISCONNECT) {
                // Socket looks open but the peer is gone — a sleeping phone or a dropped wifi link.
                this.socket?.terminate();
                return;
            }
            this.missedPongs += 1;
            this.send({ type: 'ping' });
        }, shared_1.PING_INTERVAL_MS);
    }
    clearHeartbeat() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }
    setState(state) {
        if (this.state === state)
            return;
        this.state = state;
        this.emit('state', state);
    }
}
exports.LinkServer = LinkServer;

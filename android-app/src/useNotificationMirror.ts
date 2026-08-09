import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { KeyPair, NotificationMessage } from '@phonelink/shared';
import { getIdentity } from './crypto/identity';
import { clearPairedMac, getPairedMac, setPairedMac, type PairedMac } from './crypto/pairing';
import { FEED_LIMIT, MAC_PORT, macWsUrl } from './config';
import { MacDiscovery, type DiscoveredMac } from './discovery/discovery';
import { getManualHost, setManualHost } from './discovery/settings';
import { useClipboardSync } from './clipboard/useClipboardSync';
import { useFileTransfer, type TransferProgress } from './files/useFileTransfer';
import { useScreenMirror } from './mirror/useScreenMirror';
import { CallState } from './native/callState';
import { NotificationBridge } from './native/notificationBridge';
import { ConnectionState, LinkClient } from './net/linkClient';

export type TargetSource = 'manual' | 'discovered' | 'none';

/** Shown on the Mac as the paired device's name. */
function androidDeviceName(): string {
  const constants = Platform.constants as { Model?: string; Brand?: string } | undefined;
  const model = constants?.Model?.trim();
  const brand = constants?.Brand?.trim();
  if (model && brand) return `${brand} ${model}`;
  return model ?? 'Android phone';
}

export interface MirrorState {
  connection: ConnectionState;
  accessGranted: boolean;
  feed: NotificationMessage[];
  sentCount: number;
  droppedCount: number;
  /** Host we are currently pointed at, or null when nothing has been found or set. */
  target: string | null;
  targetSource: TargetSource;
  deviceName: string | null;
  manualHost: string | null;
  /** The Mac we are paired with, if any. Null means pairing is still required. */
  paired: PairedMac | null;
  /** False when READ_PHONE_STATE was declined; call alerts silently do nothing without it. */
  callPermission: boolean;
  /** Why the last remote decline/silence failed, if it did. */
  callActionError: string | null;
  mirroring: boolean;
  inputAvailable: boolean;
  mirrorReason: string | null;
  transfer: TransferProgress | null;
  transferError: string | null;
  clipboardEnabled: boolean;
  /** Set when a clipboard payload was skipped for being oversized. */
  clipboardSkipped: boolean;
  /** Recent discovery events, shown in the UI because JS logs only reach Metro. */
  discoveryLog: string[];
  /** True once discovery has run long enough that silence means the network blocks it. */
  discoveryLikelyBlocked: boolean;
}

/**
 * Owns the whole pipeline: permission state, foreground service, the native notification
 * stream, mDNS discovery, and the socket to the Mac.
 */
export function useNotificationMirror() {
  const [connection, setConnection] = useState<ConnectionState>('disconnected');
  const [accessGranted, setAccessGranted] = useState(false);
  const [feed, setFeed] = useState<NotificationMessage[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [droppedCount, setDroppedCount] = useState(0);
  const [discovered, setDiscovered] = useState<DiscoveredMac | null>(null);
  const [manualHost, setManualHostState] = useState<string | null>(null);
  const [discoveryLog, setDiscoveryLog] = useState<string[]>([]);
  const [discoveryLikelyBlocked, setDiscoveryLikelyBlocked] = useState(false);
  const [identity, setIdentity] = useState<KeyPair | null>(null);
  const [paired, setPaired] = useState<PairedMac | null>(null);
  /** Held only for the duration of a first pairing; never persisted. */
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [callPermission, setCallPermission] = useState(false);
  const [callActionError, setCallActionError] = useState<string | null>(null);
  const [clipboardEnabled, setClipboardEnabled] = useState(true);
  const [clipboardSkipped, setClipboardSkipped] = useState(false);

  const clientRef = useRef<LinkClient | null>(null);

  // A manual address is an explicit instruction, so it outranks anything discovery finds.
  const target = manualHost ?? discovered?.host ?? null;
  const targetSource: TargetSource = manualHost
    ? 'manual'
    : discovered
      ? 'discovered'
      : 'none';

  const refreshAccess = useCallback(async () => {
    const granted = await NotificationBridge.isNotificationAccessGranted();
    setAccessGranted(granted);
    return granted;
  }, []);

  // Notification access is granted outside the app, so re-check whenever we regain focus.
  useEffect(() => {
    refreshAccess();
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') refreshAccess();
    });
    return () => subscription.remove();
  }, [refreshAccess]);

  // Call alerts need phone state; contacts is optional and only turns numbers into names.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      PermissionsAndroid.PERMISSIONS.ANSWER_PHONE_CALLS,
    ])
      .then(() => CallState.hasPhonePermission())
      .then(setCallPermission)
      .catch(() => undefined);
  }, []);

  // Call state forwarding is independent of the socket; envelopes are dropped while offline.
  useEffect(() => {
    CallState.startListening();
    const incoming = CallState.onIncoming(({ callerNumber, callerName }) => {
      clientRef.current?.send({
        type: 'call_incoming',
        callerNumber,
        ...(callerName ? { callerName } : {}),
        timestamp: Date.now(),
      });
    });
    const ended = CallState.onEnded(() => {
      clientRef.current?.send({ type: 'call_ended', timestamp: Date.now() });
    });
    return () => {
      incoming.remove();
      ended.remove();
      CallState.stopListening();
    };
  }, []);

  // Android 13+ needs this before our own foreground-service notification will show.
  useEffect(() => {
    if (Platform.OS !== 'android' || Platform.Version < 33) return;
    PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    ).catch(() => undefined);
  }, []);

  useEffect(() => {
    getManualHost().then(setManualHostState).catch(() => undefined);
    getIdentity().then(setIdentity).catch(() => undefined);
    getPairedMac().then(setPaired).catch(() => undefined);
  }, []);

  // Foreground service and the notification listener are independent of any Mac being found.
  useEffect(() => {
    NotificationBridge.startForegroundService().catch(() => undefined);
    NotificationBridge.startListening();

    const posted = NotificationBridge.onPosted(payload => {
      const envelope: NotificationMessage = { type: 'notification', ...payload };
      setFeed(current => [envelope, ...current].slice(0, FEED_LIMIT));
      if (clientRef.current?.send(envelope)) {
        setSentCount(n => n + 1);
      } else {
        // Expected while disconnected; surfaced in the UI so it is never a silent loss.
        setDroppedCount(n => n + 1);
      }
    });

    const removed = NotificationBridge.onRemoved(({ id }) => {
      clientRef.current?.send({ type: 'notification_dismiss', id });
      setFeed(current => current.filter(item => item.id !== id));
    });

    return () => {
      posted.remove();
      removed.remove();
      NotificationBridge.stopListening();
    };
  }, []);

  // Discovery runs only when no manual address is set — nothing to look for otherwise.
  useEffect(() => {
    if (manualHost) {
      setDiscovered(null);
      return;
    }
    const discovery = new MacDiscovery(setDiscovered, line =>
      setDiscoveryLog(current => [line, ...current].slice(0, 4)),
    );
    discovery.start();

    // Plenty of networks filter multicast (guest wifi, client isolation). After a couple of
    // scan cycles with nothing found, stop implying it is still coming and point at the
    // manual address instead. See docs/CONSTRAINTS.md #3.
    const blockedTimer = setTimeout(() => setDiscoveryLikelyBlocked(true), 25_000);

    return () => {
      clearTimeout(blockedTimer);
      setDiscoveryLikelyBlocked(false);
      discovery.stop();
    };
  }, [manualHost]);

  // The Mac re-sends pair_confirm on every connection, so `paired` gets a fresh object each
  // time. Depending on the object here would tear the socket down and redial on every
  // handshake — an endless connect/disconnect loop. Depend on stable primitives instead, and
  // read the current values through a ref.
  const pairedPubKey = paired?.pubKey ?? null;
  const identityPubKey = identity?.publicKey ?? null;
  const latest = useRef({ identity, paired, pendingToken, target });
  latest.current = { identity, paired, pendingToken, target };

  useEffect(() => {
    // Without an identity there is nothing to authenticate with, and without either a paired
    // Mac or a fresh token the Mac would reject us anyway — so do not even dial.
    const current = latest.current;
    if (!target || !current.identity || (!pairedPubKey && !pendingToken)) {
      setConnection('disconnected');
      return;
    }
    const client = new LinkClient({
      url: macWsUrl(target),
      identity: current.identity,
      deviceName: androidDeviceName(),
      macPubKey: pairedPubKey,
      pairingToken: pendingToken,
      onStateChange: setConnection,
      onEnvelope: envelope => {
        if (envelope.type === 'screen_control') {
          if (envelope.action === 'start') void mirrorRef.current.startMirror();
          else mirrorRef.current.stopMirror();
          return;
        }
        if (envelope.type.startsWith('input_')) {
          void mirrorRef.current.handleInput(envelope);
          return;
        }
        if (envelope.type === 'call_action') {
          // Failures are reported rather than swallowed: a decline that silently does nothing
          // is worse than one that says it could not.
          const request =
            envelope.action === 'decline'
              ? CallState.declineCall()
              : CallState.silenceRinger();
          request.catch((error: Error) => setCallActionError(error.message));
          return;
        }
        if (
          envelope.type === 'file_offer' ||
          envelope.type === 'file_chunk' ||
          envelope.type === 'file_complete'
        ) {
          void fileEnvelopeRef.current(envelope);
          return;
        }
        if (envelope.type !== 'clipboard_update') return;
        // Ignore anything we originated; the Mac tags what it sends.
        if (envelope.sourceDevice === 'phone') return;
        applyRemoteRef.current(envelope.content);
      },
      onPaired: (macPubKey, macName) => {
        // Re-pairing with the same Mac is the normal case on every reconnect. Only touch
        // state when something actually changed, so this cannot feed back into the effect.
        setPaired(previous =>
          previous && previous.pubKey === macPubKey && previous.host === target
            ? previous
            : (() => {
                const record: PairedMac = {
                  host: target,
                  port: MAC_PORT,
                  deviceName: macName,
                  pubKey: macPubKey,
                };
                setPairedMac(record).catch(() => undefined);
                return record;
              })(),
        );
        setPendingToken(current => (current === null ? current : null));
      },
    });
    clientRef.current = client;
    client.start();
    return () => {
      client.stop();
      clientRef.current = null;
      // A half-received file is worthless; do not leave temp files behind.
      abortTransfers();
    };
  }, [target, identityPubKey, pairedPubKey, pendingToken]);

  const sendViaClient = useCallback(
    (envelope: Parameters<LinkClient['send']>[0]) =>
      clientRef.current?.send(envelope) ?? false,
    [],
  );

  const {
    progress: transfer,
    error: transferError,
    sendFile,
    handleEnvelope: handleFileEnvelope,
    abortAll: abortTransfers,
  } = useFileTransfer({ send: sendViaClient });

  const fileEnvelopeRef = useRef(handleFileEnvelope);
  fileEnvelopeRef.current = handleFileEnvelope;

  const {
    streaming: mirroring,
    inputAvailable,
    reason: mirrorReason,
    start: startMirror,
    stop: stopMirror,
    handleInput,
    openAccessibilitySettings,
  } = useScreenMirror({ send: sendViaClient });

  const mirrorRef = useRef({ startMirror, stopMirror, handleInput });
  mirrorRef.current = { startMirror, stopMirror, handleInput };

  const { applyRemote, sendCurrentClipboard } = useClipboardSync({
    enabled: clipboardEnabled,
    connected: connection === 'connected',
    send: sendViaClient,
    onSkippedTooLarge: useCallback(() => setClipboardSkipped(true), []),
  });

  // Inbound clipboard updates arrive on the socket, which is rebuilt on reconnects, so the
  // handler is kept in a ref the socket effect can read.
  const applyRemoteRef = useRef(applyRemote);
  applyRemoteRef.current = applyRemote;

  const openSettings = useCallback(async () => {
    await NotificationBridge.openNotificationAccessSettings();
  }, []);

  /** Called after scanning the Mac's QR: address plus the one-time pairing token. */
  const beginPairing = useCallback(async (host: string, token: string | null) => {
    await setManualHost(host);
    setManualHostState(host);
    setPendingToken(token);
  }, []);

  const unpair = useCallback(async () => {
    setPaired(null);
    setPendingToken(null);
    await clearPairedMac();
  }, []);

  const saveManualHost = useCallback(async (host: string | null) => {
    await setManualHost(host);
    setManualHostState(host && host.trim() ? host.trim() : null);
  }, []);

  return {
    state: {
      connection,
      accessGranted,
      feed,
      sentCount,
      droppedCount,
      target,
      targetSource,
      deviceName: discovered?.deviceName ?? null,
      manualHost,
      paired,
      callPermission,
      callActionError,
      mirroring,
      inputAvailable,
      mirrorReason,
      transfer,
      transferError,
      clipboardEnabled,
      clipboardSkipped,
      discoveryLog,
      discoveryLikelyBlocked,
    } as MirrorState,
    openSettings,
    refreshAccess,
    saveManualHost,
    beginPairing,
    unpair,
    setClipboardEnabled,
    sendCurrentClipboard,
    sendFile,
    openAccessibilitySettings,
  };
}

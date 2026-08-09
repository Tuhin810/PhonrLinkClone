import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { NotificationMessage } from '@phonelink/shared';
import { FEED_LIMIT, macWsUrl } from './config';
import { MacDiscovery, type DiscoveredMac } from './discovery/discovery';
import { getManualHost, setManualHost } from './discovery/settings';
import { NotificationBridge } from './native/notificationBridge';
import { ConnectionState, LinkClient } from './net/linkClient';

export type TargetSource = 'manual' | 'discovered' | 'none';

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

  // Android 13+ needs this before our own foreground-service notification will show.
  useEffect(() => {
    if (Platform.OS !== 'android' || Platform.Version < 33) return;
    PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    ).catch(() => undefined);
  }, []);

  useEffect(() => {
    getManualHost().then(setManualHostState).catch(() => undefined);
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

  // One socket per target; changing the address tears the old one down.
  useEffect(() => {
    if (!target) {
      setConnection('disconnected');
      return;
    }
    const client = new LinkClient({
      url: macWsUrl(target),
      onStateChange: setConnection,
    });
    clientRef.current = client;
    client.start();
    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [target]);

  const openSettings = useCallback(async () => {
    await NotificationBridge.openNotificationAccessSettings();
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
      discoveryLog,
      discoveryLikelyBlocked,
    } as MirrorState,
    openSettings,
    refreshAccess,
    saveManualHost,
  };
}

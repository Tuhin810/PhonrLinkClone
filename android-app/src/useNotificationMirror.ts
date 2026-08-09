import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { NotificationMessage } from '@phonelink/shared';
import { FEED_LIMIT, MAC_WS_URL } from './config';
import { NotificationBridge } from './native/notificationBridge';
import { ConnectionState, LinkClient } from './net/linkClient';

export interface MirrorState {
  connection: ConnectionState;
  accessGranted: boolean;
  feed: NotificationMessage[];
  sentCount: number;
  droppedCount: number;
}

/**
 * Owns the whole Phase 2 pipeline: permission state, foreground service, the native
 * notification stream, and the socket to the Mac.
 */
export function useNotificationMirror() {
  const [connection, setConnection] = useState<ConnectionState>('disconnected');
  const [accessGranted, setAccessGranted] = useState(false);
  const [feed, setFeed] = useState<NotificationMessage[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [droppedCount, setDroppedCount] = useState(0);
  const clientRef = useRef<LinkClient | null>(null);

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
    const client = new LinkClient({
      url: MAC_WS_URL,
      onStateChange: setConnection,
    });
    clientRef.current = client;
    client.start();

    NotificationBridge.startForegroundService().catch(() => undefined);
    NotificationBridge.startListening();

    const posted = NotificationBridge.onPosted(payload => {
      const envelope: NotificationMessage = { type: 'notification', ...payload };
      setFeed(current => [envelope, ...current].slice(0, FEED_LIMIT));
      if (client.send(envelope)) {
        setSentCount(n => n + 1);
      } else {
        // Expected while disconnected; surfaced in the UI so it is never a silent loss.
        setDroppedCount(n => n + 1);
      }
    });

    const removed = NotificationBridge.onRemoved(({ id }) => {
      client.send({ type: 'notification_dismiss', id });
      setFeed(current => current.filter(item => item.id !== id));
    });

    return () => {
      posted.remove();
      removed.remove();
      NotificationBridge.stopListening();
      client.stop();
      clientRef.current = null;
    };
  }, []);

  const openSettings = useCallback(async () => {
    await NotificationBridge.openNotificationAccessSettings();
  }, []);

  return {
    state: { connection, accessGranted, feed, sentCount, droppedCount } as MirrorState,
    openSettings,
    refreshAccess,
  };
}

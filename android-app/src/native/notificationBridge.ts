import { NativeEventEmitter, NativeModules } from 'react-native';
import type { NotificationMessage } from '@phonelink/shared';

interface NotificationBridgeNative {
  isNotificationAccessGranted(): Promise<boolean>;
  openNotificationAccessSettings(): Promise<void>;
  startForegroundService(): Promise<void>;
  stopForegroundService(): Promise<void>;
  startListening(): void;
  stopListening(): void;
}

const native = NativeModules.NotificationBridge as NotificationBridgeNative | undefined;

if (!native) {
  // A missing module means the native side did not register — almost always a stale build.
  console.warn('NotificationBridge native module unavailable; rebuild the Android app.');
}

const EVENT_POSTED = 'phonelink:notificationPosted';
const EVENT_REMOVED = 'phonelink:notificationRemoved';

const emitter = new NativeEventEmitter(NativeModules.NotificationBridge);

/** Payload shape emitted by the native module, minus the protocol `type` discriminator. */
type PostedPayload = Omit<NotificationMessage, 'type'>;

export const NotificationBridge = {
  isNotificationAccessGranted(): Promise<boolean> {
    return native?.isNotificationAccessGranted() ?? Promise.resolve(false);
  },

  openNotificationAccessSettings(): Promise<void> {
    return native?.openNotificationAccessSettings() ?? Promise.resolve();
  },

  startForegroundService(): Promise<void> {
    return native?.startForegroundService() ?? Promise.resolve();
  },

  stopForegroundService(): Promise<void> {
    return native?.stopForegroundService() ?? Promise.resolve();
  },

  startListening(): void {
    native?.startListening();
  },

  stopListening(): void {
    native?.stopListening();
  },

  onPosted(handler: (payload: PostedPayload) => void) {
    return emitter.addListener(EVENT_POSTED, handler);
  },

  onRemoved(handler: (payload: { id: string }) => void) {
    return emitter.addListener(EVENT_REMOVED, handler);
  },
};

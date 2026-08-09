import { NativeEventEmitter, NativeModules } from 'react-native';

interface CallStateNative {
  startListening(): void;
  stopListening(): void;
  hasPhonePermission(): Promise<boolean>;
}

const native = NativeModules.CallState as CallStateNative | undefined;
const emitter = new NativeEventEmitter(NativeModules.CallState);

export const CallState = {
  startListening: () => native?.startListening(),
  stopListening: () => native?.stopListening(),
  hasPhonePermission: (): Promise<boolean> =>
    native?.hasPhonePermission() ?? Promise.resolve(false),
  onIncoming(handler: (payload: { callerNumber: string; callerName?: string }) => void) {
    return emitter.addListener('phonelink:callIncoming', handler);
  },
  onEnded(handler: () => void) {
    return emitter.addListener('phonelink:callEnded', handler);
  },
};

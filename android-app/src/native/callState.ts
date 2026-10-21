import { NativeEventEmitter, NativeModules } from 'react-native';

interface CallStateNative {
  startListening(): void;
  stopListening(): void;
  hasPhonePermission(): Promise<boolean>;
  answerCall(): Promise<boolean>;
  declineCall(): Promise<boolean>;
  silenceRinger(): Promise<string>;
  openDndSettings(): Promise<void>;
}

const native = NativeModules.CallState as CallStateNative | undefined;
const emitter = new NativeEventEmitter(NativeModules.CallState);

export const CallState = {
  startListening: () => native?.startListening(),
  stopListening: () => native?.stopListening(),
  hasPhonePermission: (): Promise<boolean> =>
    native?.hasPhonePermission() ?? Promise.resolve(false),
  answerCall: (): Promise<boolean> =>
    native?.answerCall() ?? Promise.reject(new Error('CallState unavailable')),
  declineCall: (): Promise<boolean> =>
    native?.declineCall() ?? Promise.reject(new Error('CallState unavailable')),
  silenceRinger: (): Promise<string> =>
    native?.silenceRinger() ?? Promise.reject(new Error('CallState unavailable')),
  openDndSettings: (): Promise<void> => native?.openDndSettings() ?? Promise.resolve(),
  onIncoming(handler: (payload: { callerNumber: string; callerName?: string }) => void) {
    return emitter.addListener('phonelink:callIncoming', handler);
  },
  onEnded(handler: () => void) {
    return emitter.addListener('phonelink:callEnded', handler);
  },
};

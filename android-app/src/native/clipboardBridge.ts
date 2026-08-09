import { NativeEventEmitter, NativeModules } from 'react-native';

interface ClipboardNative {
  startListening(): void;
  stopListening(): void;
  getText(): Promise<string | null>;
  consumeSharedText(): Promise<string | null>;
  setText(text: string): Promise<void>;
}

const native = NativeModules.ClipboardBridge as ClipboardNative | undefined;
const emitter = new NativeEventEmitter(NativeModules.ClipboardBridge);

const EVENT_CHANGED = 'phonelink:clipboardChanged';

export const ClipboardBridge = {
  startListening(): void {
    native?.startListening();
  },
  stopListening(): void {
    native?.stopListening();
  },
  getText(): Promise<string | null> {
    return native?.getText() ?? Promise.resolve(null);
  },
  /** Text handed to us via the Android share sheet, returned once. */
  consumeSharedText(): Promise<string | null> {
    return native?.consumeSharedText() ?? Promise.resolve(null);
  },
  setText(text: string): Promise<void> {
    return native?.setText(text) ?? Promise.resolve();
  },
  onChanged(handler: (payload: { text: string }) => void) {
    return emitter.addListener(EVENT_CHANGED, handler);
  },
};

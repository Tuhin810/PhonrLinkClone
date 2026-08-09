import { NativeEventEmitter, NativeModules } from 'react-native';

interface ScreenCaptureNative {
  startCapture(): Promise<boolean>;
  stopCapture(): void;
  isInputAvailable(): Promise<boolean>;
  openAccessibilitySettings(): Promise<void>;
  tap(x: number, y: number): Promise<boolean>;
  swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number): Promise<boolean>;
  globalAction(name: string): Promise<boolean>;
  getScreenSize(): Promise<{ width: number; height: number }>;
}

const native = NativeModules.ScreenCapture as ScreenCaptureNative | undefined;
const emitter = new NativeEventEmitter(NativeModules.ScreenCapture);

export const ScreenCapture = {
  startCapture: () => native?.startCapture() ?? Promise.resolve(false),
  stopCapture: () => native?.stopCapture(),
  isInputAvailable: () => native?.isInputAvailable() ?? Promise.resolve(false),
  openAccessibilitySettings: () => native?.openAccessibilitySettings() ?? Promise.resolve(),
  tap: (x: number, y: number) => native?.tap(x, y) ?? Promise.resolve(false),
  swipe: (x1: number, y1: number, x2: number, y2: number, durationMs: number) =>
    native?.swipe(x1, y1, x2, y2, durationMs) ?? Promise.resolve(false),
  globalAction: (name: string) => native?.globalAction(name) ?? Promise.resolve(false),
  getScreenSize: () =>
    native?.getScreenSize() ?? Promise.resolve({ width: 0, height: 0 }),
  onFrame(handler: (payload: { data: string; width: number; height: number }) => void) {
    return emitter.addListener('phonelink:screenFrame', handler);
  },
  onState(
    handler: (payload: {
      streaming: boolean;
      reason?: string;
      inputAvailable: boolean;
    }) => void,
  ) {
    return emitter.addListener('phonelink:screenState', handler);
  },
};

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Envelope } from '@phonelink/shared';
import { ScreenCapture } from '../native/screenCapture';

interface Options {
  send(envelope: Envelope): boolean;
}

/**
 * Screen mirroring and remote input on the phone.
 *
 * Frames are dropped rather than queued when the link is busy: a stale frame is worthless, and
 * buffering them would turn a slow link into a growing backlog of obsolete images.
 */
export function useScreenMirror({ send }: Options) {
  const [streaming, setStreaming] = useState(false);
  const [inputAvailable, setInputAvailable] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const screenSize = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    ScreenCapture.getScreenSize()
      .then(size => {
        screenSize.current = size;
      })
      .catch(() => undefined);
    ScreenCapture.isInputAvailable().then(setInputAvailable).catch(() => undefined);
  }, []);

  useEffect(() => {
    const frames = ScreenCapture.onFrame(({ data, width, height }) => {
      send({ type: 'screen_frame', data, width, height, timestamp: Date.now() });
    });
    const states = ScreenCapture.onState(payload => {
      setStreaming(payload.streaming);
      setInputAvailable(payload.inputAvailable);
      setReason(payload.reason ?? null);
      send({
        type: 'screen_state',
        streaming: payload.streaming,
        ...(payload.reason ? { reason: payload.reason } : {}),
        inputAvailable: payload.inputAvailable,
      });
    });
    return () => {
      frames.remove();
      states.remove();
    };
  }, [send]);

  const start = useCallback(async () => {
    // Refresh the size: rotation or a display change would invalidate the cached value.
    ScreenCapture.getScreenSize()
      .then(size => {
        screenSize.current = size;
      })
      .catch(() => undefined);
    try {
      await ScreenCapture.startCapture();
    } catch (e) {
      const message = (e as Error).message;
      setReason(message);
      send({ type: 'screen_state', streaming: false, reason: message, inputAvailable });
    }
  }, [send, inputAvailable]);

  const stop = useCallback(() => {
    ScreenCapture.stopCapture();
  }, []);

  /** Applies a remote input envelope, scaling normalised coordinates to real pixels. */
  const handleInput = useCallback(async (envelope: Envelope) => {
    // The cached size can be missing if the first lookup failed or the app restarted; fetch it
    // rather than silently dropping the input, which is impossible to diagnose from the Mac.
    if (!screenSize.current.width || !screenSize.current.height) {
      try {
        screenSize.current = await ScreenCapture.getScreenSize();
      } catch {
        return;
      }
    }
    const { width, height } = screenSize.current;
    ScreenCapture.log(`handleInput ${envelope.type} screen=${width}x${height}`);
    if (!width || !height) return;

    switch (envelope.type) {
      case 'input_tap':
        await ScreenCapture.tap(envelope.x * width, envelope.y * height);
        return;
      case 'input_swipe':
        await ScreenCapture.swipe(
          envelope.x1 * width,
          envelope.y1 * height,
          envelope.x2 * width,
          envelope.y2 * height,
          envelope.durationMs,
        );
        return;
      case 'input_key':
        await ScreenCapture.globalAction(envelope.key);
        return;
      default:
        return;
    }
  }, []);

  const openAccessibilitySettings = useCallback(async () => {
    await ScreenCapture.openAccessibilitySettings();
  }, []);

  return {
    streaming,
    inputAvailable,
    reason,
    start,
    stop,
    handleInput,
    openAccessibilitySettings,
  };
}

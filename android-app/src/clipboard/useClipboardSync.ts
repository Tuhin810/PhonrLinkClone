import { useCallback, useEffect, useRef } from 'react';
import { CLIPBOARD_MAX_BYTES, type Envelope } from '@phonelink/shared';
import { ClipboardBridge } from '../native/clipboardBridge';

interface Options {
  enabled: boolean;
  send(envelope: Envelope): boolean;
  onSkippedTooLarge?(): void;
}

/**
 * Bidirectional clipboard sync for the phone.
 *
 * Echo-loop guard: whatever we last wrote or last sent is remembered, and a change matching it
 * is ignored. `sourceDevice` on the envelope is a second line of defence — comparing content is
 * what actually stops a copy bouncing between the devices forever.
 */
export function useClipboardSync({ enabled, send, onSkippedTooLarge }: Options) {
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    ClipboardBridge.startListening();
    const subscription = ClipboardBridge.onChanged(({ text }) => {
      if (!text || text === lastSeen.current) return;
      if (text.length > CLIPBOARD_MAX_BYTES) {
        onSkippedTooLarge?.();
        return;
      }
      lastSeen.current = text;
      send({
        type: 'clipboard_update',
        content: text,
        sourceDevice: 'phone',
        timestamp: Date.now(),
      });
    });

    return () => {
      subscription.remove();
      ClipboardBridge.stopListening();
    };
  }, [enabled, send, onSkippedTooLarge]);

  /** Applies an update received from the Mac. */
  const applyRemote = useCallback((content: string) => {
    if (content === lastSeen.current) return;
    lastSeen.current = content;
    ClipboardBridge.setText(content).catch(() => undefined);
  }, []);

  return { applyRemote };
}

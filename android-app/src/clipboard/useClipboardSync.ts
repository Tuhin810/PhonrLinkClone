import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { CLIPBOARD_MAX_BYTES, type Envelope } from '@phonelink/shared';
import { ClipboardBridge } from '../native/clipboardBridge';

interface Options {
  enabled: boolean;
  /** Whether the link is up. Sends attempted while down are queued, not dropped. */
  connected: boolean;
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
export function useClipboardSync({
  enabled,
  connected,
  send,
  onSkippedTooLarge,
}: Options) {
  const lastSeen = useRef<string | null>(null);
  /**
   * Text that could not be sent yet. Sharing into the app typically *starts* it, so the socket
   * is still connecting when the text arrives — dropping it would make the share silently do
   * nothing, which is the worst possible behaviour for an explicit user action.
   */
  const pending = useRef<string[]>([]);

  const sendOrQueue = useCallback(
    (content: string) => {
      lastSeen.current = content;
      const envelope: Envelope = {
        type: 'clipboard_update',
        content,
        sourceDevice: 'phone',
        timestamp: Date.now(),
      };
      if (!send(envelope)) pending.current.push(content);
    },
    [send],
  );

  // Flush anything queued once the link comes up.
  useEffect(() => {
    if (!connected || pending.current.length === 0) return;
    const queued = pending.current;
    pending.current = [];
    for (const content of queued) {
      send({
        type: 'clipboard_update',
        content,
        sourceDevice: 'phone',
        timestamp: Date.now(),
      });
    }
  }, [connected, send]);

  useEffect(() => {
    if (!enabled) return;

    ClipboardBridge.startListening();
    const subscription = ClipboardBridge.onChanged(({ text }) => {
      if (!text || text === lastSeen.current) return;
      if (text.length > CLIPBOARD_MAX_BYTES) {
        onSkippedTooLarge?.();
        return;
      }
      sendOrQueue(text);
    });

    return () => {
      subscription.remove();
      ClipboardBridge.stopListening();
    };
  }, [enabled, sendOrQueue, onSkippedTooLarge]);

  /**
   * Sends whatever is on the clipboard right now. Works because the app is in the foreground
   * when the user taps the button — the same restriction that blocks passive background reads.
   */
  const sendCurrentClipboard = useCallback(async () => {
    const text = await ClipboardBridge.getText();
    if (!text) return false;
    if (text.length > CLIPBOARD_MAX_BYTES) {
      onSkippedTooLarge?.();
      return false;
    }
    sendOrQueue(text);
    return true;
  }, [sendOrQueue, onSkippedTooLarge]);

  // Text shared into the app from anywhere else. This is the dependable phone -> Mac route.
  useEffect(() => {
    const forwardShared = () => {
      ClipboardBridge.consumeSharedText()
        .then(text => {
          if (text) sendOrQueue(text);
        })
        .catch(() => undefined);
    };
    forwardShared();
    const subscription = AppState.addEventListener('change', next => {
      // A share into an already-running app resumes it rather than starting it fresh.
      if (next === 'active') forwardShared();
    });
    return () => subscription.remove();
  }, [sendOrQueue]);

  /** Applies an update received from the Mac. */
  const applyRemote = useCallback((content: string) => {
    if (content === lastSeen.current) return;
    lastSeen.current = content;
    ClipboardBridge.setText(content).catch(() => undefined);
  }, []);

  return { applyRemote, sendCurrentClipboard };
}

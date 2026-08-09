import { EventEmitter } from 'node:events';
import { clipboard } from 'electron';
import { CLIPBOARD_MAX_BYTES } from '@phonelink/shared';

const POLL_INTERVAL_MS = 1_000;

export interface ClipboardSyncEvents {
  /** Local clipboard changed and should be sent to the phone. */
  changed: [string];
  skipped: [number];
}

/**
 * Watches and writes the macOS clipboard.
 *
 * Electron exposes no clipboard-change event, so this polls. The echo guard is content-based:
 * whatever we last wrote or last emitted is remembered and ignored when it comes back around.
 * Tagging envelopes with `sourceDevice` alone would not be enough, because the poll cannot tell
 * who put the text there.
 */
export class ClipboardSync extends EventEmitter<ClipboardSyncEvents> {
  private timer: NodeJS.Timeout | null = null;
  private lastSeen: string | null = null;
  private enabled = true;

  start(): void {
    if (this.timer) return;
    // Seed without emitting: whatever is on the clipboard at startup is not a change.
    this.lastSeen = clipboard.readText();
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // Re-seed so text copied while disabled is not replayed on re-enable.
    if (enabled) this.lastSeen = clipboard.readText();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Applies an update received from the phone. */
  applyRemote(content: string): void {
    if (!this.enabled || content === this.lastSeen) return;
    this.lastSeen = content;
    clipboard.writeText(content);
  }

  private poll(): void {
    if (!this.enabled) return;
    const text = clipboard.readText();
    if (!text || text === this.lastSeen) return;
    if (text.length > CLIPBOARD_MAX_BYTES) {
      this.emit('skipped', text.length);
      // Remembered anyway, so an oversized clip is reported once rather than every second.
      this.lastSeen = text;
      return;
    }
    this.lastSeen = text;
    this.emit('changed', text);
  }
}

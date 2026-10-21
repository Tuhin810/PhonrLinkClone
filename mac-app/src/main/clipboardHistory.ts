import { randomUUID } from 'node:crypto';

export type ClipSource = 'mac' | 'phone';

export interface ClipEntry {
  id: string;
  text: string;
  source: ClipSource;
  timestamp: number;
}

/** Enough to scroll back through a session without the popup state growing unbounded. */
export const HISTORY_LIMIT = 50;

/**
 * Recent clipboard texts from both devices, newest first.
 *
 * Memory only, by design: clipboards routinely hold passwords and one-time codes, so the
 * history never touches disk and is gone when the app quits.
 */
export class ClipboardHistory {
  private entries: ClipEntry[] = [];

  /** Records a clip. Copying the same text again moves it to the top instead of duplicating. */
  add(text: string, source: ClipSource, timestamp = Date.now()): ClipEntry {
    this.entries = this.entries.filter(entry => entry.text !== text);
    const entry: ClipEntry = { id: randomUUID(), text, source, timestamp };
    this.entries.unshift(entry);
    this.entries.length = Math.min(this.entries.length, HISTORY_LIMIT);
    return entry;
  }

  get(id: string): ClipEntry | undefined {
    return this.entries.find(entry => entry.id === id);
  }

  remove(id: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter(entry => entry.id !== id);
    return this.entries.length !== before;
  }

  clear(): void {
    this.entries = [];
  }

  list(): ClipEntry[] {
    return [...this.entries];
  }
}

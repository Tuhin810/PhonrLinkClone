import { Notification, nativeImage } from 'electron';
import type { NotificationMessage } from '@phonelink/shared';

/**
 * Posts mirrored notifications to macOS Notification Center and keeps handles around so a
 * dismissal on the phone can clear the banner here.
 *
 * macOS only keeps banners on screen briefly, so `close()` often lands on an already-gone
 * banner. That is harmless — the point is that a notification dismissed on the phone while
 * still visible on the Mac disappears rather than lingering.
 */
export class NotificationPresenter {
  private readonly active = new Map<string, Notification>();

  /** Bounded so a burst of notifications cannot grow this map without limit. */
  private static readonly MAX_TRACKED = 50;

  show(message: NotificationMessage): void {
    if (!Notification.isSupported()) {
      console.warn('[notification] not supported on this system');
      return;
    }

    const notification = new Notification({
      title: message.title || message.app,
      body: message.text,
      icon: message.icon
        ? nativeImage.createFromDataURL(`data:image/png;base64,${message.icon}`)
        : undefined,
      silent: false,
    });

    notification.on('close', () => this.active.delete(message.id));
    notification.on('show', () => console.log(`[notification shown] ${message.app}: ${message.title}`));
    notification.on('failed', (_event, error) =>
      console.error(`[notification failed] ${message.app}: ${error}`),
    );
    notification.show();

    this.active.set(message.id, notification);
    this.trim();
  }

  dismiss(id: string): void {
    const notification = this.active.get(id);
    if (!notification) return;
    notification.close();
    this.active.delete(id);
  }

  dismissAll(): void {
    for (const notification of this.active.values()) notification.close();
    this.active.clear();
  }

  private trim(): void {
    while (this.active.size > NotificationPresenter.MAX_TRACKED) {
      const oldest = this.active.keys().next();
      if (oldest.done) return;
      this.active.delete(oldest.value);
    }
  }
}

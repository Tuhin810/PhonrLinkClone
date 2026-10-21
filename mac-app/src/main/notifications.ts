import { Notification, nativeImage } from 'electron';
import type { CallIncomingMessage, NotificationMessage } from '@phonelink/shared';

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
  /** At most one call banner at a time. */
  private call: Notification | null = null;

  /** Bounded so a burst of notifications cannot grow this map without limit. */
  private static readonly MAX_TRACKED = 50;

  show(message: NotificationMessage): void {
    if (!Notification.isSupported()) {
      console.warn('[notification] not supported on this system');
      return;
    }

    // An update to a notification we already showed replaces its banner instead of stacking.
    this.dismiss(message.id);

    const notification = new Notification({
      title: message.title || message.app,
      body: message.text,
      icon: message.icon
        ? nativeImage.createFromDataURL(`data:image/png;base64,${message.icon}`)
        : undefined,
      silent: false,
    });

    // A replaced banner's close event can land after its successor is tracked; only forget
    // the handle if it is still this banner's.
    notification.on('close', () => {
      if (this.active.get(message.id) === notification) this.active.delete(message.id);
    });
    notification.on('show', () => console.log(`[notification shown] ${message.app}: ${message.title}`));
    notification.on('failed', (_event, error) =>
      console.error(`[notification failed] ${message.app}: ${error}`),
    );
    notification.show();

    this.active.set(message.id, notification);
    this.trim();
  }

  /**
   * Incoming call heads-up. Deliberately says where to answer: the app cannot answer or route
   * audio, and a notification that looks actionable but is not would be worse than none.
   * See docs/CONSTRAINTS.md #1.
   */
  showCall(
    message: CallIncomingMessage,
    onAction?: (action: 'answer' | 'decline') => void,
  ): void {
    if (!Notification.isSupported()) return;
    this.dismissCall();

    // OEMs that strip the number leave us with only a name, and vice versa. Build the text
    // from whatever actually arrived rather than printing empty separators.
    const number = message.callerNumber?.trim();
    const caller = message.callerName?.trim() || number || 'Unknown caller';
    // Answering here picks up on the phone; the audio can never reach the Mac (CONSTRAINTS #1).
    const hint = 'Answer here, then talk on your phone';
    const body = message.callerName?.trim() && number ? `${number}\n${hint}` : hint;

    const notification = new Notification({
      title: `Incoming call — ${caller}`,
      body,
      urgency: 'critical',
      timeoutType: 'never',
      silent: false,
      actions: [
        { type: 'button', text: 'Answer' },
        { type: 'button', text: 'Decline' },
      ],
    });
    notification.on('close', () => {
      if (this.call === notification) this.call = null;
    });
    notification.on('action', (_event, index) => onAction?.(index === 0 ? 'answer' : 'decline'));
    notification.show();
    this.call = notification;
  }

  /** Clears the call banner when the call ends, is answered, or the link drops. */
  dismissCall(): void {
    this.call?.close();
    this.call = null;
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
    this.dismissCall();
  }

  private trim(): void {
    while (this.active.size > NotificationPresenter.MAX_TRACKED) {
      const oldest = this.active.keys().next();
      if (oldest.done) return;
      this.active.delete(oldest.value);
    }
  }
}

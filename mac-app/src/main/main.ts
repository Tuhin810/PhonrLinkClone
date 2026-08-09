import path from 'node:path';
import { BrowserWindow, Tray, app, ipcMain, screen } from 'electron';
import { DEFAULT_PORT, Envelope, assertNever } from '@phonelink/shared';
import { LinkServer, type ConnectionState } from './linkServer';
import { NotificationPresenter } from './notifications';
import { createTrayIcon } from './trayIcon';
import { localAddresses } from './network';

const POPUP_WIDTH = 360;
const POPUP_HEIGHT = 460;
/** How many notifications the popup feed keeps. */
const FEED_LIMIT = 50;

interface FeedItem {
  id: string;
  app: string;
  title: string;
  text: string;
  timestamp: number;
  icon?: string;
}

let tray: Tray | null = null;
let popup: BrowserWindow | null = null;
const presenter = new NotificationPresenter();
const server = new LinkServer(DEFAULT_PORT);
let feed: FeedItem[] = [];
let connection: ConnectionState = 'waiting';

// A menu bar utility has no business in the Dock.
app.dock?.hide();

function createPopup(): BrowserWindow {
  const window = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    // Closing the popup should hide it, not tear down the app.
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.loadFile(path.join(__dirname, '../renderer/index.html'));
  // Clicking elsewhere dismisses the popup, the way menu bar apps behave.
  window.on('blur', () => window.hide());
  return window;
}

function positionPopup(window: BrowserWindow, trayBounds: Electron.Rectangle): void {
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - POPUP_WIDTH / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);
  // Keep the popup on screen when the tray icon sits near the right edge.
  const maxX = display.workArea.x + display.workArea.width - POPUP_WIDTH - 8;
  window.setPosition(Math.max(display.workArea.x + 8, Math.min(x, maxX)), y, false);
}

function togglePopup(): void {
  if (!popup || !tray) return;
  if (popup.isVisible()) {
    popup.hide();
    return;
  }
  positionPopup(popup, tray.getBounds());
  popup.show();
  popup.focus();
  pushState();
}

function pushState(): void {
  popup?.webContents.send('state', {
    connection,
    port: DEFAULT_PORT,
    addresses: localAddresses(),
    feed,
  });
}

function updateTrayTitle(): void {
  tray?.setToolTip(
    connection === 'connected'
      ? 'PhoneLink Clone — phone connected'
      : 'PhoneLink Clone — waiting for phone',
  );
}

function handleEnvelope(envelope: Envelope): void {
  console.log(`[envelope] ${envelope.type}`);
  switch (envelope.type) {
    case 'notification': {
      presenter.show(envelope);
      const { type: _type, ...item } = envelope;
      feed = [item, ...feed].slice(0, FEED_LIMIT);
      pushState();
      return;
    }
    case 'notification_dismiss':
      presenter.dismiss(envelope.id);
      feed = feed.filter(item => item.id !== envelope.id);
      pushState();
      return;

    // Declared in the protocol but owned by later phases. Ignored, not an error.
    case 'call_incoming':
    case 'call_ended':
    case 'clipboard_update':
    case 'file_offer':
    case 'file_chunk':
    case 'file_complete':
    case 'pair_request':
    case 'pair_confirm':
      return;

    // ping/pong never reach here; LinkServer answers them.
    case 'ping':
    case 'pong':
      return;

    default:
      assertNever(envelope);
  }
}

app.whenReady().then(() => {
  tray = new Tray(createTrayIcon());
  updateTrayTitle();
  tray.on('click', togglePopup);
  tray.on('right-click', togglePopup);

  popup = createPopup();

  server.on('state', next => {
    console.log(`[link] ${next}`);
    connection = next;
    updateTrayTitle();
    // A phone that walked away leaves no stale banners behind.
    if (next === 'waiting') presenter.dismissAll();
    pushState();
  });
  server.on('envelope', handleEnvelope);
  server.start();

  ipcMain.handle('request-state', () => {
    pushState();
  });
  ipcMain.handle('quit', () => app.quit());
});

// Menu bar apps stay alive with no windows open.
app.on('window-all-closed', () => undefined);

app.on('before-quit', () => {
  server.stop();
  presenter.dismissAll();
});

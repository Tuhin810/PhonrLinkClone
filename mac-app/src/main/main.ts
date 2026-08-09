import path from 'node:path';
import { BrowserWindow, Tray, app, ipcMain, screen } from 'electron';
import os from 'node:os';
import QRCode from 'qrcode';
import {
  DEFAULT_PORT,
  Envelope,
  PAIRING_PAYLOAD_VERSION,
  type PairingPayload,
  assertNever,
} from '@phonelink/shared';
import { Advertiser } from './advertiser';
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
const advertiser = new Advertiser(DEFAULT_PORT);
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
  void pushState();
}

/**
 * QR payload for the phone to scan, so the address never has to be typed. Regenerated on each
 * push because the LAN address changes with the network.
 *
 * Cached by address: encoding is cheap but this runs on every notification.
 */
let qrCache: { host: string; dataUrl: string } | null = null;

async function pairingQrDataUrl(host: string): Promise<string | null> {
  if (qrCache?.host === host) return qrCache.dataUrl;
  const payload: PairingPayload = {
    app: 'phonelink',
    v: PAIRING_PAYLOAD_VERSION,
    host,
    port: DEFAULT_PORT,
    device: os.hostname().replace(/\.local$/, ''),
  };
  try {
    const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
      margin: 1,
      width: 220,
    });
    qrCache = { host, dataUrl };
    return dataUrl;
  } catch {
    // A failed QR render must not take the popup down; the address text is still shown.
    return null;
  }
}

async function pushState(): Promise<void> {
  const addresses = localAddresses();
  const primary = addresses[0] ?? null;
  popup?.webContents.send('state', {
    connection,
    port: DEFAULT_PORT,
    addresses,
    feed,
    qr: primary ? await pairingQrDataUrl(primary) : null,
  });
}

function updateTrayTitle(): void {
  const tooltip =
    connection === 'connected'
      ? 'PhoneLink Clone — phone connected'
      : connection === 'paused'
        ? 'PhoneLink Clone — disconnected (paused)'
        : 'PhoneLink Clone — waiting for phone';
  tray?.setToolTip(tooltip);
}

function handleEnvelope(envelope: Envelope): void {
  console.log(`[envelope] ${envelope.type}`);
  switch (envelope.type) {
    case 'notification': {
      presenter.show(envelope);
      const { type: _type, ...item } = envelope;
      feed = [item, ...feed].slice(0, FEED_LIMIT);
      void pushState();
      return;
    }
    case 'notification_dismiss':
      presenter.dismiss(envelope.id);
      feed = feed.filter(item => item.id !== envelope.id);
      void pushState();
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
    if (next !== 'connected') presenter.dismissAll();
    void pushState();
  });
  server.on('envelope', handleEnvelope);
  server.start();
  advertiser.start();

  ipcMain.handle('request-state', () => pushState());

  // `npm run dev` opens the popup immediately; otherwise it only appears on a tray click,
  // which makes the UI awkward to iterate on.
  if (process.argv.includes('--dev')) togglePopup();
  ipcMain.handle('quit', () => app.quit());

  ipcMain.handle('toggle-connection', () => {
    if (server.isPaused()) {
      server.resume();
    } else {
      server.pause();
    }
  });
});

// Menu bar apps stay alive with no windows open.
app.on('window-all-closed', () => undefined);

app.on('before-quit', () => {
  advertiser.stop();
  server.stop();
  presenter.dismissAll();
});

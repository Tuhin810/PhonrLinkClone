import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, Tray, app, clipboard, ipcMain, screen } from 'electron';
import os from 'node:os';
import QRCode from 'qrcode';
import {
  type Contact,
  DEFAULT_PORT,
  Envelope,
  PAIRING_PAYLOAD_VERSION,
  type PairingPayload,
  assertNever,
} from '@phonelink/shared';
import { Advertiser } from './advertiser';
import { ClipboardHistory } from './clipboardHistory';
import { ClipboardSync } from './clipboardSync';
import { FileTransfers, type TransferProgress } from './fileTransfer';
import { Keystore } from './keystore';
import { LinkServer, type ConnectionState } from './linkServer';
import { NotificationPresenter } from './notifications';
import { createTrayIcon } from './trayIcon';
import { localAddresses } from './network';

const POPUP_WIDTH = 372;
const POPUP_HEIGHT = 572;
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
// Keystore construction needs app paths, so it is created after 'ready'.
let keystore: Keystore;
let server: LinkServer;
const advertiser = new Advertiser(DEFAULT_PORT);
/** Last rejected connection attempt, shown in the popup instead of failing silently. */
let lastRejection: string | null = null;
const clipboardSync = new ClipboardSync();
/** The phone's address book, fetched once per connection for the contacts page. */
let contacts: Contact[] | null = null;
let contactsError: string | null = null;
let contactsLoading = false;
/** The latest call or text asked of the phone, shown as a status line on the contacts page. */
let phoneAction: {
  id: string;
  kind: 'call' | 'text';
  name: string;
  status: 'pending' | 'ok' | 'error';
  error?: string;
} | null = null;
/** Clips seen in either direction, for the popup's clipboard page. Memory only. */
const clipboardHistory = new ClipboardHistory();
/** Currently ringing call, shown as an in-app banner alongside the native notification. */
let activeCall: { callerName: string | null; callerNumber: string; answered?: boolean } | null =
  null;
const transfers = new FileTransfers();
let transferProgress: TransferProgress | null = null;
let transferMessage: string | null = null;
/** Whether transferMessage reports a success or a failure, so the UI can colour it. */
let transferStatus: 'ok' | 'error' | null = null;
let mirrorWindow: BrowserWindow | null = null;
const dumpIndex = process.argv.indexOf('--dump-frame');
let dumpFramePath: string | null =
  dumpIndex >= 0 ? (process.argv[dumpIndex + 1] ?? null) : null;
let feed: FeedItem[] = [];
let connection: ConnectionState = 'waiting';

// The app is named ILink, but Electron derives userData from the app name; pin the
// original folder so the keystore, and with it every existing pairing, survives the rename.
app.setPath('userData', path.join(app.getPath('appData'), '@phonelink/mac-app'));

// A menu bar utility has no business in the Dock.
app.dock?.hide();

function createPopup(): BrowserWindow {
  const window = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    show: false,
    frame: false,
    // Transparent so the renderer can draw its own large rounded panel; macOS frameless
    // corners are too tight. The native shadow follows the panel's painted shape.
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
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

/**
 * The phone-shaped mirror window. Kept separate from the tray popup: the popup hides on blur,
 * which would make a window you are trying to click through unusable.
 */
function openMirror(): void {
  if (mirrorWindow && !mirrorWindow.isDestroyed()) {
    mirrorWindow.show();
    mirrorWindow.focus();
    server.send({ type: 'screen_control', action: 'start' });
    return;
  }

  mirrorWindow = new BrowserWindow({
    width: 380,
    height: 860,
    title: 'Phone',
    // Frameless and transparent: the renderer draws the device frame as the window's shape.
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mirrorWindow.loadFile(path.join(__dirname, '../renderer/mirror.html'));
  mirrorWindow.on('closed', () => {
    mirrorWindow = null;
    // Closing the window must stop the capture; leaving the phone sharing would be alarming.
    server.send({ type: 'screen_control', action: 'stop' });
  });
  mirrorWindow.webContents.once('did-finish-load', () => {
    server.send({ type: 'screen_control', action: 'start' });
  });
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
let qrCache: { host: string; token: string; dataUrl: string } | null = null;

async function pairingQrDataUrl(host: string): Promise<string | null> {
  const token = server.getPairingToken();
  // Keyed by token as well: rotating the token must produce a new code.
  if (qrCache?.host === host && qrCache.token === token) return qrCache.dataUrl;
  const payload: PairingPayload = {
    app: 'phonelink',
    v: PAIRING_PAYLOAD_VERSION,
    host,
    port: DEFAULT_PORT,
    device: os.hostname().replace(/\.local$/, ''),
    pubKey: keystore.getKeyPair().publicKey,
    token,
  };
  try {
    const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
      margin: 1,
      width: 220,
    });
    qrCache = { host, token, dataUrl };
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
    peerName: server.getPeerName(),
    clipboardHistory: clipboardHistory.list(),
    contacts,
    contactsError,
    contactsLoading,
    phoneAction,
    transfer: transferProgress,
    transferMessage,
    transferStatus,
    activeCall,
    pairedCount: keystore.listTrusted().length,
    lastRejection,
  });
}

/** Answer, decline (or hang up) and silence, from the popup or from the call banner itself. */
function sendCallAction(action: 'answer' | 'decline' | 'silence'): void {
  server.send({ type: 'call_action', action });
  if (action === 'answer') {
    // The call is live on the phone now; the banner has done its job.
    presenter.dismissCall();
    if (activeCall) activeCall = { ...activeCall, answered: true };
  } else if (action === 'decline') {
    // Declining (or hanging up) ends the call; clear it rather than wait for the phone.
    presenter.dismissCall();
    activeCall = null;
  }
  void pushState();
}

function requestContacts(): void {
  contactsLoading = server.send({ type: 'contacts_request' });
  if (!contactsLoading) contactsError = 'Connect your phone to load contacts';
  void pushState();
}

/** Asks the phone to call or text; the phone's phone_action_result settles the status. */
function sendPhoneAction(
  kind: 'call' | 'text',
  name: string,
  build: (id: string) => Envelope,
): void {
  const id = randomUUID();
  const sent = server.send(build(id));
  phoneAction = sent
    ? { id, kind, name, status: 'pending' }
    : { id, kind, name, status: 'error', error: 'Your phone is not connected' };
  void pushState();
}

function updateTrayTitle(): void {
  const tooltip =
    connection === 'connected'
      ? 'ILink — phone connected'
      : connection === 'paused'
        ? 'ILink — disconnected (paused)'
        : 'ILink — waiting for phone';
  tray?.setToolTip(tooltip);
}

function handleEnvelope(envelope: Envelope): void {
  console.log(`[envelope] ${envelope.type}`);
  switch (envelope.type) {
    case 'notification': {
      presenter.show(envelope);
      const { type: _type, ...item } = envelope;
      // Same id means the phone updated a notification it already sent: replace, not add.
      feed = [item, ...feed.filter(existing => existing.id !== item.id)].slice(0, FEED_LIMIT);
      void pushState();
      return;
    }
    case 'notification_dismiss':
      presenter.dismiss(envelope.id);
      feed = feed.filter(item => item.id !== envelope.id);
      void pushState();
      return;

    case 'screen_frame':
      // Frames go straight to the mirror window; they never touch the popup's state.
      mirrorWindow?.webContents.send('screen-frame', envelope);
      // Dev helper: `--dump-frame <path>` writes the first frame out, so the capture pipeline
      // can be checked without eyeballing the window.
      if (dumpFramePath) {
        const target = dumpFramePath;
        dumpFramePath = null;
        fs.writeFile(target, Buffer.from(envelope.data, 'base64'), () =>
          console.log(`[mirror] wrote ${envelope.width}x${envelope.height} frame to ${target}`),
        );
      }
      return;

    case 'screen_state':
      mirrorWindow?.webContents.send('screen-state', envelope);
      if (!envelope.streaming && envelope.reason) {
        console.log(`[mirror] ${envelope.reason}`);
      }
      return;

    case 'contacts_list':
      console.log(`[contacts] ${envelope.contacts.length} from phone${envelope.error ? ` (${envelope.error})` : ''}`);
      contacts = envelope.contacts;
      contactsError = envelope.error ?? null;
      contactsLoading = false;
      void pushState();
      return;

    case 'phone_action_result':
      console.log(`[phone] action ${envelope.ok ? 'ok' : `failed: ${envelope.error}`}`);
      if (phoneAction?.id === envelope.id) {
        phoneAction = {
          ...phoneAction,
          status: envelope.ok ? 'ok' : 'error',
          error: envelope.error,
        };
        void pushState();
      }
      return;

    // Mac -> phone only; receiving one back would be the phone misbehaving.
    case 'contacts_request':
    case 'dial':
    case 'sms_send':
    case 'call_action':
    case 'screen_control':
    case 'input_tap':
    case 'input_swipe':
    case 'input_key':
    case 'input_text':
      return;

    case 'clipboard_update':
      // Our own text coming back would restart the loop; the phone tags what it sends.
      if (envelope.sourceDevice !== 'mac') {
        console.log(`[clipboard] from phone, ${envelope.content.length} chars`);
        if (clipboardSync.applyRemote(envelope.content)) {
          clipboardHistory.add(envelope.content, 'phone');
          void pushState();
        }
      }
      return;

    case 'call_incoming': {
      console.log(`[call] incoming from ${envelope.callerName ?? envelope.callerNumber}`);
      presenter.showCall(envelope, sendCallAction);
      activeCall = {
        callerName: envelope.callerName ?? null,
        callerNumber: envelope.callerNumber,
      };
      void pushState();
      return;
    }
    case 'call_ended':
      console.log('[call] ended');
      presenter.dismissCall();
      activeCall = null;
      void pushState();
      return;

    // Declared in the protocol but owned by later phases. Ignored, not an error.
    case 'file_offer':
    case 'file_chunk':
    case 'file_complete':
      void transfers.handle(envelope, e => server.send(e));
      return;

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
  keystore = new Keystore();
  server = new LinkServer(keystore, DEFAULT_PORT);

  tray = new Tray(createTrayIcon());
  updateTrayTitle();
  tray.on('click', togglePopup);
  tray.on('right-click', togglePopup);

  popup = createPopup();

  server.on('state', next => {
    console.log(`[link] ${next}`);
    connection = next;
    updateTrayTitle();
    // Fetch the address book as soon as the phone is here, so the contacts page opens ready.
    if (next === 'connected' && !contacts && !contactsLoading) requestContacts();
    // A phone that walked away leaves no stale banners behind — including a ringing call.
    if (next !== 'connected') {
      presenter.dismissAll();
      activeCall = null;
      // Half-received files are worthless; do not leave temp files behind either.
      void transfers.abortAll();
    }
    void pushState();
  });
  server.on('envelope', handleEnvelope);

  server.on('paired', deviceName => {
    console.log(`[pair] trusted new device: ${deviceName}`);
    lastRejection = null;
    void pushState();
  });

  server.on('rejected', reason => {
    console.warn(`[pair] rejected: ${reason}`);
    lastRejection = reason;
    void pushState();
  });
  server.start();
  advertiser.start();

  clipboardSync.on('changed', content => {
    console.log(`[clipboard] local change, ${content.length} chars -> phone`);
    clipboardHistory.add(content, 'mac');
    void pushState();
    server.send({
      type: 'clipboard_update',
      content,
      sourceDevice: 'mac',
      timestamp: Date.now(),
    });
  });
  clipboardSync.on('skipped', bytes =>
    console.warn(`[clipboard] skipped ${bytes} bytes: over the size cap`),
  );
  clipboardSync.start();

  transfers.on('progress', progress => {
    transferProgress = progress;
    // A new transfer replaces whatever the last one reported.
    if (progress) {
      transferMessage = null;
      transferStatus = null;
    }
    void pushState();
  });
  transfers.on('received', target => {
    console.log(`[file] saved ${target}`);
    transferMessage = `Saved ${path.basename(target)} to Downloads/PhoneLinkClone`;
    transferStatus = 'ok';
    void pushState();
  });
  transfers.on('sent', fileName => {
    console.log(`[file] sent ${fileName}`);
    transferMessage = `${fileName} is on your phone, in Downloads`;
    transferStatus = 'ok';
    void pushState();
  });
  transfers.on('error', message => {
    console.warn(`[file] ${message}`);
    transferMessage = message;
    transferStatus = 'error';
    void pushState();
  });

  ipcMain.handle('request-state', () => pushState());

  // `npm run dev` opens the popup immediately; otherwise it only appears on a tray click,
  // which makes the UI awkward to iterate on.
  if (process.argv.includes('--dev')) togglePopup();

  // Dev helper: `electron . --mirror` opens the phone window as soon as one connects.
  if (process.argv.includes('--mirror')) {
    const openWhenReady = () => {
      if (server.getState() !== 'connected') return;
      server.off('state', openWhenReady);
      openMirror();
    };
    server.on('state', openWhenReady);
    openWhenReady();
  }

  // Dev helper: `electron . --input-test` fires a home key then a tap once connected, so the
  // remote-input path can be checked without clicking the mirror window by hand.
  const inputTestIndex = process.argv.indexOf('--input-test');
  if (inputTestIndex >= 0) {
    const x = Number(process.argv[inputTestIndex + 1] ?? '0.5');
    const y = Number(process.argv[inputTestIndex + 2] ?? '0.5');
    const runTest = () => {
      if (server.getState() !== 'connected') return;
      server.off('state', runTest);
      setTimeout(() => {
        console.log(`[input-test] tapping ${x}, ${y}`);
        server.send({ type: 'input_tap', x, y });
      }, 1500);
    };
    server.on('state', runTest);
    runTest();
  }

  // Dev helper: `electron . --send-file <path>` sends a file as soon as a phone connects,
  // so the transfer path can be exercised without performing a drag gesture by hand.
  const sendFileIndex = process.argv.indexOf('--send-file');
  const devFilePath = sendFileIndex >= 0 ? process.argv[sendFileIndex + 1] : undefined;
  if (devFilePath) {
    const trySend = () => {
      if (server.getState() !== 'connected') return;
      server.off('state', trySend);
      void transfers.send(
        devFilePath,
        envelope => server.send(envelope),
        () => server.isDrained(),
      );
    };
    server.on('state', trySend);
    trySend();
  }
  ipcMain.handle('quit', () => app.quit());

  ipcMain.handle('open-mirror', () => openMirror());

  ipcMain.handle('input', (_event, envelope: unknown) => {
    // Validated on the phone as well; this is just a shape check before sending.
    if (typeof envelope !== 'object' || envelope === null) return;
    const type = (envelope as { type?: unknown }).type;
    if (typeof type !== 'string' || !type.startsWith('input_')) return;
    server.send(envelope as Envelope);
  });

  ipcMain.handle('send-files', async (_event, filePaths: unknown) => {
    if (!Array.isArray(filePaths)) return;
    for (const filePath of filePaths) {
      if (typeof filePath !== 'string') continue;
      await transfers.send(
        filePath,
        envelope => server.send(envelope),
        () => server.isDrained(),
      );
    }
  });

  ipcMain.handle('call-action', (_event, action: unknown) => {
    if (action !== 'answer' && action !== 'decline' && action !== 'silence') return;
    sendCallAction(action);
  });

  ipcMain.handle('contacts-refresh', () => requestContacts());
  ipcMain.handle('phone-call', (_event, number: unknown, name: unknown) => {
    if (typeof number !== 'string' || !number) return;
    sendPhoneAction('call', String(name ?? number), id => ({ type: 'dial', id, number }));
  });
  ipcMain.handle('phone-text', (_event, number: unknown, body: unknown, name: unknown) => {
    if (typeof number !== 'string' || !number || typeof body !== 'string' || !body.trim()) return;
    sendPhoneAction('text', String(name ?? number), id => ({ type: 'sms_send', id, number, body }));
  });

  // Copying a past clip puts it back on the clipboard; the next poll then syncs it to the
  // phone and moves it to the top of the history, exactly like a fresh copy.
  ipcMain.handle('clip-copy', (_event, id: unknown) => {
    const entry = typeof id === 'string' ? clipboardHistory.get(id) : undefined;
    if (entry) clipboard.writeText(entry.text);
  });
  ipcMain.handle('clip-delete', (_event, id: unknown) => {
    if (typeof id === 'string' && clipboardHistory.remove(id)) void pushState();
  });
  ipcMain.handle('clip-clear', () => {
    clipboardHistory.clear();
    void pushState();
  });

  ipcMain.handle('unpair-all', () => {
    keystore.unpairAll();
    server.rotatePairingToken();
    // Drop whoever is connected: their key is no longer trusted.
    server.pause();
    server.resume();
    qrCache = null;
    void pushState();
  });

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
  clipboardSync.stop();
  advertiser.stop();
  server.stop();
  presenter.dismissAll();
});

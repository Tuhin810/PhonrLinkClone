const chip = document.getElementById('chip');
const qrPlate = document.querySelector('.qr-plate');
const menuToggle = document.getElementById('menu-toggle');
const status = document.getElementById('status');
const stateLabel = document.getElementById('state-label');
const address = document.getElementById('address');
const feed = document.getElementById('feed');
const count = document.getElementById('count');
const qr = document.getElementById('qr');
const empty = document.getElementById('empty');

const toggle = document.getElementById('toggle');
const rejection = document.getElementById('rejection');
const clipboardButton = document.getElementById('clipboard');
const drop = document.getElementById('drop');
const fileInput = document.getElementById('file-input');
const transfer = document.getElementById('transfer');
const transferText = document.getElementById('transfer-text');
const transferPct = document.getElementById('transfer-pct');
const transferBar = document.getElementById('transfer-bar');
const call = document.getElementById('call');
const callCaller = document.getElementById('call-caller');
const menu = document.getElementById('menu');

const STATUS_TEXT = {
  connected: 'Phone connected',
  waiting: 'Waiting for phone…',
  paused: 'Disconnected',
};
const STATE_LABEL = {
  connected: 'Connected',
  waiting: 'Not connected',
  paused: 'Paused',
};

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function render(state) {
  const connected = state.connection === 'connected';
  const paused = state.connection === 'paused';
  // The body class picks which sections show: pairing, paused card, or feed + dock.
  document.body.className = `state-${state.connection}`;
  chip.className = `chip ${state.connection}`;
  menuToggle.textContent = paused ? 'Allow connections' : 'Pause connections';
  status.textContent =
    connected && state.peerName
      ? state.peerName
      : (STATUS_TEXT[state.connection] ?? 'Waiting for phone…');
  stateLabel.textContent = STATE_LABEL[state.connection] ?? 'Waiting';

  toggle.dataset.tip = paused ? 'Allow connections' : 'Disconnect';
  toggle.classList.toggle('paused', paused);
  clipboardButton.dataset.tip = `Clipboard sync: ${state.clipboardEnabled ? 'on' : 'off'}`;
  clipboardButton.classList.toggle('on', state.clipboardEnabled);

  if (state.activeCall) {
    const { callerName, callerNumber } = state.activeCall;
    // Show whichever pieces we actually have; no empty separators.
    callCaller.textContent =
      [callerName, callerNumber].filter(Boolean).join(' · ') || 'Unknown caller';
    call.classList.add('show');
  } else {
    call.classList.remove('show');
  }

  // A rejected pairing attempt is worth showing: silence looks like a bug.
  rejection.textContent = state.lastRejection ?? '';
  rejection.classList.toggle('show', Boolean(state.lastRejection));

  address.textContent = state.addresses.length
    ? `${state.addresses.join(', ')} : ${state.port}`
    : `port ${state.port} — no LAN address`;

  // The QR is setup help, shown by the waiting state; without a LAN address there is none.
  if (state.qr) qr.src = state.qr;
  qrPlate.classList.toggle('hidden', !state.qr);

  // A running transfer shows a progress bar; a finished one leaves its message briefly.
  if (state.transfer) {
    const { direction, fileName, done, total } = state.transfer;
    const verb = direction === 'sending' ? 'Sending' : 'Receiving';
    const pct = total ? Math.round((done / total) * 100) : 0;
    transferText.textContent = `${verb} ${fileName}`;
    transferPct.textContent = `${pct}%`;
    transferBar.style.width = `${pct}%`;
    transfer.classList.add('show');
  } else if (state.transferMessage) {
    transferText.textContent = state.transferMessage;
    transferPct.textContent = '';
    transferBar.style.width = '100%';
    transfer.classList.add('show');
  } else {
    transfer.classList.remove('show');
  }

  feed.replaceChildren();
  empty.style.display = state.feed.length ? 'none' : 'block';
  count.textContent = state.feed.length ? String(state.feed.length) : '';

  for (const item of state.feed) {
    const li = document.createElement('li');

    const icon = document.createElement('div');
    icon.className = 'feed-icon';
    if (item.icon) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${item.icon}`;
      icon.append(img);
    } else {
      icon.textContent = (item.app || '?').trim().charAt(0).toUpperCase();
    }

    const body = document.createElement('div');
    body.className = 'body';

    const titleRow = document.createElement('div');
    titleRow.className = 'title-row';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.title || '(no title)';

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = item.timestamp ? timeFormat.format(item.timestamp) : '';

    titleRow.append(title, time);

    const app = document.createElement('div');
    app.className = 'app';
    app.textContent = item.app;

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = item.text;

    body.append(titleRow, text, app);
    li.append(icon, body);
    feed.append(li);
  }
}

window.phonelink.onState(render);
window.phonelink.requestState();
document
  .getElementById('call-decline')
  .addEventListener('click', () => window.phonelink.callAction('decline'));
document
  .getElementById('call-silence')
  .addEventListener('click', () => window.phonelink.callAction('silence'));
document
  .getElementById('mirror')
  .addEventListener('click', () => window.phonelink.openMirror());
clipboardButton.addEventListener('click', () => window.phonelink.toggleClipboard());

document.getElementById('send-file').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const files = [...(fileInput.files ?? [])];
  if (files.length) window.phonelink.sendFiles(files);
  // Reset so picking the same file again still fires 'change'.
  fileInput.value = '';
});

// The whole popup accepts drops; without preventDefault the page would navigate to the file.
for (const eventName of ['dragenter', 'dragover']) {
  document.addEventListener(eventName, event => {
    event.preventDefault();
    drop.classList.add('over');
  });
}
document.addEventListener('dragleave', event => {
  // dragleave also fires when crossing between child elements; only clear on leaving the window.
  if (!event.relatedTarget) drop.classList.remove('over');
});
document.addEventListener('drop', event => {
  event.preventDefault();
  drop.classList.remove('over');
  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length) window.phonelink.sendFiles(files);
});

document.getElementById('more').addEventListener('click', event => {
  event.stopPropagation();
  menu.classList.toggle('show');
});
document.addEventListener('click', event => {
  if (!menu.contains(event.target)) menu.classList.remove('show');
});

toggle.addEventListener('click', () => window.phonelink.toggleConnection());
document.getElementById('resume').addEventListener('click', () => window.phonelink.toggleConnection());
menuToggle.addEventListener('click', () => {
  menu.classList.remove('show');
  window.phonelink.toggleConnection();
});
document.getElementById('unpair').addEventListener('click', () => {
  menu.classList.remove('show');
  window.phonelink.unpairAll();
});
document.getElementById('quit').addEventListener('click', () => window.phonelink.quit());

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

const rejection = document.getElementById('rejection');
const drop = document.getElementById('drop');
const fileInput = document.getElementById('file-input');
const transfer = document.getElementById('transfer');
const transferText = document.getElementById('transfer-text');
const transferPct = document.getElementById('transfer-pct');
const transferBar = document.getElementById('transfer-bar');
const call = document.getElementById('call');
const callCaller = document.getElementById('call-caller');
const menu = document.getElementById('menu');
const pages = document.getElementById('pages');
const homeTab = document.getElementById('home-tab');
const filesTab = document.getElementById('files-tab');
const clipsTab = document.getElementById('clips-tab');
const contactsTab = document.getElementById('contacts-tab');
const contactsList = document.getElementById('contacts');
const contactsCount = document.getElementById('contacts-count');
const contactsEmpty = document.getElementById('contacts-empty');
const contactsEmptyTitle = document.getElementById('contacts-empty-title');
const contactsEmptyText = document.getElementById('contacts-empty-text');
const contactsSearch = document.getElementById('contacts-search');
const phoneActionLine = document.getElementById('phone-action');
const clipsList = document.getElementById('clips');
const clipsEmpty = document.getElementById('clips-empty');
const clipsClear = document.getElementById('clips-clear');
const dropzone = document.getElementById('dropzone');
const filesProgress = document.getElementById('files-progress');
const filesBar = document.getElementById('files-bar');
const filesStatus = document.getElementById('files-status');

/** Pages only exist while connected; until then drops fall back to the full overlay. */
let isConnected = false;

function showPage(page) {
  pages.classList.toggle('files', page === 'files');
  pages.classList.toggle('clips', page === 'clips');
  pages.classList.toggle('contacts', page === 'contacts');
  homeTab.classList.toggle('active', page === 'home');
  filesTab.classList.toggle('active', page === 'files');
  clipsTab.classList.toggle('active', page === 'clips');
  contactsTab.classList.toggle('active', page === 'contacts');
}

const ICONS = {
  mac: '<svg viewBox="0 0 24 24"><rect x="4" y="4.5" width="16" height="11.5" rx="2.5" /><path d="M2 19.5h20" /></svg>',
  phone: '<svg viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="3" /><path d="M11 18h2" /></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="12" height="12" rx="3" /><path d="M15.5 8.5V6.5a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h2" /></svg>',
  call: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>',
  message: '<svg viewBox="0 0 24 24"><path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z" /></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>',
};

/** Text just copied from history, so its button can show a tick until the feedback fades. */
let copiedText = null;
let lastState = null;

function iconButton(className, icon, title, onClick) {
  const button = document.createElement('button');
  button.className = `clip-btn ${className}`;
  button.title = title;
  button.innerHTML = icon; // constant markup from ICONS, never clip content
  button.addEventListener('click', onClick);
  return button;
}

function renderClips(entries) {
  clipsList.replaceChildren();
  clipsEmpty.style.display = entries.length ? 'none' : 'block';
  clipsClear.classList.toggle('hidden', !entries.length);

  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = 'clip';

    const source = document.createElement('div');
    source.className = 'clip-src';
    source.title = entry.source === 'phone' ? 'Copied on your phone' : 'Copied on this Mac';
    source.innerHTML = ICONS[entry.source] ?? ICONS.mac;

    const body = document.createElement('div');
    body.className = 'clip-body';
    const text = document.createElement('p');
    text.className = 'clip-text';
    text.textContent = entry.text;
    const meta = document.createElement('p');
    meta.className = 'clip-meta';
    meta.textContent = `${entry.source === 'phone' ? 'From phone' : 'From Mac'} · ${timeFormat.format(
      entry.timestamp,
    )}`;
    body.append(text, meta);

    const copied = entry.text === copiedText;
    const actions = document.createElement('div');
    actions.className = 'clip-actions';
    const copy = iconButton(copied ? 'copy copied' : 'copy', copied ? ICONS.check : ICONS.copy, 'Copy', () => {
      copiedText = entry.text;
      window.phonelink.copyClip(entry.id);
      if (lastState) render(lastState);
      setTimeout(() => {
        if (copiedText !== entry.text) return;
        copiedText = null;
        if (lastState) render(lastState);
      }, 1400);
    });
    const remove = iconButton('del', ICONS.trash, 'Delete', () => window.phonelink.deleteClip(entry.id));
    actions.append(copy, remove);

    li.append(source, body, actions);
    clipsList.append(li);
  }
}

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

/** Android package names make poor labels; "com.openai.chatgpt" reads better as "Chatgpt". */
const PACKAGE_NOISE = new Set(['com', 'org', 'net', 'android', 'google', 'apps', 'app']);
function appLabel(packageName) {
  const parts = (packageName || '').split('.').filter(Boolean);
  const name = [...parts].reverse().find(part => !PACKAGE_NOISE.has(part)) ?? parts.at(-1);
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : packageName || '?';
}

/*
 * Contacts list. Rebuilt only when the contacts, the search or what is expanded change —
 * not on every state push — so a half-typed text message keeps its focus and caret.
 */
const contactsView = { open: null, compose: null, draft: '', signature: '' };

function contactsSignature(state) {
  const list = state.contacts ?? [];
  return [
    state.contactsLoading,
    state.contactsError,
    list.length,
    list[0]?.id,
    list.at(-1)?.id,
    contactsSearch.value,
    contactsView.open,
    contactsView.compose,
  ].join('|');
}

function matchesQuery(contact, query) {
  if (!query) return true;
  const digits = query.replace(/\D/g, '');
  return (
    contact.name.toLowerCase().includes(query) ||
    (digits.length >= 2 && contact.phones.some(p => p.number.replace(/\D/g, '').includes(digits)))
  );
}

function renderContacts(state, force = false) {
  const signature = contactsSignature(state);
  if (!force && signature === contactsView.signature) return;
  contactsView.signature = signature;

  const all = state.contacts ?? [];
  const query = contactsSearch.value.trim().toLowerCase();
  const shown = all.filter(contact => matchesQuery(contact, query));
  contactsCount.textContent = all.length ? String(all.length) : '';
  contactsList.replaceChildren();

  if (!shown.length) {
    contactsEmpty.style.display = 'block';
    if (state.contactsLoading) {
      contactsEmptyTitle.textContent = 'Loading contacts…';
      contactsEmptyText.textContent = 'Reading the address book on your phone.';
    } else if (state.contactsError) {
      contactsEmptyTitle.textContent = "Couldn't load contacts";
      contactsEmptyText.textContent = state.contactsError;
    } else if (all.length) {
      contactsEmptyTitle.textContent = 'No matches';
      contactsEmptyText.textContent = `Nobody called “${contactsSearch.value.trim()}”.`;
    } else {
      contactsEmptyTitle.textContent = 'No contacts';
      contactsEmptyText.textContent = 'No contacts with a phone number on your phone.';
    }
    return;
  }
  contactsEmpty.style.display = 'none';

  const starred = shown.filter(contact => contact.starred);
  const groups = starred.length && !query
    ? [['Favourites', starred], ['All contacts', shown.filter(contact => !contact.starred)]]
    : [[null, shown]];
  for (const [label, contacts] of groups) {
    if (label && contacts.length) {
      const heading = document.createElement('li');
      heading.className = 'contacts-label';
      heading.textContent = label;
      contactsList.append(heading);
    }
    for (const contact of contacts) contactsList.append(contactItem(contact));
  }
}

function roundButton(kind, title, onClick) {
  const button = document.createElement('button');
  button.className = `round-btn ${kind}`;
  button.title = title;
  button.innerHTML = kind === 'call' ? ICONS.call : ICONS.message; // constant markup
  button.addEventListener('click', event => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function startCompose(contact, number) {
  contactsView.open = contact.id;
  contactsView.compose = `${contact.id}|${number}`;
  contactsView.draft = '';
  if (lastState) renderContacts(lastState, true);
  contactsList.querySelector('textarea')?.focus({ preventScroll: true });
}

function contactItem(contact) {
  const li = document.createElement('li');
  const open = contactsView.open === contact.id;
  li.className = open ? 'contact open' : 'contact';
  const first = contact.phones[0];

  const row = document.createElement('div');
  row.className = 'contact-row';
  const avatar = document.createElement('div');
  avatar.className = 'avatar-sm';
  avatar.textContent = contact.name.trim().charAt(0).toUpperCase() || '#';
  const text = document.createElement('div');
  text.className = 'contact-text';
  const name = document.createElement('div');
  name.className = 'contact-name';
  name.textContent = contact.name;
  const number = document.createElement('div');
  number.className = 'contact-number';
  number.textContent =
    contact.phones.length > 1
      ? `${first.number} · +${contact.phones.length - 1} more`
      : [first.label, first.number].filter(Boolean).join(' · ');
  text.append(name, number);
  const actions = document.createElement('div');
  actions.className = 'contact-actions';
  actions.append(
    roundButton('call', `Call ${first.number}`, () => window.phonelink.call(first.number, contact.name)),
    roundButton('text', `Text ${first.number}`, () => startCompose(contact, first.number)),
  );
  row.append(avatar, text, actions);
  // Clicking the row shows every number, for contacts that have more than one.
  row.addEventListener('click', () => {
    contactsView.open = open ? null : contact.id;
    contactsView.compose = null;
    if (lastState) renderContacts(lastState, true);
  });
  li.append(row);

  if (open && contact.phones.length > 1) {
    const numbers = document.createElement('div');
    numbers.className = 'numbers';
    for (const phone of contact.phones) {
      const line = document.createElement('div');
      line.className = 'number-row';
      const label = document.createElement('div');
      label.className = 'contact-text';
      label.textContent = phone.number;
      if (phone.label) {
        const tag = document.createElement('span');
        tag.className = 'number-label';
        tag.textContent = `  ${phone.label}`;
        label.append(tag);
      }
      line.append(
        label,
        roundButton('call', `Call ${phone.number}`, () => window.phonelink.call(phone.number, contact.name)),
        roundButton('text', `Text ${phone.number}`, () => startCompose(contact, phone.number)),
      );
      numbers.append(line);
    }
    li.append(numbers);
  }

  const composeNumber = contactsView.compose?.startsWith(`${contact.id}|`)
    ? contactsView.compose.slice(contact.id.length + 1)
    : null;
  if (composeNumber) li.append(composer(contact, composeNumber));
  return li;
}

function composer(contact, number) {
  const box = document.createElement('div');
  box.className = 'composer';
  const to = document.createElement('p');
  to.className = 'composer-to';
  to.textContent = `Text ${contact.name} · ${number} — sent as SMS from your phone`;
  const input = document.createElement('textarea');
  input.placeholder = 'Message';
  input.value = contactsView.draft;
  input.addEventListener('input', () => {
    contactsView.draft = input.value;
  });
  const send = document.createElement('button');
  send.className = 'primary';
  send.textContent = 'Send';
  const cancel = document.createElement('button');
  cancel.className = 'text-btn';
  cancel.textContent = 'Cancel';
  const close = () => {
    contactsView.compose = null;
    contactsView.draft = '';
    if (lastState) renderContacts(lastState, true);
  };
  const submit = () => {
    const body = input.value.trim();
    if (!body) return;
    window.phonelink.text(number, body, contact.name);
    close();
  };
  send.addEventListener('click', submit);
  cancel.addEventListener('click', close);
  // Cmd/Ctrl+Enter sends; plain Enter stays a newline, as in Messages.
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
    if (event.key === 'Escape') close();
  });
  const actions = document.createElement('div');
  actions.className = 'composer-actions';
  actions.append(cancel, send);
  box.append(to, input, actions);
  return box;
}

const PHONE_ACTION_TEXT = {
  call: {
    pending: name => `Calling ${name} from your phone…`,
    ok: name => `Calling ${name} — talk on your phone; audio stays there`,
    error: name => `Couldn't call ${name}`,
  },
  text: {
    pending: name => `Sending text to ${name}…`,
    ok: name => `Text sent to ${name}`,
    error: name => `Couldn't text ${name}`,
  },
};

function renderPhoneAction(action) {
  phoneActionLine.className = 'phone-action';
  if (!action) return;
  const text = PHONE_ACTION_TEXT[action.kind][action.status](action.name);
  phoneActionLine.textContent = action.error ? `${text}: ${action.error}` : text;
  phoneActionLine.classList.add('show', action.status);
}

function render(state) {
  lastState = state;
  renderContacts(state);
  renderPhoneAction(state.phoneAction);
  const connected = state.connection === 'connected';
  // Losing the phone hides the pages; come back to notifications when it returns.
  if (!connected && isConnected) showPage('home');
  isConnected = connected;
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

  renderClips(state.clipboardHistory ?? []);

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
  // The files page carries the same progress inline, under its drop zone.
  filesProgress.classList.toggle('show', transfer.classList.contains('show'));
  filesStatus.textContent = [transferText.textContent, transferPct.textContent]
    .filter(Boolean)
    .join(' — ');
  filesBar.style.width = transferBar.style.width;

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
      icon.classList.add('has-img');
      icon.append(img);
    } else {
      icon.textContent = appLabel(item.app).charAt(0).toUpperCase();
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
    app.textContent = appLabel(item.app);

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
clipsTab.addEventListener('click', () => showPage('clips'));
clipsClear.addEventListener('click', () => window.phonelink.clearClips());
contactsTab.addEventListener('click', () => {
  showPage('contacts');
  // Retry a failed or empty load when the page is opened; a loaded list is reused as-is.
  if (lastState && !lastState.contactsLoading && !lastState.contacts?.length) {
    window.phonelink.refreshContacts();
  }
});
document.getElementById('contacts-refresh').addEventListener('click', () => window.phonelink.refreshContacts());
contactsSearch.addEventListener('input', () => {
  if (lastState) renderContacts(lastState);
});

homeTab.addEventListener('click', () => showPage('home'));
filesTab.addEventListener('click', () => showPage('files'));
document.getElementById('choose-file').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const files = [...(fileInput.files ?? [])];
  if (files.length) window.phonelink.sendFiles(files);
  // Reset so picking the same file again still fires 'change'.
  fileInput.value = '';
});

// The whole popup accepts drops; without preventDefault the page would navigate to the file.
// While connected, dragging in slides to the files page and lights up its drop zone.
for (const eventName of ['dragenter', 'dragover']) {
  document.addEventListener(eventName, event => {
    event.preventDefault();
    if (isConnected) {
      showPage('files');
      dropzone.classList.add('over');
    } else {
      drop.classList.add('over');
    }
  });
}
function clearDropHighlight() {
  drop.classList.remove('over');
  dropzone.classList.remove('over');
}
document.addEventListener('dragleave', event => {
  // dragleave also fires when crossing between child elements; only clear on leaving the window.
  if (!event.relatedTarget) clearDropHighlight();
});
document.addEventListener('drop', event => {
  event.preventDefault();
  clearDropHighlight();
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

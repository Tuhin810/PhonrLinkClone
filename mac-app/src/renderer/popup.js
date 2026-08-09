const dot = document.getElementById('dot');
const status = document.getElementById('status');
const address = document.getElementById('address');
const feed = document.getElementById('feed');
const pairing = document.getElementById('pairing');
const qr = document.getElementById('qr');
const empty = document.getElementById('empty');

const toggle = document.getElementById('toggle');

const STATUS_TEXT = {
  connected: 'Phone connected',
  waiting: 'Waiting for phone…',
  paused: 'Disconnected',
};

function render(state) {
  const connected = state.connection === 'connected';
  const paused = state.connection === 'paused';
  dot.className = `dot ${state.connection}`;
  status.textContent = STATUS_TEXT[state.connection] ?? 'Waiting for phone…';
  toggle.textContent = paused ? 'Allow connections' : 'Disconnect';
  address.textContent = state.addresses.length
    ? `${state.addresses.join(', ')} : ${state.port}`
    : `port ${state.port} — no LAN address`;

  // The QR is setup help: only useful while we are actually accepting a phone.
  if (!connected && !paused && state.qr) {
    qr.src = state.qr;
    pairing.classList.add('show');
  } else {
    pairing.classList.remove('show');
  }

  feed.replaceChildren();
  empty.style.display = state.feed.length ? 'none' : 'block';

  for (const item of state.feed) {
    const li = document.createElement('li');

    if (item.icon) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${item.icon}`;
      li.append(img);
    }

    const body = document.createElement('div');
    body.className = 'body';

    const app = document.createElement('div');
    app.className = 'app';
    app.textContent = item.app;

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.title || '(no title)';

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = item.text;

    body.append(app, title, text);
    li.append(body);
    feed.append(li);
  }
}

window.phonelink.onState(render);
window.phonelink.requestState();
toggle.addEventListener('click', () => window.phonelink.toggleConnection());
document.getElementById('quit').addEventListener('click', () => window.phonelink.quit());

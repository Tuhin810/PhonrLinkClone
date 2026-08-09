const dot = document.getElementById('dot');
const status = document.getElementById('status');
const address = document.getElementById('address');
const feed = document.getElementById('feed');
const empty = document.getElementById('empty');

function render(state) {
  const connected = state.connection === 'connected';
  dot.className = `dot ${connected ? 'connected' : 'waiting'}`;
  status.textContent = connected ? 'Phone connected' : 'Waiting for phone…';
  address.textContent = state.addresses.length
    ? `${state.addresses.join(', ')} : ${state.port}`
    : `port ${state.port} — no LAN address`;

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
document.getElementById('quit').addEventListener('click', () => window.phonelink.quit());

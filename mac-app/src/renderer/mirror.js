const canvas = document.getElementById('screen');
const context = canvas.getContext('2d');
const placeholder = document.getElementById('placeholder');
const placeholderText = document.getElementById('placeholder-text');
const status = document.getElementById('status');

/** Drag detection: a short, small movement is a tap; anything longer is a swipe. */
const TAP_MAX_MOVE = 0.02;
const TAP_MAX_MS = 250;

let frameSize = { width: 0, height: 0 };
let pressed = null;

function drawFrame({ data, width, height }) {
  const image = new Image();
  image.onload = () => {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      frameSize = { width, height };
    }
    context.drawImage(image, 0, 0, width, height);
    placeholder.classList.add('hidden');
  };
  image.src = `data:image/jpeg;base64,${data}`;
}

/**
 * Maps a mouse position to normalised frame coordinates.
 *
 * The canvas is letterboxed by `object-fit: contain`, so the drawn image rarely fills the
 * element — without accounting for the bars, every tap would land in the wrong place.
 */
function normalise(event) {
  const rect = canvas.getBoundingClientRect();
  if (!frameSize.width || !frameSize.height) return null;

  const scale = Math.min(rect.width / frameSize.width, rect.height / frameSize.height);
  const drawnWidth = frameSize.width * scale;
  const drawnHeight = frameSize.height * scale;
  const offsetX = (rect.width - drawnWidth) / 2;
  const offsetY = (rect.height - drawnHeight) / 2;

  const x = (event.clientX - rect.left - offsetX) / drawnWidth;
  const y = (event.clientY - rect.top - offsetY) / drawnHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null; // clicked the letterbox
  return { x, y };
}

canvas.addEventListener('mousedown', event => {
  const point = normalise(event);
  if (!point) return;
  pressed = { ...point, at: Date.now() };
});

canvas.addEventListener('mouseup', event => {
  if (!pressed) return;
  const start = pressed;
  pressed = null;
  const point = normalise(event);
  if (!point) return;

  const elapsed = Date.now() - start.at;
  const moved = Math.hypot(point.x - start.x, point.y - start.y);
  if (moved < TAP_MAX_MOVE && elapsed < TAP_MAX_MS) {
    window.phonelink.input({ type: 'input_tap', x: point.x, y: point.y });
  } else {
    window.phonelink.input({
      type: 'input_swipe',
      x1: start.x,
      y1: start.y,
      x2: point.x,
      y2: point.y,
      durationMs: Math.max(50, Math.min(elapsed, 2000)),
    });
  }
});

// Scrolling is a swipe in the opposite direction, the way a finger would move the content.
let wheelTimer = null;
let wheelDelta = 0;
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  wheelDelta += event.deltaY;
  if (wheelTimer) return;
  wheelTimer = setTimeout(() => {
    const distance = Math.max(-0.4, Math.min(0.4, wheelDelta / 800));
    wheelDelta = 0;
    wheelTimer = null;
    if (Math.abs(distance) < 0.02) return;
    window.phonelink.input({
      type: 'input_swipe',
      x1: 0.5,
      y1: 0.5 + distance / 2,
      x2: 0.5,
      y2: 0.5 - distance / 2,
      durationMs: 120,
    });
  }, 60);
});

for (const [id, key] of [
  ['back', 'back'],
  ['home', 'home'],
  ['recents', 'recents'],
]) {
  document
    .getElementById(id)
    .addEventListener('click', () => window.phonelink.input({ type: 'input_key', key }));
}

window.phonelink.onFrame(drawFrame);
window.phonelink.onScreenState(state => {
  if (state.streaming) {
    status.textContent = state.inputAvailable
      ? ''
      : 'View only — enable PhoneLink in the phone’s Accessibility settings to control it';
    return;
  }
  placeholder.classList.remove('hidden');
  placeholderText.textContent = state.reason ?? 'Screen sharing stopped';
  status.textContent = '';
});

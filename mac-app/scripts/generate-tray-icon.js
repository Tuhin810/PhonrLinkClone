/**
 * Rasterises the tray icon to base64 PNGs for src/main/trayIcon.ts.
 *
 * The source is the Bootstrap `phone-fill` glyph: a rounded rect from x=3..13 over the full
 * 16px height, with a 1px-radius circle knocked out near the bottom. Drawn analytically with
 * supersampling rather than pulled in via an SVG rasteriser, so the build needs no native
 * image dependency.
 *
 * Run: node scripts/generate-tray-icon.js
 */
const zlib = require('zlib');

const SUPERSAMPLE = 8;

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let r = 0xffffffff;
  for (const b of buf) r = table[(r ^ b) & 0xff] ^ (r >>> 8);
  return (r ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

/** Coverage of the glyph at a point, in the icon's own 16x16 coordinate space. */
function inGlyph(x, y) {
  const left = 3;
  const right = 13;
  const top = 0;
  const bottom = 16;
  const radius = 2;

  if (x < left || x > right || y < top || y > bottom) return false;

  // Rounded corners: outside the corner square, check distance to the corner's centre.
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) return false;

  // The home-button circle is a hole in the fill.
  if ((x - 8) ** 2 + (y - 13) ** 2 <= 1) return false;

  return true;
}

function renderPng(size) {
  const scale = size / 16;
  const raw = Buffer.alloc(size * (size * 4 + 1), 0);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / scale;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / scale;
          if (inGlyph(x, y)) hits++;
        }
      }
      const alpha = Math.round((hits / SUPERSAMPLE ** 2) * 255);
      const offset = py * (size * 4 + 1) + 1 + px * 4;
      // Black ink; macOS recolours template images itself.
      raw[offset] = 0;
      raw[offset + 1] = 0;
      raw[offset + 2] = 0;
      raw[offset + 3] = alpha;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32]) {
  console.log(`--- ${size}x${size} ---`);
  console.log(renderPng(size).toString('base64'));
}

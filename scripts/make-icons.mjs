// Draws the Personal HQ app icon as pixel art and writes PNGs to public/icons.
// No dependencies: a tiny PNG encoder on top of node:zlib.
// Run with: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const C = {
  bg: [42, 43, 46],
  hi: [91, 94, 100],
  lo: [11, 12, 13],
  title: [79, 122, 69],
  titleDot: [156, 201, 140],
  green: [156, 201, 140],
  amber: [224, 180, 92],
  purple: [182, 166, 232],
  shadow: [23, 24, 26],
};

/** The icon on a 32×32 grid: a bevelled window with a title bar and three panes. */
function design(x, y) {
  if (x < 0 || y < 0 || x > 31 || y > 31) return C.bg;
  if (y === 0 || x === 0) return C.hi;
  if (y === 31 || x === 31) return C.lo;
  if (y >= 3 && y <= 6 && x >= 3 && x <= 28) return x >= 24 && x <= 26 && y >= 4 && y <= 5 ? C.titleDot : C.title;
  const pane = (x0, y0, x1, y1, color) => {
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return color;
    if (x === x1 + 1 && y > y0 && y <= y1 + 1) return C.shadow;
    if (y === y1 + 1 && x > x0 && x <= x1 + 1) return C.shadow;
    return null;
  };
  return pane(4, 9, 13, 27, C.green) ?? pane(16, 9, 27, 16, C.amber) ?? pane(16, 19, 27, 27, C.purple) ?? C.bg;
}

/** Renders at `size` px. `pad` (0–0.5) shrinks the design inside a full background, for maskable icons. */
function render(size, pad = 0) {
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let px = 0; px < size; px++) {
      const u = (px / size - pad) / (1 - 2 * pad);
      const v = (py / size - pad) / (1 - 2 * pad);
      const [r, g, b] = design(Math.floor(u * 32), Math.floor(v * 32));
      row.set([r, g, b], 1 + px * 3);
    }
    rows.push(row);
  }
  return png(size, size, Buffer.concat(rows));
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const files = {
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  'maskable-512.png': render(512, 0.1),
  'apple-touch-icon.png': render(180),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(new URL(name, out), data);
  console.log(`public/icons/${name} (${data.length} bytes)`);
}

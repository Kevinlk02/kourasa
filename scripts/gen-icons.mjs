// Génère des icônes PNG provisoires (en attendant le vrai logo) sans dépendance :
// carré vert d'accent avec une flèche « K » stylisée blanche. Remplacer par le logo définitif.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const GREEN = [0, 135, 90, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

// Marque : barre verticale + chevron (évoque un K / une flèche de livraison).
function mark(u, v, scale = 1) {
  const cx = (u - 0.5) / scale + 0.5, cy = (v - 0.5) / scale + 0.5;
  const bar = cx > 0.3 && cx < 0.4 && cy > 0.25 && cy < 0.75;
  const d1 = Math.abs((cy - 0.5) + (cx - 0.42) * 1.0) < 0.055 && cx > 0.4 && cx < 0.68 && cy < 0.5 && cy > 0.24;
  const d2 = Math.abs((cy - 0.5) - (cx - 0.42) * 1.0) < 0.055 && cx > 0.4 && cx < 0.68 && cy >= 0.5 && cy < 0.76;
  return bar || d1 || d2;
}
const icon = (scale = 1, bg = GREEN) => (u, v) => (mark(u, v, scale) ? WHITE : bg);

function write(rel, size, fn) {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, png(size, fn));
}

for (const app of ['client', 'courier']) {
  write(`apps/${app}/assets/icon.png`, 1024, icon());
  write(`apps/${app}/assets/adaptive-icon.png`, 1024, (u, v) => (mark(u, v, 0.66) ? WHITE : CLEAR));
  write(`apps/${app}/assets/splash.png`, 512, (u, v) => (mark(u, v, 0.8) ? GREEN : CLEAR));
  write(`apps/${app}/assets/favicon.png`, 48, icon());
}
write('apps/client/public/icons/icon-192.png', 192, icon());
write('apps/client/public/icons/icon-512.png', 512, icon(0.8));
write('apps/web/public/icon-192.png', 192, icon());
write('apps/web/app/icon.png', 64, icon());
console.log('Icônes provisoires générées.');

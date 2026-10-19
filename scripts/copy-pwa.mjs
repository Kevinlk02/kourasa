// Copie l'export web de apps/client (dist/) dans apps/web/public/app, servi sous /app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'apps/client/dist');
const dst = path.join(root, 'apps/web/public/app');

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('apps/client/dist/index.html introuvable : lancez d’abord `pnpm --filter @koursa/client export:web`.');
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log(`PWA copiée → apps/web/public/app (${fs.readdirSync(dst).length} éléments)`);

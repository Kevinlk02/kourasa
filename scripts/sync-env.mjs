// Expo et Next.js lisent le .env de LEUR dossier : on copie le .env racine dans chaque app.
// Usage : pnpm env:sync (après avoir rempli .env à la racine).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, '.env');
if (!fs.existsSync(src)) {
  console.error('.env absent : copiez .env.example en .env et remplissez-le.');
  process.exit(1);
}
const env = fs.readFileSync(src, 'utf8');
const header = '# GÉNÉRÉ par scripts/sync-env.mjs depuis le .env racine — modifier le .env racine.\n';
for (const target of ['apps/client/.env', 'apps/courier/.env', 'apps/web/.env.local']) {
  fs.writeFileSync(path.join(root, target), header + env);
  console.log(`→ ${target}`);
}

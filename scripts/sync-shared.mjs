// Copie la logique métier pure de packages/shared vers les Edge Functions (Deno),
// pour que le serveur calcule les prix avec EXACTEMENT la même formule que celle testée.
// Lancé par `pnpm sync:functions` (et vérifié par le test « functions-in-sync »).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'packages/shared/src');
const dst = path.join(root, 'supabase/functions/_shared/core');
const files = ['pricing.ts', 'money.ts', 'schemas.ts', 'status.ts'];

fs.mkdirSync(dst, { recursive: true });
for (const f of files) {
  const header = `// FICHIER GÉNÉRÉ depuis packages/shared/src/${f} par scripts/sync-shared.mjs — ne pas modifier ici.\n`;
  fs.writeFileSync(path.join(dst, f), header + fs.readFileSync(path.join(src, f), 'utf8'));
}
console.log(`Synchronisé : ${files.join(', ')} → supabase/functions/_shared/core`);

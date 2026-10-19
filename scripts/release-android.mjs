// Publication d'un APK hors Play Store (docs/DISTRIBUTION.md) :
//   pnpm release:android client   |   pnpm release:android courier
// 1. construit l'APK avec EAS (profil apk), 2. le télécharge, 3. calcule le SHA-256,
// 4. l'envoie dans Supabase Storage (bucket downloads), 5. affiche la ligne app_versions à publier.
// Variables : NEXT_PUBLIC_SUPABASE_URL (ou EXPO_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];
if (!['client', 'courier'].includes(app)) {
  console.error('Usage : pnpm release:android <client|courier> [--local fichier.apk]');
  process.exit(1);
}
const appDir = path.join(root, 'apps', app);
const config = fs.readFileSync(path.join(appDir, 'app.config.ts'), 'utf8');
const version = config.match(/version: '([\d.]+)'/)?.[1];
if (!version) throw new Error('Version introuvable dans app.config.ts');

let apk;
const localIdx = process.argv.indexOf('--local');
if (localIdx > 0) {
  apk = path.resolve(process.argv[localIdx + 1]);
} else {
  console.log(`→ Construction EAS de ${app} ${version} (profil apk)…`);
  const out = execSync('npx eas-cli build -p android --profile apk --non-interactive --json --wait', { cwd: appDir, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  const build = JSON.parse(out)[0];
  const url = build?.artifacts?.buildUrl ?? build?.artifacts?.applicationArchiveUrl;
  if (!url) throw new Error('URL de l’APK introuvable dans la réponse EAS');
  apk = path.join(root, `koursa-${app}-${version}.apk`);
  console.log('→ Téléchargement de l’APK…');
  const res = await fetch(url);
  fs.writeFileSync(apk, Buffer.from(await res.arrayBuffer()));
}

const buf = fs.readFileSync(apk);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
console.log(`SHA-256 : ${sha256}\nTaille : ${(buf.length / 1048576).toFixed(1)} Mo`);

const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supaUrl || !key) {
  console.log('SUPABASE_SERVICE_ROLE_KEY absente : envoyez le fichier depuis /admin/versions.');
  process.exit(0);
}
const objectPath = `${app}/koursa-${app}-${version}.apk`;
const up = await fetch(`${supaUrl}/storage/v1/object/downloads/${objectPath}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/vnd.android.package-archive', 'x-upsert': 'true' },
  body: buf,
});
if (!up.ok) throw new Error(`Envoi Storage échoué : ${up.status} ${await up.text()}`);
const publicUrl = `${supaUrl}/storage/v1/object/public/downloads/${objectPath}`;
console.log(`APK en ligne : ${publicUrl}\n`);
console.log('Ligne à publier (ou via /admin/versions) :');
console.log(`insert into app_versions (app, platform, latest_version, min_version, apk_url, sha256, size_bytes, changelog)
values ('${app}', 'android', '${version}', '<version minimale>', '${publicUrl}', '${sha256}', ${buf.length}, '<notes>');`);

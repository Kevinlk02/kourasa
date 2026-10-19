'use client';

// Versions des apps : publier un nouvel APK (lien, version, version minimale, notes).
import { useCallback, useEffect, useState } from 'react';
import { fmtDate } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

interface V {
  id: string; app: 'client' | 'courier'; platform: 'android' | 'web'; latest_version: string; min_version: string;
  apk_url: string | null; sha256: string | null; size_bytes: number | null; changelog: string | null; published_at: string;
}
const EMPTY = { app: 'client' as V['app'], platform: 'android' as V['platform'], latest_version: '', min_version: '', apk_url: '', sha256: '', size_bytes: '', changelog: '' };

export default function Versions() {
  const sb = supabase();
  const [rows, setRows] = useState<V[]>([]);
  const [f, setF] = useState(EMPTY);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const { data } = await sb.from('app_versions').select('*').order('published_at', { ascending: false }).limit(50);
    setRows((data as V[]) ?? []);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  async function uploadApk(file: File) {
    setUploading(true);
    const buf = await file.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map((b) => b.toString(16).padStart(2, '0')).join('');
    const path = `${f.app}/koursa-${f.app}-${f.latest_version || Date.now()}.apk`;
    const { error } = await sb.storage.from('downloads').upload(path, file, { contentType: 'application/vnd.android.package-archive', upsert: true });
    setUploading(false);
    if (error) return alert(error.message);
    setF({ ...f, apk_url: sb.storage.from('downloads').getPublicUrl(path).data.publicUrl, sha256: hash, size_bytes: String(file.size) });
  }

  async function publish() {
    const { error } = await sb.from('app_versions').insert({
      app: f.app, platform: f.platform, latest_version: f.latest_version, min_version: f.min_version,
      apk_url: f.apk_url || null, sha256: f.sha256 || null, size_bytes: f.size_bytes ? Number(f.size_bytes) : null, changelog: f.changelog || null,
    });
    if (error) return alert(error.message);
    setF(EMPTY);
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Versions des apps</h1>
      <div className="card space-y-3">
        <h2 className="font-semibold">Publier une version</h2>
        <p className="text-sm text-muted">1. Construisez l’APK (<code>pnpm release:android client</code>). 2. Envoyez le fichier ici (SHA-256 et taille calculés). 3. Version minimale = versions plus anciennes bloquées (« Mise à jour obligatoire »).</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <select className="input" value={f.app} onChange={(e) => setF({ ...f, app: e.target.value as V['app'] })}><option value="client">Client</option><option value="courier">Coursier</option></select>
          <select className="input" value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value as V['platform'] })}><option value="android">Android (APK)</option><option value="web">Web (PWA)</option></select>
          <input className="input" placeholder="Version (1.1.0)" value={f.latest_version} onChange={(e) => setF({ ...f, latest_version: e.target.value })} />
          <input className="input" placeholder="Version minimale" value={f.min_version} onChange={(e) => setF({ ...f, min_version: e.target.value })} />
        </div>
        {f.platform === 'android' ? (
          <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
            <label className="btn-sm h-11 cursor-pointer bg-surface">{uploading ? 'Envoi…' : 'Choisir l’APK'}
              <input type="file" accept=".apk" className="hidden" onChange={(e) => e.target.files?.[0] && uploadApk(e.target.files[0])} />
            </label>
            <input className="input" placeholder="URL de l’APK" value={f.apk_url} onChange={(e) => setF({ ...f, apk_url: e.target.value })} />
            <span className="label self-center">SHA-256</span>
            <input className="input font-mono text-xs" value={f.sha256} onChange={(e) => setF({ ...f, sha256: e.target.value })} />
          </div>
        ) : null}
        <textarea className="input h-20 py-2" placeholder="Notes de version (affichées aux utilisateurs)" value={f.changelog} onChange={(e) => setF({ ...f, changelog: e.target.value })} />
        <button className="btn-sm bg-ink text-white" disabled={!f.latest_version || !f.min_version || (f.platform === 'android' && !f.apk_url)} onClick={publish}>Publier</button>
      </div>
      <table className="data">
        <thead><tr><th>Date</th><th>App</th><th>Plateforme</th><th>Version</th><th>Minimum</th><th>Taille</th><th>SHA-256</th></tr></thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id}>
              <td>{fmtDate(v.published_at)}</td><td>{v.app}</td><td>{v.platform}</td><td>{v.latest_version}</td><td>{v.min_version}</td>
              <td>{v.size_bytes ? `${(v.size_bytes / 1048576).toFixed(1)} Mo` : '—'}</td>
              <td className="font-mono text-[11px]">{v.sha256?.slice(0, 16) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

'use client';

// Suivi des appels Google par jour et par API (coût). Les hits de cache sont gratuits.
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '@/lib/admin';

interface Row { day: string; api: string; calls: number; cache_hits: number; errors: number }
const APIS = ['autocomplete', 'place_details', 'reverse_geocode', 'nearby', 'routes'];

export default function GoogleCalls() {
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState(30);
  useEffect(() => {
    rpc<Row[]>('admin_google_calls', { p_days: days }).then((r) => setRows(r ?? []));
  }, [days]);

  const byDay = useMemo(() => {
    const m = new Map<string, Record<string, Row>>();
    for (const r of rows) {
      if (!m.has(r.day)) m.set(r.day, {});
      m.get(r.day)![r.api] = r;
    }
    return [...m.entries()];
  }, [rows]);
  const total = (api: string) => rows.filter((r) => r.api === api).reduce((s, r) => s + r.calls, 0);
  const hits = rows.reduce((s, r) => s + r.cache_hits, 0);
  const calls = rows.reduce((s, r) => s + r.calls, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Appels Google</h1>
        <select className="input h-9 w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90].map((d) => <option key={d} value={d}>{d} jours</option>)}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-6">
        {APIS.map((a) => <div key={a} className="card"><p className="label">{a}</p><p className="text-xl font-bold">{total(a)}</p></div>)}
        <div className="card"><p className="label">TAUX DE CACHE</p><p className="text-xl font-bold">{calls + hits ? Math.round((100 * hits) / (calls + hits)) : 0} %</p></div>
      </div>
      <p className="text-sm text-muted">Appels facturables (hors cache). Vérifiez la grille tarifaire Google en vigueur et gardez l’alerte budget + les quotas journaliers dans Google Cloud.</p>
      <table className="data">
        <thead><tr><th>Jour</th>{APIS.map((a) => <th key={a}>{a}</th>)}<th>Erreurs</th></tr></thead>
        <tbody>
          {byDay.map(([day, apis]) => (
            <tr key={day}>
              <td>{new Date(day).toLocaleDateString('fr-FR')}</td>
              {APIS.map((a) => <td key={a}>{apis[a]?.calls ?? 0}<span className="text-xs text-muted"> / {apis[a]?.cache_hits ?? 0} cache</span></td>)}
              <td>{Object.values(apis).reduce((s, r) => s + r.errors, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

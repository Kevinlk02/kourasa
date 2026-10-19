'use client';

// Lieux spéciaux (restaurants) : liste, ajout, retrait, signalements coursiers, attente moyenne mesurée.
import { useCallback, useEffect, useState } from 'react';
import { fmtDate, rpc, useAdmin } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

interface V {
  id: string; name: string; kind: string; source: 'google' | 'admin' | 'courier'; validated: boolean; is_restaurant: boolean;
  place_id: string | null; lat: number; lng: number; avg_wait_min: number | null; samples: number; reported_by: string | null; created_at: string;
}

export default function Lieux() {
  const { city } = useAdmin();
  const [rows, setRows] = useState<V[]>([]);
  const [form, setForm] = useState({ name: '', lat: '', lng: '', place_id: '' });

  const load = useCallback(async () => {
    if (city) setRows((await rpc<V[]>('admin_venue_waits', { p_city: city.id })) ?? []);
  }, [city]);
  useEffect(() => {
    load();
  }, [load]);

  async function update(id: string, patch: Partial<Pick<V, 'validated' | 'is_restaurant' | 'name'>>) {
    const { error } = await supabase().from('venues').update(patch).eq('id', id);
    if (error) alert(error.message);
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Restaurants &amp; lieux spéciaux</h1>
      <p className="text-sm text-muted">Un point de récupération dans un lieu validé ici bénéficie de 15 minutes d’attente offertes (règle interne). Les signalements des coursiers apparaissent en « À valider ».</p>

      <div className="card grid gap-2 sm:grid-cols-5">
        <input className="input sm:col-span-2" placeholder="Nom du lieu" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="Latitude" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
        <input className="input" placeholder="Longitude" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
        <button className="btn-sm h-11 bg-ink text-white" disabled={!form.name || !form.lat || !form.lng} onClick={async () => {
          await rpc('admin_add_venue', { p_city: city?.id, p_name: form.name, p_lat: Number(form.lat.replace(',', '.')), p_lng: Number(form.lng.replace(',', '.')), p_place_id: form.place_id || null });
          setForm({ name: '', lat: '', lng: '', place_id: '' });
          load();
        }}>Ajouter</button>
      </div>

      <div className="overflow-x-auto">
        <table className="data min-w-[800px]">
          <thead><tr><th>Lieu</th><th>Source</th><th>Statut</th><th>Attente moyenne mesurée</th><th>Position</th><th /></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="font-medium">{v.name}<div className="text-xs text-muted">{fmtDate(v.created_at)}{v.reported_by ? ` · signalé par ${v.reported_by}` : ''}</div></td>
                <td>{v.source}</td>
                <td>{v.validated ? (v.is_restaurant ? '✅ Restaurant' : 'Pas un restaurant') : '⏳ À valider'}</td>
                <td>{v.avg_wait_min != null ? `${v.avg_wait_min} min (${v.samples} mesures)` : '—'}</td>
                <td><a className="underline" target="_blank" href={`https://www.google.com/maps?q=${v.lat},${v.lng}`}>{v.lat.toFixed(5)}, {v.lng.toFixed(5)}</a></td>
                <td className="space-x-1 whitespace-nowrap">
                  {!v.validated || !v.is_restaurant ? <button className="btn-sm bg-accent text-white" onClick={() => update(v.id, { validated: true, is_restaurant: true })}>Restaurant</button> : null}
                  {v.is_restaurant ? <button className="btn-sm bg-surface" onClick={() => update(v.id, { validated: true, is_restaurant: false })}>Retirer</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

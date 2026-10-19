'use client';

// Liste des courses filtrable (zone, statut, date) + détail, journal, annulation, litige / remboursement.
import { useCallback, useEffect, useState } from 'react';
import { DELIVERY_STATUSES, formatMoney, t, type DeliveryStatus } from '@koursa/shared';
import { currencyOf, fmtDate, rpc, useAdmin } from '@/lib/admin';

interface Row {
  id: string; status: DeliveryStatus; created_at: string; pickup_zone: string; pickup_zone_color: string; dropoff_zone: string | null;
  pickup_address: string; pickup_landmark: string; dropoff_address: string; dropoff_landmark: string;
  client: string; client_phone: string; courier: string | null; recipient_name: string; recipient_phone: string;
  size: string; payer: string; distance_m: number; price: number; currency: string;
  waiting_pickup_fee: number; waiting_dropoff_fee: number; waiting_refused: boolean; total_collected: number | null;
  commission: number | null; approach_m: number | null; approach_bonus: number | null; late_penalty: number | null;
  late_penalty_status: string | null; pickup_is_restaurant: boolean; pickup_grace_min: number; tracking_token: string;
  cancel_reason: string | null; events: { kind: string; at: string; data: Record<string, unknown> }[] | null;
}

export default function Courses() {
  const { city, zones } = useAdmin();
  const cur = currencyOf(city);
  const [zone, setZone] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!city) return;
    const data = await rpc<Row[]>('admin_deliveries', {
      p_city: city.id, p_zone: zone || null, p_status: status || null,
      p_from: from ? new Date(from).toISOString() : null, p_to: to ? new Date(new Date(to).getTime() + 86_400_000).toISOString() : null,
      p_limit: 300,
    });
    setRows(data ?? []);
  }, [city, zone, status, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    const head = ['id', 'date', 'statut', 'zone', 'client', 'coursier', 'prix', 'attente_recup', 'attente_livr', 'encaisse', 'commission', 'incitation', 'penalite'];
    const lines = rows.map((r) => [r.id, r.created_at, r.status, r.pickup_zone, r.client, r.courier ?? '', r.price, r.waiting_pickup_fee, r.waiting_dropoff_fee, r.total_collected ?? '', r.commission ?? '', r.approach_bonus ?? '', r.late_penalty ?? '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv' }));
    a.download = `courses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <h1 className="mr-auto text-2xl font-bold">Courses</h1>
        <select className="input h-9 w-auto" value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">Toutes les zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <select className="input h-9 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
        <input type="date" className="input h-9 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="input h-9 w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn-sm bg-surface" onClick={exportCsv}>Exporter CSV</button>
      </div>

      <div className="overflow-x-auto">
        <table className="data min-w-[900px]">
          <thead><tr><th>Date</th><th>Statut</th><th>Zone</th><th>Client</th><th>Destinataire</th><th>Coursier</th><th>Prix</th><th>Attente</th><th>Encaissé</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-surface" onClick={() => setOpen(r)}>
                <td>{fmtDate(r.created_at)}</td>
                <td>{t(`status.${r.status}`)}{r.waiting_refused ? ' ⚠️' : ''}</td>
                <td><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: r.pickup_zone_color }} />{r.pickup_zone}{r.dropoff_zone && r.dropoff_zone !== r.pickup_zone ? ` → ${r.dropoff_zone}` : ''}</td>
                <td>{r.client}</td><td>{r.recipient_name}</td><td>{r.courier ?? '—'}</td>
                <td>{formatMoney(r.price, cur)}</td>
                <td>{r.waiting_pickup_fee + r.waiting_dropoff_fee ? formatMoney(r.waiting_pickup_fee + r.waiting_dropoff_fee, cur) : '—'}</td>
                <td>{r.total_collected != null ? formatMoney(r.total_collected, cur) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="py-6 text-center text-muted">Aucune course.</p> : null}
      </div>

      {open ? <Detail r={open} cur={cur} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} /> : null}
    </div>
  );
}

function Detail({ r, cur, onClose, onChanged }: { r: Row; cur: string; onClose: () => void; onChanged: () => void }) {
  const [note, setNote] = useState('');
  const [refund, setRefund] = useState('');
  const active = ['pending', 'searching', 'assigned', 'picked_up', 'delivering', 'unassigned'].includes(r.status);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg space-y-4 overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Course</h2><button onClick={onClose}>✕</button></div>
        <p className="font-mono text-xs text-muted">{r.id}</p>
        <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Statut</dt><dd>{t(`status.${r.status}`)}{r.cancel_reason ? ` (${r.cancel_reason})` : ''}</dd>
          <dt className="text-muted">Récupération</dt><dd>{r.pickup_landmark}<br /><span className="text-muted">{r.pickup_address}</span></dd>
          <dt className="text-muted">Livraison</dt><dd>{r.dropoff_landmark}<br /><span className="text-muted">{r.dropoff_address}</span></dd>
          <dt className="text-muted">Client</dt><dd>{r.client} · {r.client_phone}</dd>
          <dt className="text-muted">Destinataire</dt><dd>{r.recipient_name} · {r.recipient_phone}</dd>
          <dt className="text-muted">Coursier</dt><dd>{r.courier ?? '—'}</dd>
          <dt className="text-muted">Colis / payeur</dt><dd>{r.size} · {r.payer === 'sender' ? 'expéditeur' : 'destinataire'}</dd>
          <dt className="text-muted">Distance</dt><dd>{(r.distance_m / 1000).toFixed(1)} km · approche {r.approach_m ? `${(r.approach_m / 1000).toFixed(1)} km` : '—'}</dd>
          <dt className="text-muted">Restaurant</dt><dd>{r.pickup_is_restaurant ? `oui (${r.pickup_grace_min} min offertes)` : 'non'}</dd>
          <dt className="text-muted">Prix figé</dt><dd>{formatMoney(r.price, cur)}</dd>
          <dt className="text-muted">Attente</dt><dd>{formatMoney(r.waiting_pickup_fee, cur)} + {formatMoney(r.waiting_dropoff_fee, cur)}{r.waiting_refused ? ' (refusée par le destinataire)' : ''}</dd>
          <dt className="text-muted">Encaissé</dt><dd>{r.total_collected != null ? formatMoney(r.total_collected, cur) : '—'}</dd>
          <dt className="text-muted">Commission</dt><dd>{r.commission != null ? formatMoney(r.commission, cur) : '—'}</dd>
          <dt className="text-muted">Incitation</dt><dd>{r.approach_bonus ? formatMoney(r.approach_bonus, cur) : '—'}</dd>
          <dt className="text-muted">Pénalité retard</dt><dd>{r.late_penalty ? `${formatMoney(r.late_penalty, cur)} (${r.late_penalty_status})` : '—'}</dd>
          <dt className="text-muted">Suivi</dt><dd><a className="underline" href={`/t/${r.tracking_token}`} target="_blank">/t/{r.tracking_token.slice(0, 8)}…</a></dd>
        </dl>

        <div>
          <h3 className="mb-1 font-semibold">Journal</h3>
          <ol className="space-y-1 text-sm">
            {(r.events ?? []).map((e, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-line py-1">
                <span>{e.kind}{Object.keys(e.data ?? {}).length ? <span className="text-muted"> · {JSON.stringify(e.data).slice(0, 80)}</span> : null}</span>
                <span className="shrink-0 text-muted">{fmtDate(e.at)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="card space-y-2">
          <h3 className="font-semibold">Litige / commentaire</h3>
          <textarea className="input h-20 py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Commentaire" />
          <input className="input" type="number" min={0} value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="Remboursement manuel (F), optionnel" />
          <button className="btn-sm bg-ink text-white" disabled={!note.trim()} onClick={async () => {
            await rpc('admin_delivery_note', { p_delivery: r.id, p_note: note, p_refund: parseInt(refund || '0', 10) });
            onChanged();
          }}>Enregistrer</button>
        </div>
        {active ? (
          <button className="btn-sm bg-danger text-white" onClick={async () => {
            const reason = prompt('Motif de l’annulation ?');
            if (reason == null) return;
            await rpc('admin_cancel_delivery', { p_delivery: r.id, p_reason: reason });
            onChanged();
          }}>Annuler la course</button>
        ) : null}
      </div>
    </div>
  );
}

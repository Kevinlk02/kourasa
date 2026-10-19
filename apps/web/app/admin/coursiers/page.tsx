'use client';

// Coursiers : validation avec documents, suspension, zone d'attache, commission due, remboursements.
import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@koursa/shared';
import { currencyOf, fmtDate, rpc, useAdmin } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

interface C {
  id: string; name: string; phone: string; status: 'pending' | 'validated' | 'suspended' | 'rejected';
  vehicle_model: string; plate: string; home_zone_id: string | null; current_zone_id: string | null; online: boolean;
  last_seen_at: string | null; blocked: boolean; rating_avg: number | null; rating_count: number; balance_due: number;
  photo_path: string | null; id_document_path: string | null; vehicle_photo_path: string | null; license_path: string | null;
  admin_note: string | null; created_at: string; deliveries: number;
}

const STATUS_LABEL = { pending: 'En attente', validated: 'Validé', suspended: 'Suspendu', rejected: 'Refusé' } as const;

export default function Couriers() {
  const { city, zones } = useAdmin();
  const cur = currencyOf(city);
  const [rows, setRows] = useState<C[]>([]);
  const [filter, setFilter] = useState<'all' | C['status'] | 'blocked'>('all');
  const [open, setOpen] = useState<C | null>(null);

  const load = useCallback(async () => {
    if (!city) return;
    setRows((await rpc<C[]>('admin_couriers', { p_city: city.id })) ?? []);
  }, [city]);
  useEffect(() => {
    load();
  }, [load]);

  const zoneName = (id: string | null) => zones.find((z) => z.id === id)?.name ?? '—';
  const shown = rows.filter((r) => filter === 'all' || (filter === 'blocked' ? r.blocked : r.status === filter));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">Coursiers</h1>
        {(['all', 'pending', 'validated', 'blocked', 'suspended', 'rejected'] as const).map((f) => (
          <button key={f} className={`btn-sm ${filter === f ? 'bg-ink text-white' : 'bg-surface'}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Tous' : f === 'blocked' ? 'Bloqués' : STATUS_LABEL[f]}
            {f === 'pending' ? ` (${rows.filter((r) => r.status === 'pending').length})` : ''}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="data min-w-[900px]">
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Statut</th><th>Zone d’attache</th><th>Présent en</th><th>En ligne</th><th>Courses</th><th>Note</th><th>Commission due</th></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-surface" onClick={() => setOpen(c)}>
                <td className="font-medium">{c.name}</td><td>{c.phone}</td>
                <td>{STATUS_LABEL[c.status]}{c.blocked ? ' · 🔒 bloqué' : ''}</td>
                <td>{zoneName(c.home_zone_id)}</td><td>{zoneName(c.current_zone_id)}</td>
                <td>{c.online ? `🟢 ${fmtDate(c.last_seen_at)}` : '—'}</td>
                <td>{c.deliveries}</td><td>{c.rating_avg ? `★ ${c.rating_avg} (${c.rating_count})` : '—'}</td>
                <td className={c.blocked ? 'font-semibold text-danger' : ''}>{formatMoney(c.balance_due, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? <Detail c={open} cur={cur} onClose={() => setOpen(null)} onChanged={async () => { await load(); setOpen(null); }} /> : null}
    </div>
  );
}

function Doc({ label, bucket, path }: { label: string; bucket: string; path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    if (bucket === 'courier-avatars') setUrl(supabase().storage.from(bucket).getPublicUrl(path).data.publicUrl);
    else supabase().storage.from(bucket).createSignedUrl(path, 600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [bucket, path]);
  return (
    <figure className="space-y-1">
      {url ? <a href={url} target="_blank"><img src={url} alt={label} className="aspect-[4/3] w-full rounded-lg bg-surface object-cover" /></a>
        : <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-surface text-sm text-muted">{path ? '…' : 'Absent'}</div>}
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

function Detail({ c, cur, onClose, onChanged }: { c: C; cur: string; onClose: () => void; onChanged: () => void }) {
  const { zones } = useAdmin();
  const [zone, setZone] = useState(c.home_zone_id ?? zones[0]?.id ?? '');
  const [note, setNote] = useState(c.admin_note ?? '');
  const [amount, setAmount] = useState('');
  const [txNote, setTxNote] = useState('');

  async function setStatus(s: C['status']) {
    if (s === 'validated' && !zone) return alert('Choisissez la zone d’attache');
    await rpc('admin_set_courier', { p_courier: c.id, p_status: s, p_home_zone: zone || null, p_note: note || null });
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-xl space-y-4 overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{c.name}</h2><button onClick={onClose}>✕</button></div>
        <p className="text-sm text-muted">{c.phone} · {c.vehicle_model} · {c.plate} · inscrit le {fmtDate(c.created_at)}</p>
        <div className="grid grid-cols-2 gap-3">
          <Doc label="Photo" bucket="courier-avatars" path={c.photo_path} />
          <Doc label="Pièce d’identité" bucket="courier-docs" path={c.id_document_path} />
          <Doc label="Moto + plaque" bucket="courier-docs" path={c.vehicle_photo_path} />
          <Doc label="Permis" bucket="courier-docs" path={c.license_path} />
        </div>

        <div className="card space-y-2">
          <label className="label">ZONE D’ATTACHE</label>
          <select className="input" value={zone} onChange={(e) => setZone(e.target.value)}>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <textarea className="input h-16 py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note interne" />
          <div className="flex flex-wrap gap-2">
            <button className="btn-sm bg-accent text-white" onClick={() => setStatus('validated')}>{c.status === 'validated' ? 'Enregistrer' : 'Valider'}</button>
            {c.status !== 'suspended' ? <button className="btn-sm bg-warning text-white" onClick={() => setStatus('suspended')}>Suspendre</button> : null}
            {c.status === 'pending' ? <button className="btn-sm bg-danger text-white" onClick={() => setStatus('rejected')}>Refuser</button> : null}
          </div>
        </div>

        <div className="card space-y-2">
          <p className="label">COMMISSION DUE</p>
          <p className={`text-2xl font-bold ${c.blocked ? 'text-danger' : ''}`}>{formatMoney(c.balance_due, cur)}{c.blocked ? ' · bloqué' : ''}</p>
          <input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant (F)" />
          <input className="input" value={txNote} onChange={(e) => setTxNote(e.target.value)} placeholder="Référence mobile money / motif" />
          <div className="flex flex-wrap gap-2">
            <button className="btn-sm bg-ink text-white" disabled={!amount} onClick={async () => {
              await rpc('admin_record_repayment', { p_courier: c.id, p_amount: parseInt(amount, 10), p_note: txNote || 'Remboursement mobile money' });
              onChanged();
            }}>Enregistrer un remboursement</button>
            <button className="btn-sm bg-surface" disabled={!amount || !txNote} onClick={async () => {
              const sign = confirm('OK = augmenter la dette, Annuler = la réduire') ? 1 : -1;
              await rpc('admin_wallet_adjust', { p_courier: c.id, p_amount: sign * parseInt(amount, 10), p_note: txNote });
              onChanged();
            }}>Ajustement</button>
          </div>
          <p className="text-xs text-muted">Le coursier est débloqué automatiquement quand sa dette repasse sous le seuil.</p>
        </div>
        <WalletHistory courierId={c.id} cur={cur} />
      </div>
    </div>
  );
}

function WalletHistory({ courierId, cur }: { courierId: string; cur: string }) {
  const [tx, setTx] = useState<{ id: string; type: string; amount: number; note: string | null; created_at: string }[]>([]);
  useEffect(() => {
    supabase().from('wallet_transactions').select('id, type, amount, note, created_at').eq('courier_id', courierId)
      .order('created_at', { ascending: false }).limit(50).then(({ data }) => setTx(data ?? []));
  }, [courierId]);
  return (
    <div>
      <h3 className="mb-1 font-semibold">Mouvements</h3>
      <table className="data">
        <tbody>
          {tx.map((x) => (
            <tr key={x.id}><td>{fmtDate(x.created_at)}</td><td>{x.type}</td><td className={x.amount > 0 ? 'text-danger' : 'text-accent'}>{x.amount > 0 ? '+' : ''}{formatMoney(x.amount, cur)}</td><td className="text-muted">{x.note}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

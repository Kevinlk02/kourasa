'use client';

// Incidents (panne, accident, contrôle → annule la pénalité de retard si validé), attentes refusées, clients absents.
import { useCallback, useEffect, useState } from 'react';
import { fmtDate, rpc, useAdmin } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

interface I {
  id: string; kind: string; description: string; status: 'open' | 'validated' | 'rejected'; admin_comment: string | null;
  created_at: string; delivery_id: string | null; courier_id: string; couriers: { profiles: { full_name: string; phone: string } | null } | null;
}

const KIND: Record<string, string> = {
  breakdown: 'Panne', accident: 'Accident', police_check: 'Contrôle de police', other: 'Autre',
  waiting_refused: 'Attente refusée', client_absent: 'Client absent', dispute: 'Litige',
};

export default function Incidents() {
  const { city } = useAdmin();
  const [rows, setRows] = useState<I[]>([]);
  const [status, setStatus] = useState<'open' | 'validated' | 'rejected'>('open');

  const load = useCallback(async () => {
    const { data } = await supabase().from('incidents')
      .select('id, kind, description, status, admin_comment, created_at, delivery_id, courier_id, couriers(profiles(full_name, phone))')
      .eq('status', status).order('created_at', { ascending: false }).limit(200);
    setRows((data as unknown as I[]) ?? []);
  }, [status]);
  useEffect(() => {
    load();
  }, [load, city]);

  async function resolve(i: I, decision: 'validated' | 'rejected') {
    const comment = prompt(decision === 'validated' ? 'Commentaire (incident validé)' : 'Commentaire (incident rejeté)') ?? '';
    await rpc('admin_resolve_incident', { p_incident: i.id, p_decision: decision, p_comment: comment });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">Incidents &amp; litiges</h1>
        {(['open', 'validated', 'rejected'] as const).map((s) => (
          <button key={s} className={`btn-sm ${status === s ? 'bg-ink text-white' : 'bg-surface'}`} onClick={() => setStatus(s)}>
            {s === 'open' ? 'À traiter' : s === 'validated' ? 'Validés' : 'Rejetés'}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        Valider un incident (panne, accident, contrôle) annule la pénalité de retard en attente de la course. Le rejeter l’applique.
        Pour une attente refusée ou un client absent, ajoutez un commentaire / remboursement depuis la fiche de la course.
      </p>
      <div className="space-y-2">
        {rows.map((i) => (
          <div key={i.id} className="card flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold">{KIND[i.kind] ?? i.kind} · {i.couriers?.profiles?.full_name ?? 'Coursier'} <span className="font-normal text-muted">{i.couriers?.profiles?.phone}</span></p>
              <p className="text-sm">{i.description || '—'}</p>
              <p className="text-xs text-muted">{fmtDate(i.created_at)}{i.delivery_id ? ` · course ${i.delivery_id.slice(0, 8)}` : ''}{i.admin_comment ? ` · ${i.admin_comment}` : ''}</p>
            </div>
            {i.status === 'open' ? (
              <div className="flex gap-2">
                <button className="btn-sm bg-accent text-white" onClick={() => resolve(i, 'validated')}>Valider</button>
                <button className="btn-sm bg-surface" onClick={() => resolve(i, 'rejected')}>Rejeter</button>
              </div>
            ) : null}
          </div>
        ))}
        {!rows.length ? <p className="py-6 text-center text-muted">Rien à afficher.</p> : null}
      </div>
    </div>
  );
}

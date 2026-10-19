'use client';

// Indicateurs (MVP §8) par zone + tableau en direct + alertes + argent du mois.
import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@koursa/shared';
import { currencyOf, fmtDate, monthRange, rpc, useAdmin } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

interface Kpi {
  zone_id: string; code: string; name: string; color: string; created: number; delivered: number; unassigned: number;
  unassigned_rate: number | null; avg_assign_s: number | null; avg_delivery_min: number | null; revenue: number;
  commission: number; incentives: number; penalties: number; real_margin_pct: number | null; waiting_fees: number;
  late_deliveries: number; active_couriers: number;
}
interface Live {
  zone_id: string; name: string; color: string; online_home: number; online_present: number; available: number;
  waiting_deliveries: number; active_deliveries: number; avg_assign_s_today: number | null; unassigned_today: number; alert: boolean;
}
interface Money { penalties: number; incentives: number; commissions: number; repayments: number; outstanding: number; blocked_couriers: number }
interface Alert { id: number; kind: string; message: string; created_at: string; zone_id: string | null; delivery_id: string | null }

const PERIODS = { today: 'Aujourd’hui', '7d': '7 jours', month: 'Ce mois', '30d': '30 jours' } as const;

function range(p: keyof typeof PERIODS) {
  const now = new Date();
  const to = new Date(now.getTime() + 86_400_000).toISOString();
  if (p === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return { from: d.toISOString(), to }; }
  if (p === 'month') return monthRange();
  return { from: new Date(now.getTime() - (p === '7d' ? 7 : 30) * 86_400_000).toISOString(), to };
}

export default function Dashboard() {
  const { city } = useAdmin();
  const cur = currencyOf(city);
  const [period, setPeriod] = useState<keyof typeof PERIODS>('today');
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [live, setLive] = useState<Live[]>([]);
  const [money, setMoney] = useState<Money | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const load = useCallback(async () => {
    if (!city) return;
    const r = range(period);
    const m = monthRange();
    const [k, l, mo] = await Promise.all([
      rpc<Kpi[]>('admin_kpis', { p_city: city.id, p_from: r.from, p_to: r.to }),
      rpc<Live[]>('admin_zone_live', { p_city: city.id }),
      rpc<Money>('admin_money_summary', { p_city: city.id, p_from: m.from, p_to: m.to }),
    ]);
    setKpis(k ?? []);
    setLive(l ?? []);
    setMoney(mo);
    const { data } = await supabase().from('admin_alerts').select('*').eq('city_id', city.id).eq('resolved', false).order('created_at', { ascending: false }).limit(20);
    setAlerts((data as Alert[]) ?? []);
  }, [city, period]);

  useEffect(() => {
    load();
    const i = setInterval(load, 20_000);
    return () => clearInterval(i);
  }, [load]);

  const total = (f: (k: Kpi) => number) => kpis.reduce((s, k) => s + f(k), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Tableau de bord · {city?.name}</h1>
        <div className="flex gap-1">
          {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`btn-sm ${period === p ? 'bg-ink text-white' : 'bg-surface'}`}>{PERIODS[p]}</button>
          ))}
        </div>
      </div>

      {alerts.length ? (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl bg-[#FDECEA] px-4 py-2 text-sm">
              <span>⚠️ {a.message} · {fmtDate(a.created_at)}</span>
              <button className="btn-sm bg-white" onClick={async () => { await supabase().from('admin_alerts').update({ resolved: true }).eq('id', a.id); load(); }}>Traité</button>
            </div>
          ))}
        </div>
      ) : null}

      <section>
        <h2 className="mb-2 font-bold">En direct par zone</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {live.map((z) => (
            <div key={z.zone_id} className={`card border-l-4 ${z.alert ? 'ring-2 ring-danger' : ''}`} style={{ borderLeftColor: z.color }}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold">{z.name}</h3>
                {z.alert ? <span className="text-sm font-semibold text-danger">Courses en attente, aucun coursier libre</span> : null}
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <Stat label="D’attache en ligne" value={z.online_home} />
                <Stat label="Présents" value={z.online_present} />
                <Stat label="Disponibles" value={z.available} />
                <Stat label="En attente" value={z.waiting_deliveries} />
                <Stat label="En cours" value={z.active_deliveries} />
                <Stat label="Attribution moy." value={z.avg_assign_s_today != null ? `${z.avg_assign_s_today} s` : '—'} />
                <Stat label="Non attribuées (jour)" value={z.unassigned_today} />
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-x-auto">
        <h2 className="mb-2 font-bold">Indicateurs · {PERIODS[period]}</h2>
        <table className="data min-w-[900px]">
          <thead>
            <tr>
              <th>Zone</th><th>Créées</th><th>Livrées</th><th>Non attribuées</th><th>Attribution moy.</th><th>Délai livraison</th>
              <th>Encaissé</th><th>Commission</th><th>Incitations</th><th>Marge réelle</th><th>Attente</th><th>Retards</th><th>Coursiers actifs</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.zone_id}>
                <td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: k.color }} />{k.name}</td>
                <td>{k.created}</td><td>{k.delivered}</td><td>{k.unassigned} ({k.unassigned_rate ?? 0} %)</td>
                <td>{k.avg_assign_s != null ? `${k.avg_assign_s} s` : '—'}</td>
                <td>{k.avg_delivery_min != null ? `${k.avg_delivery_min} min` : '—'}</td>
                <td>{formatMoney(k.revenue, cur)}</td><td>{formatMoney(k.commission, cur)}</td><td>{formatMoney(k.incentives, cur)}</td>
                <td>{k.real_margin_pct != null ? `${k.real_margin_pct} %` : '—'}</td>
                <td>{formatMoney(k.waiting_fees, cur)}</td><td>{k.late_deliveries}</td><td>{k.active_couriers}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total</td><td>{total((k) => k.created)}</td><td>{total((k) => k.delivered)}</td><td>{total((k) => k.unassigned)}</td><td /><td />
              <td>{formatMoney(total((k) => k.revenue), cur)}</td><td>{formatMoney(total((k) => k.commission), cur)}</td>
              <td>{formatMoney(total((k) => k.incentives), cur)}</td><td /><td>{formatMoney(total((k) => k.waiting_fees), cur)}</td>
              <td>{total((k) => k.late_deliveries)}</td><td />
            </tr>
          </tbody>
        </table>
      </section>

      {money ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="card"><p className="label">PÉNALITÉS VS INCITATIONS (MOIS)</p>
            <p className="mt-1 text-xl font-bold">{formatMoney(money.penalties, cur)} / {formatMoney(money.incentives, cur)}</p>
            <p className="text-sm text-muted">{money.penalties >= money.incentives ? 'Les pénalités couvrent les incitations' : 'Les incitations dépassent les pénalités'}</p></div>
          <div className="card"><p className="label">COMMISSIONS DUES VS RÉCUPÉRÉES (MOIS)</p>
            <p className="mt-1 text-xl font-bold">{formatMoney(money.commissions, cur)} / {formatMoney(money.repayments, cur)}</p></div>
          <div className="card"><p className="label">DETTE TOTALE DES COURSIERS</p>
            <p className="mt-1 text-xl font-bold">{formatMoney(money.outstanding, cur)}</p>
            <p className="text-sm text-muted">{money.blocked_couriers} coursier(s) bloqué(s)</p></div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div><dt className="text-[12px] text-muted">{label}</dt><dd className="text-lg font-bold">{value}</dd></div>
  );
}

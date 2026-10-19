'use client';

// Tarification par ville : tous les champs de cities.pricing + aperçu du prix pour 3, 6 et 10 km.
import { useEffect, useMemo, useState } from 'react';
import { computePrice, formatMoney, type PricingParams } from '@koursa/shared';
import { pricingParamsSchema } from '@koursa/shared/schemas';
import { currencyOf, useAdmin } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

type Path = string;
const FIELDS: { section: string; items: [Path, string, string?][] }[] = [
  { section: 'Coût de revient (calibrage)', items: [
    ['fuel_price_per_l', 'Prix du carburant (F/L)'],
    ['fuel_l_per_km', 'Consommation (L/km)'],
    ['wear_per_km', 'Usure + entretien (F/km)'],
    ['courier_hourly_target', 'Rémunération visée du coursier (F/heure)'],
  ] },
  { section: 'Prix client', items: [
    ['margin_rate', 'Marge plateforme (0,18 = 18 %)'],
    ['minimum_price', 'Prix minimum (F)'],
    ['size_coef.small', 'Coefficient Petit'],
    ['size_coef.medium', 'Coefficient Moyen'],
    ['size_coef.large', 'Coefficient Grand'],
    ['included_approach_km', 'Approche incluse (km)'],
    ['time_buffer_min', 'Remise ajoutée au temps (min)'],
    ['rounding', 'Arrondi (F)'],
    ['detour_factor', 'Facteur vol d’oiseau si Google indisponible'],
    ['fallback_speed_kmh', 'Vitesse moyenne de repli (km/h)'],
  ] },
  { section: 'Incitation à la course', items: [
    ['approach_bonus_per_km', 'Bonus par km au-delà de l’approche incluse (F)'],
    ['approach_bonus_cap', 'Plafond par course (F)'],
  ] },
  { section: 'Attente', items: [
    ['waiting.grace_min', 'Minutes offertes'],
    ['waiting.restaurant_grace_min', 'Minutes offertes — restaurant (interne)'],
    ['waiting.fee_per_min', 'Frais par minute (F)'],
    ['waiting.max_billable_min', 'Minutes payantes maximum'],
  ] },
  { section: 'Pénalité de retard (à confirmer après 1 mois)', items: [
    ['late_penalty.factor', 'Délai promis = trajet ×'],
    ['late_penalty.extra_min', '+ minutes'],
    ['late_penalty.per_min', 'Pénalité par minute (F)'],
    ['late_penalty.cap_rate', 'Plafond (part du coursier, 0,3 = 30 %)'],
  ] },
  { section: 'Coursiers & attribution', items: [
    ['block_threshold', 'Seuil de blocage — commission due (F)'],
    ['dispatch.offer_timeout_s', 'Durée d’une offre (s)'],
    ['dispatch.wave_timeout_s', 'Passage à la vague suivante après (s)'],
    ['dispatch.unassigned_after_s', 'Non attribuée après (s)'],
    ['dispatch.overflow_radius_m', 'Rayon de débordement (m)'],
    ['dispatch.location_max_age_s', 'Position valable pendant (s)'],
    ['arrival_radius_m', 'Rayon « Je suis arrivé » (m)'],
    ['restaurant_radius_m', 'Rayon de détection restaurant (m)'],
  ] },
];

function get(o: Record<string, unknown>, p: string): unknown {
  return p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o);
}
function set(o: Record<string, unknown>, p: string, v: unknown): Record<string, unknown> {
  const copy = structuredClone(o);
  const keys = p.split('.');
  let cur = copy as Record<string, unknown>;
  keys.slice(0, -1).forEach((k) => { cur = cur[k] as Record<string, unknown>; });
  cur[keys[keys.length - 1]!] = v;
  return copy;
}

export default function Tarifs() {
  const { city, reloadCities } = useAdmin();
  const cur = currencyOf(city);
  const [p, setP] = useState<Record<string, unknown>>({});
  const [momo, setMomo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (city) {
      setP(city.pricing);
      setMomo(city.merchant_momo_number ?? '');
    }
  }, [city]);

  const parsed = pricingParamsSchema.safeParse(p);
  const preview = useMemo(() => {
    if (!parsed.success) return null;
    const params = parsed.data as PricingParams;
    return [3, 6, 10].map((km) => {
      const duration_s = Math.round((km / params.fallback_speed_kmh) * 3600);
      return { km, small: computePrice(params, { distance_m: km * 1000, duration_s, size: 'small' }), large: computePrice(params, { distance_m: km * 1000, duration_s, size: 'large' }) };
    });
  }, [parsed]);

  async function save() {
    if (!city || !parsed.success) return;
    const { error } = await supabase().from('cities').update({ pricing: parsed.data, merchant_momo_number: momo || null }).eq('id', city.id);
    setMsg(error ? error.message : 'Enregistré. Les nouvelles courses utilisent ces paramètres (les prix déjà figés ne changent pas).');
    if (!error) reloadCities();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tarifs · {city?.name}</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {FIELDS.map((s) => (
            <div key={s.section} className="card space-y-2">
              <h2 className="font-semibold">{s.section}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {s.items.map(([path, label]) => (
                  <label key={path} className="space-y-1">
                    <span className="label block">{label}</span>
                    <input className="input" type="number" step="any" value={String(get(p, path) ?? '')}
                      onChange={(e) => setP(set(p, path, e.target.value === '' ? '' : Number(e.target.value)))} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="card space-y-2">
            <h2 className="font-semibold">Divers</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!p.allow_dropoff_outside} onChange={(e) => setP(set(p, 'allow_dropoff_outside', e.target.checked))} />
              Autoriser une livraison hors zone
            </label>
            <label className="space-y-1">
              <span className="label block">Numéro marchand mobile money (remboursement des commissions)</span>
              <input className="input" value={momo} onChange={(e) => setMomo(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="card space-y-2">
            <h2 className="font-semibold">Aperçu du prix</h2>
            {preview ? (
              <>
                <p className="text-sm text-muted">Coût moto : {preview[0]?.small.moto_cost_per_km.toFixed(1)} F/km · durée estimée à la vitesse de repli</p>
                {preview.map((r) => (
                  <div key={r.km} className="flex justify-between rounded-lg bg-surface px-3 py-2">
                    <span>{r.km} km</span>
                    <span><b>{formatMoney(r.small.price, cur)}</b> <span className="text-sm text-muted">· Grand {formatMoney(r.large.price, cur)}</span></span>
                  </div>
                ))}
                <p className="text-xs text-muted">Part coursier sur 6 km : {formatMoney(preview[1]?.small.courier_share ?? 0, cur)}</p>
              </>
            ) : (
              <p className="text-sm text-danger">Paramètres invalides : {parsed.error?.issues[0]?.path.join('.')} — {parsed.error?.issues[0]?.message}</p>
            )}
          </div>
          <button className="btn-primary w-full" disabled={!parsed.success} onClick={save}>Enregistrer les tarifs</button>
          {msg ? <p className="text-sm">{msg}</p> : null}
        </div>
      </div>
    </div>
  );
}

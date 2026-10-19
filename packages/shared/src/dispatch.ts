/**
 * Attribution par vagues — docs/ZONES.md. Version pure (testée) de la logique
 * implémentée en SQL dans dispatch_tick() (supabase/migrations).
 */
import { haversineMeters, type DispatchParams } from './pricing.ts';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DispatchCourier {
  id: string;
  home_zone_id: string | null;
  /** Zone où se trouve le coursier (zone_of de sa position), null si hors zone. */
  current_zone_id: string | null;
  position: LatLng;
  online: boolean;
  validated: boolean;
  blocked: boolean;
  busy: boolean;
  last_seen_at: number;
}

export interface DispatchOffer {
  courier_id: string;
  sent_at: number;
  response: 'pending' | 'accepted' | 'declined' | 'expired';
}

export interface DispatchDelivery {
  pickup: LatLng;
  pickup_zone_id: string;
  allow_overflow: boolean;
  search_started_at: number;
  wave: 1 | 2 | 3;
  wave_started_at: number;
}

export type DispatchDecision =
  | { type: 'unassign' }
  | { type: 'wait'; until: number }
  | { type: 'offer'; courier_id: string; wave: 1 | 2 | 3; wave_started_at: number; distance_m: number }
  | { type: 'idle' };

export function isAvailable(c: DispatchCourier, now: number, p: DispatchParams): boolean {
  return (
    c.validated &&
    !c.blocked &&
    c.online &&
    !c.busy &&
    now - c.last_seen_at <= p.location_max_age_s * 1000
  );
}

/** Candidats d'une vague, du plus proche au plus loin (vol d'oiseau, pas d'appel Google). */
export function waveCandidates(
  wave: 1 | 2 | 3,
  d: DispatchDelivery,
  couriers: DispatchCourier[],
  now: number,
  p: DispatchParams,
): { courier: DispatchCourier; distance_m: number }[] {
  const z = d.pickup_zone_id;
  return couriers
    .filter((c) => isAvailable(c, now, p))
    .map((c) => ({ courier: c, distance_m: haversineMeters(c.position, d.pickup) }))
    .filter(({ courier: c, distance_m }) => {
      if (wave === 1) return c.home_zone_id === z && c.current_zone_id === z;
      if (wave === 2) return c.current_zone_id === z;
      return d.allow_overflow && c.current_zone_id !== z && distance_m <= p.overflow_radius_m;
    })
    .sort((a, b) => a.distance_m - b.distance_m);
}

/**
 * Décide la prochaine action pour une course en recherche.
 * - offre en cours non expirée → attendre ;
 * - 3 min sans preneur → unassigned ;
 * - sinon, prochain candidat jamais sollicité dans la vague courante,
 *   passage à la vague suivante si elle est épuisée ou après 90 s,
 *   et rattrapage des vagues précédentes (coursiers qui viennent de se connecter).
 */
export function dispatchStep(
  d: DispatchDelivery,
  couriers: DispatchCourier[],
  offers: DispatchOffer[],
  now: number,
  p: DispatchParams,
): DispatchDecision {
  if (now - d.search_started_at >= p.unassigned_after_s * 1000) return { type: 'unassign' };

  const pending = offers.find(
    (o) => o.response === 'pending' && now - o.sent_at < p.offer_timeout_s * 1000,
  );
  if (pending) return { type: 'wait', until: pending.sent_at + p.offer_timeout_s * 1000 };

  const contacted = new Set(offers.map((o) => o.courier_id));
  const fresh = (w: 1 | 2 | 3) =>
    waveCandidates(w, d, couriers, now, p).filter((c) => !contacted.has(c.courier.id));

  let wave = d.wave;
  let waveStartedAt = d.wave_started_at;
  while (true) {
    const timedOut = now - waveStartedAt >= p.wave_timeout_s * 1000;
    const list = timedOut && wave < 3 ? [] : fresh(wave);
    const first = list[0];
    if (first) {
      return {
        type: 'offer',
        courier_id: first.courier.id,
        wave,
        wave_started_at: waveStartedAt,
        distance_m: first.distance_m,
      };
    }
    if (wave === 3) break;
    wave = (wave + 1) as 2 | 3;
    waveStartedAt = now;
  }

  for (const w of [1, 2] as const) {
    const first = fresh(w)[0];
    if (first) {
      return { type: 'offer', courier_id: first.courier.id, wave: 3, wave_started_at: waveStartedAt, distance_m: first.distance_m };
    }
  }
  return { type: 'idle' };
}

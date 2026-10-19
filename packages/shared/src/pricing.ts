/**
 * Tarification au km, garantie — docs/MVP.md section 5.
 * Fichier sans dépendance : il est aussi copié dans supabase/functions/_shared/core
 * (scripts/sync-shared.mjs) pour que les Edge Functions utilisent exactement la même formule.
 */

export type PackageSize = 'small' | 'medium' | 'large';

/** Paramètres stockés dans `cities.pricing` (JSON), modifiables dans l'admin. */
export interface PricingParams {
  /** Prix du carburant (devise locale / litre). */
  fuel_price_per_l: number;
  /** Consommation de la moto (litres / km). */
  fuel_l_per_km: number;
  /** Usure + entretien (devise / km). */
  wear_per_km: number;
  /** Rémunération visée du coursier (devise / heure). */
  courier_hourly_target: number;
  /** Marge plateforme (0,18 = 18 %). */
  margin_rate: number;
  /** Prix minimum d'une course. */
  minimum_price: number;
  size_coef: Record<PackageSize, number>;
  /** Approche incluse dans le prix (km). */
  included_approach_km: number;
  /** Remise en minutes ajoutée au temps de trajet. */
  time_buffer_min: number;
  /** Arrondi à la centaine supérieure → 100. */
  rounding: number;
  /** Facteur appliqué à la distance à vol d'oiseau quand Google ne répond pas. */
  detour_factor: number;
  /** Vitesse moyenne (km/h) utilisée pour estimer la durée en mode dégradé. */
  fallback_speed_kmh: number;
  approach_bonus_per_km: number;
  approach_bonus_cap: number;
  waiting: WaitingParams;
  late_penalty: LatePenaltyParams;
  /** Seuil de dette au-delà duquel un coursier est bloqué. */
  block_threshold: number;
  allow_dropoff_outside: boolean;
  dispatch: DispatchParams;
  /** Rayon (m) pour valider « Je suis arrivé ». */
  arrival_radius_m: number;
  /** Rayon (m) pour détecter un restaurant près d'une épingle manuelle. */
  restaurant_radius_m: number;
}

export interface WaitingParams {
  grace_min: number;
  restaurant_grace_min: number;
  fee_per_min: number;
  max_billable_min: number;
}

export interface LatePenaltyParams {
  factor: number;
  extra_min: number;
  per_min: number;
  cap_rate: number;
}

export interface DispatchParams {
  offer_timeout_s: number;
  wave_timeout_s: number;
  unassigned_after_s: number;
  overflow_radius_m: number;
  location_max_age_s: number;
}

/** Valeurs de lancement pour Lomé (reprises dans supabase/seed.sql). */
export const DEFAULT_PRICING: PricingParams = {
  fuel_price_per_l: 680,
  fuel_l_per_km: 0.04,
  wear_per_km: 67.8,
  courier_hourly_target: 1200,
  margin_rate: 0.18,
  minimum_price: 700,
  size_coef: { small: 1, medium: 1.2, large: 1.5 },
  included_approach_km: 2,
  time_buffer_min: 5,
  rounding: 100,
  detour_factor: 1.3,
  fallback_speed_kmh: 22,
  approach_bonus_per_km: 95,
  approach_bonus_cap: 500,
  waiting: { grace_min: 5, restaurant_grace_min: 15, fee_per_min: 50, max_billable_min: 15 },
  late_penalty: { factor: 1.5, extra_min: 10, per_min: 50, cap_rate: 0.3 },
  block_threshold: 5000,
  allow_dropoff_outside: false,
  dispatch: {
    offer_timeout_s: 20,
    wave_timeout_s: 90,
    unassigned_after_s: 180,
    overflow_radius_m: 3000,
    location_max_age_s: 120,
  },
  arrival_radius_m: 100,
  restaurant_radius_m: 50,
};

export interface PriceInput {
  distance_m: number;
  duration_s: number;
  size: PackageSize;
}

export interface PriceBreakdown {
  /** Coût moto par km (consommation × carburant + usure). */
  moto_cost_per_km: number;
  distance_km: number;
  billed_km: number;
  billed_min: number;
  distance_cost: number;
  time_cost: number;
  base_cost: number;
  before_minimum: number;
  after_minimum: number;
  size_coef: number;
  /** Prix final, entier, arrondi à la centaine supérieure. */
  price: number;
  /** Part plateforme sur le prix (entier). */
  commission: number;
  /** Part coursier sur le prix (entier). */
  courier_share: number;
}

/** Arrondi à `step` supérieur, sans être piégé par les imprécisions flottantes. */
export function roundUpTo(value: number, step: number): number {
  const cents = Math.round(value * 100) / 100;
  return Math.ceil(cents / step) * step;
}

export function motoCostPerKm(p: PricingParams): number {
  return p.fuel_l_per_km * p.fuel_price_per_l + p.wear_per_km;
}

export function computePrice(p: PricingParams, input: PriceInput): PriceBreakdown {
  if (input.distance_m < 0 || input.duration_s < 0) throw new Error('distance/durée négative');
  const costKm = motoCostPerKm(p);
  const distanceKm = input.distance_m / 1000;
  const billedKm = distanceKm + p.included_approach_km;
  const billedMin = input.duration_s / 60 + p.time_buffer_min;
  const distanceCost = billedKm * costKm;
  const timeCost = billedMin * (p.courier_hourly_target / 60);
  const baseCost = distanceCost + timeCost;
  const beforeMinimum = baseCost / (1 - p.margin_rate);
  const afterMinimum = Math.max(beforeMinimum, p.minimum_price);
  const coef = p.size_coef[input.size];
  const price = roundUpTo(afterMinimum * coef, p.rounding);
  const commission = commissionOf(price, p.margin_rate);
  return {
    moto_cost_per_km: costKm,
    distance_km: distanceKm,
    billed_km: billedKm,
    billed_min: billedMin,
    distance_cost: distanceCost,
    time_cost: timeCost,
    base_cost: baseCost,
    before_minimum: beforeMinimum,
    after_minimum: afterMinimum,
    size_coef: coef,
    price,
    commission,
    courier_share: price - commission,
  };
}

/** Commission plateforme sur un montant (entier, arrondi au franc). */
export function commissionOf(amount: number, marginRate: number): number {
  return Math.round(amount * marginRate);
}

/** Distance à vol d'oiseau en mètres (haversine). */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Itinéraire dégradé quand Google Routes ne répond pas : vol d'oiseau × 1,3. */
export function fallbackRoute(
  p: Pick<PricingParams, 'detour_factor' | 'fallback_speed_kmh'>,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): { distance_m: number; duration_s: number } {
  const distance = Math.round(haversineMeters(from, to) * p.detour_factor);
  const duration = Math.round((distance / 1000 / p.fallback_speed_kmh) * 3600);
  return { distance_m: distance, duration_s: duration };
}

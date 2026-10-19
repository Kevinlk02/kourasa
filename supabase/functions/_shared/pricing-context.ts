/** Devis commun à `quote` et `create-delivery` : zones (PostGIS) + itinéraire + formule partagée. */
import { admin, type CityRow } from './supabase.ts';
import { HttpError } from './http.ts';
import { route, type LatLng } from './google.ts';
import { computePrice, type PackageSize, type PricingParams } from './core/pricing.ts';

export interface QuoteContext {
  params: PricingParams;
  pickupZone: { id: string; name: string };
  dropoffZone: { id: string; name: string } | null;
  distance_m: number;
  duration_s: number;
  degraded: boolean;
  price: number;
  commission: number;
  courier_share: number;
}

async function zoneOf(cityId: string, p: LatLng): Promise<{ id: string; name: string } | null> {
  const { data: id, error } = await admin.rpc('zone_of_latlng', { p_city_id: cityId, p_lat: p.lat, p_lng: p.lng });
  if (error) throw error;
  if (!id) return null;
  const { data } = await admin.from('zones').select('id, name').eq('id', id).single();
  return data;
}

export async function buildQuote(
  userId: string, city: CityRow, pickup: LatLng, dropoff: LatLng, size: PackageSize,
): Promise<QuoteContext> {
  const params = city.pricing as unknown as PricingParams;
  const [pickupZone, dropoffZone] = await Promise.all([zoneOf(city.id, pickup), zoneOf(city.id, dropoff)]);
  if (!pickupZone || (!dropoffZone && !params.allow_dropoff_outside)) {
    throw new HttpError(422, 'not_served', 'Nous ne livrons pas encore ici', {
      point: !pickupZone ? 'pickup' : 'dropoff',
    });
  }
  const r = await route(userId, pickup, dropoff, params);
  const price = computePrice(params, { distance_m: r.distance_m, duration_s: r.duration_s, size });
  return {
    params,
    pickupZone,
    dropoffZone,
    distance_m: r.distance_m,
    duration_s: r.duration_s,
    degraded: r.degraded,
    price: price.price,
    commission: price.commission,
    courier_share: price.courier_share,
  };
}

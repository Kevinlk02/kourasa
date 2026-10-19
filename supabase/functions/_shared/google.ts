/**
 * Couche Google Maps Platform — docs/GOOGLE_MAPS.md.
 * Clé serveur uniquement ici (secret Supabase). Cache `geo_cache`, journal `geo_calls_log`,
 * délai de 5 s, et réponse dégradée propre si Google ne répond pas.
 */
import { admin } from './supabase.ts';
import { fetchWithTimeout } from './http.ts';
import { fallbackRoute, type PricingParams } from './core/pricing.ts';

const KEY = Deno.env.get('GOOGLE_MAPS_SERVER_KEY') ?? '';
const PLACE_TTL_S = 30 * 24 * 3600;
const ROUTE_TTL_S = 10 * 60;

export const RESTAURANT_TYPES = [
  'restaurant', 'cafe', 'bar', 'meal_takeaway', 'meal_delivery', 'bakery',
  'fast_food_restaurant', 'coffee_shop', 'food_court', 'pizza_restaurant', 'sandwich_shop',
];

export interface LatLng { lat: number; lng: number }

async function cacheGet<T>(key: string): Promise<T | null> {
  const { data } = await admin.from('geo_cache').select('value, expires_at').eq('key', key).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.value as T;
}

async function cacheSet(key: string, value: unknown, ttlS: number): Promise<void> {
  await admin.from('geo_cache').upsert({ key, value, expires_at: new Date(Date.now() + ttlS * 1000).toISOString() });
}

async function logCall(api: string, userId: string | null, cacheHit: boolean, ok: boolean, latencyMs: number | null) {
  await admin.from('geo_calls_log').insert({ api, user_id: userId, cache_hit: cacheHit, ok, latency_ms: latencyMs });
}

async function googleFetch(api: string, userId: string | null, url: string, init: RequestInit): Promise<unknown> {
  if (!KEY) throw new Error('GOOGLE_MAPS_SERVER_KEY manquante');
  const t0 = Date.now();
  let ok = false;
  try {
    const res = await fetchWithTimeout(url, init, 5000);
    const body = await res.json();
    ok = res.ok;
    if (!res.ok) throw new Error(`${api} ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  } finally {
    await logCall(api, userId, false, ok, Date.now() - t0);
  }
}

const roundKey = (n: number) => n.toFixed(5);

// ---------------------------------------------------------------------------
// Autocomplete (Places API New)
// ---------------------------------------------------------------------------
export interface Suggestion { place_id: string; main: string; secondary: string }

export async function autocomplete(
  userId: string, input: string, sessionToken: string, region: string, center: LatLng,
): Promise<Suggestion[]> {
  const key = `ac:${region}:${input.toLowerCase().replace(/\s+/g, ' ').trim()}`;
  const cached = await cacheGet<Suggestion[]>(key);
  if (cached) {
    await logCall('autocomplete', userId, true, true, null);
    return cached;
  }
  const body = (await googleFetch('autocomplete', userId, 'https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY },
    body: JSON.stringify({
      input,
      sessionToken,
      languageCode: 'fr',
      includedRegionCodes: [region],
      locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 15000 } },
    }),
  })) as { suggestions?: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[] };
  const out = (body.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      place_id: p.placeId,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }));
  await cacheSet(key, out, 24 * 3600);
  return out;
}

// ---------------------------------------------------------------------------
// Place Details (masque de champs minimal)
// ---------------------------------------------------------------------------
export interface PlaceDetails { place_id: string; lat: number; lng: number; name: string; address: string; types: string[] }

export async function placeDetails(userId: string | null, placeId: string, sessionToken?: string): Promise<PlaceDetails> {
  const key = `pd:${placeId}`;
  const cached = await cacheGet<PlaceDetails>(key);
  if (cached) {
    await logCall('place_details', userId, true, true, null);
    return cached;
  }
  const qs = new URLSearchParams({ languageCode: 'fr' });
  if (sessionToken) qs.set('sessionToken', sessionToken);
  const body = (await googleFetch('place_details', userId, `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${qs}`, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'id,location,displayName,types,formattedAddress' },
  })) as { location: { latitude: number; longitude: number }; displayName?: { text: string }; types?: string[]; formattedAddress?: string };
  const out: PlaceDetails = {
    place_id: placeId,
    lat: body.location.latitude,
    lng: body.location.longitude,
    name: body.displayName?.text ?? '',
    address: body.formattedAddress ?? '',
    types: body.types ?? [],
  };
  await cacheSet(key, out, PLACE_TTL_S);
  return out;
}

// ---------------------------------------------------------------------------
// Reverse geocoding (épingle posée à la main)
// ---------------------------------------------------------------------------
export async function reverseGeocode(userId: string, p: LatLng): Promise<{ label: string }> {
  const key = `rg:${roundKey(p.lat)},${roundKey(p.lng)}`;
  const cached = await cacheGet<{ label: string }>(key);
  if (cached) {
    await logCall('reverse_geocode', userId, true, true, null);
    return cached;
  }
  try {
    const body = (await googleFetch('reverse_geocode', userId,
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&language=fr&key=${KEY}`, {})) as
      { results?: { formatted_address: string }[] };
    const out = { label: body.results?.[0]?.formatted_address ?? '' };
    await cacheSet(key, out, PLACE_TTL_S);
    return out;
  } catch (e) {
    console.error(e);
    return { label: '' };
  }
}

// ---------------------------------------------------------------------------
// Restaurant à moins de 50 m (Nearby Search) — seulement à la commande
// ---------------------------------------------------------------------------
export async function nearbyRestaurant(userId: string, p: LatLng, radiusM: number): Promise<{ place_id: string; name: string; types: string[] } | null> {
  const key = `nb:${roundKey(p.lat)},${roundKey(p.lng)},${radiusM}`;
  const cached = await cacheGet<{ hit: { place_id: string; name: string; types: string[] } | null }>(key);
  if (cached) {
    await logCall('nearby', userId, true, true, null);
    return cached.hit;
  }
  try {
    const body = (await googleFetch('nearby', userId, 'https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.types' },
      body: JSON.stringify({
        includedTypes: ['restaurant', 'cafe', 'bar', 'meal_takeaway', 'bakery'],
        maxResultCount: 1,
        rankPreference: 'DISTANCE',
        locationRestriction: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: radiusM } },
      }),
    })) as { places?: { id: string; displayName?: { text: string }; types?: string[] }[] };
    const first = body.places?.[0];
    const hit = first ? { place_id: first.id, name: first.displayName?.text ?? '', types: first.types ?? [] } : null;
    await cacheSet(key, { hit }, PLACE_TTL_S);
    return hit;
  } catch (e) {
    console.error(e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Itinéraire (Routes API) : deux-roues si disponible, sinon voiture, sinon vol d'oiseau × 1,3
// ---------------------------------------------------------------------------
export interface RouteResult { distance_m: number; duration_s: number; degraded: boolean }

export async function route(
  userId: string | null, from: LatLng, to: LatLng,
  p: Pick<PricingParams, 'detour_factor' | 'fallback_speed_kmh'>,
): Promise<RouteResult> {
  const key = `rt:${roundKey(from.lat)},${roundKey(from.lng)}>${roundKey(to.lat)},${roundKey(to.lng)}`;
  const cached = await cacheGet<RouteResult>(key);
  if (cached) {
    await logCall('routes', userId, true, true, null);
    return cached;
  }
  for (const travelMode of ['TWO_WHEELER', 'DRIVE']) {
    try {
      const body = (await googleFetch('routes', userId, 'https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
          destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
          travelMode,
          // Trafic moyen : pas de trafic en temps réel dans le prix (MVP §5).
          routingPreference: 'TRAFFIC_UNAWARE',
          languageCode: 'fr',
        }),
      })) as { routes?: { distanceMeters?: number; duration?: string }[] };
      const r = body.routes?.[0];
      if (r?.distanceMeters != null && r.duration) {
        const out = { distance_m: r.distanceMeters, duration_s: parseInt(r.duration, 10), degraded: false };
        await cacheSet(key, out, ROUTE_TTL_S);
        return out;
      }
    } catch (e) {
      console.error('routes', travelMode, e);
    }
  }
  return { ...fallbackRoute(p, from, to), degraded: true };
}

export function isRestaurantTypes(types: string[]): boolean {
  return types.some((t) => RESTAURANT_TYPES.includes(t));
}

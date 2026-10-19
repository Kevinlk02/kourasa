// Tests de la couche Google avec Google SIMULÉ (aucun appel réel, aucune base requise).
// Lancer : deno test --allow-env --allow-net --config supabase/functions/deno.json supabase/functions/tests/
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:9');
Deno.env.set('SUPABASE_ANON_KEY', 'test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test');
Deno.env.set('GOOGLE_MAPS_SERVER_KEY', 'fake-key');

const realFetch = globalThis.fetch;
let googleCalls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
let mode: 'ok' | 'down' | 'two_wheeler_unsupported' = 'ok';

globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('http://127.0.0.1:9')) {
    // Supabase injoignable : le cache répond « vide », le journal est ignoré.
    return new Response(JSON.stringify({ message: 'offline' }), { status: 503 });
  }
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  googleCalls.push({ url, body, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
  if (mode === 'down') throw new TypeError('network down');
  if (url.includes('computeRoutes')) {
    if (mode === 'two_wheeler_unsupported' && body.travelMode === 'TWO_WHEELER') {
      return new Response(JSON.stringify({ error: { message: 'unsupported' } }), { status: 400 });
    }
    return Response.json({ routes: [{ distanceMeters: 6000, duration: '1080s' }] });
  }
  if (url.includes('places:autocomplete')) {
    return Response.json({ suggestions: [{ placePrediction: { placeId: 'p1', structuredFormat: { mainText: { text: 'Grand Marché' }, secondaryText: { text: 'Lomé' } } } }] });
  }
  if (url.includes('places/')) {
    return Response.json({ location: { latitude: 6.13, longitude: 1.22 }, displayName: { text: 'Chez Tantie' }, types: ['restaurant', 'food'], formattedAddress: 'Lomé' });
  }
  return realFetch(input, init);
}) as typeof fetch;

const { route, autocomplete, placeDetails, isRestaurantTypes } = await import('../_shared/google.ts');
const { DEFAULT_PRICING, computePrice } = await import('../_shared/core/pricing.ts');

function assertEquals<T>(a: T, b: T, msg?: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ?? 'assert'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

const A = { lat: 6.1315, lng: 1.2225 };
const B = { lat: 6.23, lng: 1.21 };

Deno.test('route : deux-roues, trafic moyen, masque de champs minimal', async () => {
  mode = 'ok'; googleCalls = [];
  const r = await route('u1', A, B, DEFAULT_PRICING);
  assertEquals(r, { distance_m: 6000, duration_s: 1080, degraded: false });
  const call = googleCalls[0]!;
  assertEquals((call.body as { travelMode: string }).travelMode, 'TWO_WHEELER');
  assertEquals((call.body as { routingPreference: string }).routingPreference, 'TRAFFIC_UNAWARE');
  assertEquals(call.headers['x-goog-fieldmask'], 'routes.distanceMeters,routes.duration');
  // Le prix serveur sur cet itinéraire : 1 500 F (même formule que les tests de packages/shared)
  assertEquals(computePrice(DEFAULT_PRICING, { ...r, size: 'small' }).price, 1500);
});

Deno.test('route : repli voiture si deux-roues indisponible', async () => {
  mode = 'two_wheeler_unsupported'; googleCalls = [];
  const r = await route('u1', A, { lat: 6.2301, lng: 1.2101 }, DEFAULT_PRICING);
  assertEquals(r.degraded, false);
  assertEquals(googleCalls.map((c) => (c.body as { travelMode: string }).travelMode), ['TWO_WHEELER', 'DRIVE']);
});

Deno.test('route : Google en panne → vol d’oiseau × 1,3 (réponse dégradée)', async () => {
  mode = 'down';
  const r = await route('u1', A, { lat: 6.2302, lng: 1.2102 }, DEFAULT_PRICING);
  assertEquals(r.degraded, true);
  if (r.distance_m < 14000 || r.distance_m > 15500) throw new Error(`distance dégradée inattendue ${r.distance_m}`);
});

Deno.test('autocomplete : restreint au pays, biaisé sur la ville, session token', async () => {
  mode = 'ok'; googleCalls = [];
  const s = await autocomplete('u1', 'grand marché', 'tok-12345678', 'tg', { lat: 6.1375, lng: 1.2123 });
  assertEquals(s, [{ place_id: 'p1', main: 'Grand Marché', secondary: 'Lomé' }]);
  const b = googleCalls[0]!.body as { includedRegionCodes: string[]; sessionToken: string; locationBias: { circle: { radius: number } } };
  assertEquals(b.includedRegionCodes, ['tg']);
  assertEquals(b.sessionToken, 'tok-12345678');
  assertEquals(b.locationBias.circle.radius, 15000);
});

Deno.test('place details : champs limités + détection restaurant', async () => {
  mode = 'ok'; googleCalls = [];
  const d = await placeDetails('u1', 'p1', 'tok-12345678');
  assertEquals(googleCalls[0]!.headers['x-goog-fieldmask'], 'id,location,displayName,types,formattedAddress');
  assertEquals(isRestaurantTypes(d.types), true);
  assertEquals(isRestaurantTypes(['pharmacy']), false);
});

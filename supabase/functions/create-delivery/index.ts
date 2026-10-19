/**
 * Création d'une course : tout est recalculé côté serveur (zones, itinéraire, prix figé,
 * tolérance d'attente restaurant), puis la recherche de coursier démarre.
 */
import { handler, HttpError } from '../_shared/http.ts';
import { admin, loadCity, rateLimit, requireUser } from '../_shared/supabase.ts';
import { isRestaurantTypes, nearbyRestaurant, placeDetails } from '../_shared/google.ts';
import { buildQuote } from '../_shared/pricing-context.ts';
import { sendSms } from '../_shared/sms.ts';
import { createDeliveryRequestSchema, type PlaceInput } from '../_shared/core/schemas.ts';

const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:3000';

function fourDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0]! % 10000).padStart(4, '0');
}

/** Détection restaurant : 1) types Google du lieu choisi, 2) restaurant à < 50 m d'une épingle, 3) table venues. */
async function detectRestaurant(userId: string, cityId: string, place: PlaceInput, radiusM: number) {
  // 3) venues validés (admin / signalements coursiers) — prioritaire, gratuit
  const { data: venues } = await admin.rpc('venue_near', { p_city: cityId, p_lat: place.point.lat, p_lng: place.point.lng, p_radius_m: radiusM, p_place_id: place.place_id ?? null });
  const venue = (venues as { id: string; is_restaurant: boolean }[] | null)?.[0];
  if (venue) return { isRestaurant: venue.is_restaurant, types: [] as string[], venueId: venue.id };

  if (place.place_id) {
    try {
      const d = await placeDetails(userId, place.place_id, place.session_token ?? undefined);
      return { isRestaurant: isRestaurantTypes(d.types), types: d.types, venueId: null };
    } catch (e) {
      console.error(e);
    }
  } else if (place.manual_pin) {
    const hit = await nearbyRestaurant(userId, place.point, radiusM);
    if (hit) return { isRestaurant: true, types: hit.types, venueId: null };
  }
  return { isRestaurant: false, types: [] as string[], venueId: null };
}

async function rememberPlace(userId: string, place: PlaceInput) {
  const { data: existing } = await admin.rpc('saved_place_near', {
    p_user: userId, p_lat: place.point.lat, p_lng: place.point.lng, p_place_id: place.place_id ?? null,
  });
  const row = (existing as { id: string; use_count: number }[] | null)?.[0];
  if (row) {
    await admin.from('saved_places').update({
      use_count: row.use_count + 1, last_used_at: new Date().toISOString(), landmark: place.landmark,
    }).eq('id', row.id);
  } else {
    await admin.from('saved_places').insert({
      user_id: userId, lat: place.point.lat, lng: place.point.lng, address: place.address,
      landmark: place.landmark, place_id: place.place_id ?? null, label: place.address.split(',')[0] ?? '',
    });
  }
}

Deno.serve(handler(createDeliveryRequestSchema, async (input, req) => {
  const user = await requireUser(req);
  await rateLimit(user.id, 'create_delivery', 10);
  const city = await loadCity(input.city_id);

  const { count } = await admin.from('deliveries').select('id', { count: 'exact', head: true })
    .eq('client_id', user.id).in('status', ['pending', 'searching']);
  if ((count ?? 0) >= 3) throw new HttpError(429, 'too_many_active', 'Vous avez déjà 3 courses en recherche');

  const q = await buildQuote(user.id, city, input.pickup.point, input.dropoff.point, input.size);
  if (q.price !== input.expected_price) {
    throw new HttpError(409, 'price_changed', 'Le prix a changé, vérifiez le nouveau montant.', { price: q.price });
  }

  const [pickupInfo, dropoffTypes] = await Promise.all([
    detectRestaurant(user.id, city.id, input.pickup, q.params.restaurant_radius_m),
    input.dropoff.place_id
      ? placeDetails(user.id, input.dropoff.place_id, input.dropoff.session_token ?? undefined).then((d) => d.types).catch(() => [] as string[])
      : Promise.resolve([] as string[]),
  ]);
  const w = q.params.waiting;

  const { data: delivery, error } = await admin.from('deliveries').insert({
    client_id: user.id,
    city_id: city.id,
    status: 'pending',
    pickup_lat: input.pickup.point.lat,
    pickup_lng: input.pickup.point.lng,
    pickup_address: input.pickup.address,
    pickup_landmark: input.pickup.landmark,
    pickup_place_id: input.pickup.place_id ?? null,
    pickup_zone_id: q.pickupZone.id,
    dropoff_lat: input.dropoff.point.lat,
    dropoff_lng: input.dropoff.point.lng,
    dropoff_address: input.dropoff.address,
    dropoff_landmark: input.dropoff.landmark,
    dropoff_place_id: input.dropoff.place_id ?? null,
    dropoff_zone_id: q.dropoffZone?.id ?? null,
    recipient_name: input.recipient_name,
    recipient_phone: input.recipient_phone,
    size: input.size,
    payer: input.payer,
    note: input.note ?? null,
    distance_m: q.distance_m,
    duration_s: q.duration_s,
    price_locked: q.price,
    currency: city.currency,
  }).select('id, tracking_token').single();
  if (error || !delivery) throw error ?? new Error('insert delivery');

  const code = fourDigitCode();
  const { data: codeHash, error: hashErr } = await admin.rpc('hash_code', { p_code: code });
  if (hashErr) throw hashErr;

  const { error: privErr } = await admin.from('delivery_private').insert({
    delivery_id: delivery.id,
    // Jamais renvoyé au client : la règle restaurant est interne.
    pickup_grace_min: pickupInfo.isRestaurant ? w.restaurant_grace_min : w.grace_min,
    dropoff_grace_min: w.grace_min,
    pickup_is_restaurant: pickupInfo.isRestaurant,
    pickup_types: pickupInfo.types,
    dropoff_types: dropoffTypes,
    pickup_venue_id: pickupInfo.venueId,
    code_hash: codeHash,
    courier_share: q.courier_share,
    degraded_route: q.degraded,
  });
  if (privErr) throw privErr;

  await Promise.all([rememberPlace(user.id, input.pickup), rememberPlace(user.id, input.dropoff)]);

  const { error: searchErr } = await admin.rpc('start_search', { p_delivery: delivery.id });
  if (searchErr) throw searchErr;

  const link = `${SITE_URL}/t/${delivery.tracking_token}`;
  const sent = await sendSms(input.recipient_phone,
    `Koursa : un colis arrive pour vous. Code de réception : ${code} (à donner au coursier). Suivi : ${link}`, delivery.id);
  if (sent) await admin.from('delivery_private').update({ code_sms_sent_at: new Date().toISOString() }).eq('delivery_id', delivery.id);

  return {
    delivery_id: delivery.id,
    tracking_token: delivery.tracking_token,
    price: q.price,
    currency: city.currency,
    sms_sent: sent,
  };
}));

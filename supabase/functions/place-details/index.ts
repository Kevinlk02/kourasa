import { handler, HttpError } from '../_shared/http.ts';
import { admin, rateLimit, requireUser } from '../_shared/supabase.ts';
import { isRestaurantTypes, placeDetails } from '../_shared/google.ts';
import { placeDetailsRequestSchema } from '../_shared/core/schemas.ts';

Deno.serve(handler(placeDetailsRequestSchema, async (input, req) => {
  const user = await requireUser(req);
  await rateLimit(user.id, 'place_details', 30);
  try {
    const d = await placeDetails(user.id, input.place_id, input.session_token);
    const { data: venue } = await admin.from('venues').select('is_restaurant')
      .eq('place_id', input.place_id).eq('validated', true).maybeSingle();
    return {
      lat: d.lat,
      lng: d.lng,
      name: d.name,
      address: d.address,
      types: d.types,
      isRestaurant: venue ? venue.is_restaurant : isRestaurantTypes(d.types),
    };
  } catch (e) {
    console.error(e);
    throw new HttpError(503, 'google_unavailable', 'Recherche indisponible : placez l\'épingle sur la carte');
  }
}));

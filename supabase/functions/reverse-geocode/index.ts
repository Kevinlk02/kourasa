import { handler } from '../_shared/http.ts';
import { rateLimit, requireUser } from '../_shared/supabase.ts';
import { reverseGeocode } from '../_shared/google.ts';
import { reverseGeocodeRequestSchema } from '../_shared/core/schemas.ts';

Deno.serve(handler(reverseGeocodeRequestSchema, async (input, req) => {
  const user = await requireUser(req);
  await rateLimit(user.id, 'reverse_geocode', 30);
  return await reverseGeocode(user.id, input);
}));

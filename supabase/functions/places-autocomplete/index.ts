import { handler } from '../_shared/http.ts';
import { loadCity, rateLimit, requireUser } from '../_shared/supabase.ts';
import { autocomplete } from '../_shared/google.ts';
import { autocompleteRequestSchema } from '../_shared/core/schemas.ts';

Deno.serve(handler(autocompleteRequestSchema, async (input, req) => {
  const user = await requireUser(req);
  await rateLimit(user.id, 'autocomplete', 60);
  const city = await loadCity(input.city_id);
  try {
    const suggestions = await autocomplete(user.id, input.input, input.session_token, city.google_region,
      { lat: city.center_lat, lng: city.center_lng });
    return { suggestions };
  } catch (e) {
    console.error(e);
    // Réponse dégradée : l'app propose alors l'épingle sur la carte.
    return { suggestions: [], degraded: true };
  }
}));

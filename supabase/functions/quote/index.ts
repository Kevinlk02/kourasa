// Devis : vérifie la couverture (zone_of) et calcule le prix avec la formule partagée.
import { handler } from '../_shared/http.ts';
import { loadCity, rateLimit, requireUser } from '../_shared/supabase.ts';
import { buildQuote } from '../_shared/pricing-context.ts';
import { quoteRequestSchema } from '../_shared/core/schemas.ts';

Deno.serve(handler(quoteRequestSchema, async (input, req) => {
  const user = await requireUser(req);
  await rateLimit(user.id, 'quote', 30);
  const city = await loadCity(input.city_id);
  const q = await buildQuote(user.id, city, input.pickup, input.dropoff, input.size);
  return {
    price: q.price,
    currency: city.currency,
    distance_m: q.distance_m,
    duration_s: q.duration_s,
    // Le client voit la règle normale ; la tolérance restaurant reste interne.
    waiting_grace_min: q.params.waiting.grace_min,
    waiting_fee_per_min: q.params.waiting.fee_per_min,
    pickup_zone: q.pickupZone,
    dropoff_zone: q.dropoffZone,
    degraded: q.degraded,
  };
}));

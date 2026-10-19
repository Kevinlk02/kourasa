// Acceptation atomique (SQL accept_offer, au nom du coursier), puis distance d'approche routière
// (1 seul appel Google, pour le coursier qui accepte) → incitation à la course.
import { z } from 'zod';
import { handler, HttpError } from '../_shared/http.ts';
import { admin, requireUser, userClient } from '../_shared/supabase.ts';
import { route } from '../_shared/google.ts';
import { DEFAULT_PRICING } from '../_shared/core/pricing.ts';

const schema = z.object({ offer_id: z.string().uuid() });

Deno.serve(handler(schema, async (input, req) => {
  const user = await requireUser(req);
  const { data, error } = await userClient(req).rpc('accept_offer', { p_offer: input.offer_id });
  if (error) throw new HttpError(409, 'offer_unavailable', error.message);
  const r = data as { delivery_id: string; courier_lat: number; courier_lng: number; pickup_lat: number; pickup_lng: number; straight_m: number };

  let approach = Math.round(r.straight_m * DEFAULT_PRICING.detour_factor);
  try {
    const rt = await route(user.id, { lat: r.courier_lat, lng: r.courier_lng }, { lat: r.pickup_lat, lng: r.pickup_lng }, DEFAULT_PRICING);
    approach = rt.distance_m;
  } catch (e) {
    console.error(e);
  }
  await admin.rpc('set_approach', { p_delivery: r.delivery_id, p_approach_m: approach });
  return { delivery_id: r.delivery_id, approach_m: approach };
}));

// Usage interne (quote, accept-offer appellent directement _shared/google.ts) ;
// exposée pour l'admin (aperçu) — réservée aux administrateurs.
import { handler, HttpError } from '../_shared/http.ts';
import { admin, requireUser } from '../_shared/supabase.ts';
import { route } from '../_shared/google.ts';
import { routeRequestSchema } from '../_shared/core/schemas.ts';
import { DEFAULT_PRICING } from '../_shared/core/pricing.ts';

Deno.serve(handler(routeRequestSchema, async (input, req) => {
  const user = await requireUser(req);
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new HttpError(403, 'forbidden', 'Réservé aux administrateurs');
  return await route(user.id, input.from, input.to, DEFAULT_PRICING);
}));

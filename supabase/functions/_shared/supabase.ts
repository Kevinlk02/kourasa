import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Client service role : contourne la RLS, réservé au serveur. */
export const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Client au nom de l'utilisateur (auth.uid() fonctionne dans les fonctions SQL). */
export function userClient(req: Request): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request): Promise<{ id: string; phone: string | null }> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'unauthorized', 'Connectez-vous pour continuer');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'unauthorized', 'Session expirée, reconnectez-vous');
  return { id: data.user.id, phone: data.user.phone ?? null };
}

/** Limitation de débit par utilisateur (fenêtre d'une minute). */
export async function rateLimit(userId: string, bucket: string, limit: number): Promise<void> {
  const { data, error } = await admin.rpc('check_rate_limit', { p_user: userId, p_bucket: bucket, p_limit: limit });
  if (error) {
    console.error('rate limit', error);
    return;
  }
  if (data === false) throw new HttpError(429, 'rate_limited', 'Trop de requêtes, patientez un instant');
}

export interface CityRow {
  id: string;
  name: string;
  country_code: string;
  pricing: Record<string, unknown>;
  center_lat: number;
  center_lng: number;
  currency: 'XOF' | 'XAF';
  google_region: string;
  active: boolean;
}

export async function loadCity(cityId: string): Promise<CityRow> {
  const { data, error } = await admin
    .from('cities')
    .select('id, name, country_code, pricing, active, center_lat, center_lng, countries(currency, google_region)')
    .eq('id', cityId)
    .single();
  if (error || !data || !data.active) throw new HttpError(404, 'city_not_found', 'Ville non desservie');
  const country = data.countries as unknown as { currency: 'XOF' | 'XAF'; google_region: string };
  return {
    id: data.id,
    name: data.name,
    country_code: data.country_code,
    pricing: data.pricing as Record<string, unknown>,
    active: data.active,
    center_lat: data.center_lat as number,
    center_lng: data.center_lng as number,
    currency: country.currency,
    google_region: country.google_region,
  };
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browser: SupabaseClient | null = null;

/** Client navigateur (admin, suivi). La sécurité est appliquée par la RLS et les fonctions SQL. */
export function supabase(): SupabaseClient {
  if (browser) return browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if ((!url || !key) && typeof window !== 'undefined') {
    console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquants (.env) — lancez `pnpm env:sync`.');
  }
  // Valeurs de repli : permettent le pré-rendu au build ; aucun appel réseau n'a lieu au rendu.
  browser = createClient(url || 'http://127.0.0.1:54321', key || 'missing-anon-key', {
    auth: { persistSession: typeof window !== 'undefined', autoRefreshToken: true },
  });
  return browser;
}

/** Client serveur anonyme (pages publiques : versions, suivi destinataire). */
export function serverSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface AppVersionRow {
  app: 'client' | 'courier';
  platform: 'android' | 'web';
  latest_version: string;
  min_version: string;
  apk_url: string | null;
  sha256: string | null;
  size_bytes: number | null;
  changelog: string | null;
  published_at: string;
}

export async function latestVersions(): Promise<AppVersionRow[]> {
  const sb = serverSupabase();
  if (!sb) return [];
  const { data } = await sb.from('app_versions_latest').select('*');
  return (data as AppVersionRow[]) ?? [];
}

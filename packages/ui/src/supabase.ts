import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

let client: SupabaseClient | null = null;

/** Client Supabase unique, session persistée (AsyncStorage / localStorage sur le web). */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY manquants (.env)');
  client = createClient(url, key, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

/** Réessaie avec backoff exponentiel (3G instable). N'insiste pas sur les erreurs métier (4xx). */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 800): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = (e as { status?: number }).status;
      if (status && status >= 400 && status < 500) throw e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

/** Appelle une Edge Function et renvoie un message d'erreur lisible en français. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const sb = getSupabase();
  return withRetry(async () => {
    const { data, error } = await sb.functions.invoke(name, { body: body as Record<string, unknown> });
    if (error) {
      let message = 'Une erreur est survenue. Réessayez.';
      let status: number | undefined;
      let extra: Record<string, unknown> = {};
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        status = ctx.status;
        try {
          extra = await ctx.json();
          if (typeof extra.message === 'string') message = extra.message;
        } catch {
          /* corps illisible */
        }
      } else if (/fetch|network/i.test(error.message)) {
        message = 'Pas de connexion. Réessayez.';
      }
      throw Object.assign(new Error(message), { status, ...extra });
    }
    return data as T;
  });
}

/** Message d'erreur d'un appel RPC (exceptions SQL déjà en français). */
export function rpcMessage(error: { message?: string } | null | undefined): string {
  if (!error?.message) return 'Une erreur est survenue. Réessayez.';
  if (/fetch|network/i.test(error.message)) return 'Pas de connexion. Réessayez.';
  return error.message;
}

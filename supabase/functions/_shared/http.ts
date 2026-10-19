import { ZodError, type z, type ZodTypeAny } from 'zod';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Enveloppe commune : CORS, parsing JSON, validation Zod, erreurs en français. */
export function handler<S extends ZodTypeAny>(schema: S, fn: (input: z.output<S>, req: Request) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'Méthode non autorisée' }, 405);
    try {
      const raw = await req.json().catch(() => ({}));
      const input = schema.parse(raw) as z.output<S>;
      return json(await fn(input, req));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message, ...e.extra }, e.status);
      if (e instanceof ZodError) {
        return json({ error: 'invalid_input', message: e.issues[0]?.message ?? 'Données invalides', issues: e.issues }, 400);
      }
      console.error(e);
      return json({ error: 'internal', message: 'Une erreur est survenue. Réessayez.' }, 500);
    }
  };
}

/** fetch avec délai maximum (5 s par défaut). */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

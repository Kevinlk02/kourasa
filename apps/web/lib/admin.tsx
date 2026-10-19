'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface CityOpt {
  id: string;
  name: string;
  active: boolean;
  center_lat: number;
  center_lng: number;
  pricing: Record<string, unknown>;
  merchant_momo_number: string | null;
  countries: { currency: string } | null;
}
export interface ZoneOpt {
  id: string;
  city_id: string;
  code: string;
  name: string;
  color: string;
  active: boolean;
  allow_overflow: boolean;
  geojson: { type: 'MultiPolygon'; coordinates: number[][][][] };
  neighborhoods: string[];
}

interface AdminCtx {
  session: Session | null | undefined;
  isAdmin: boolean | null;
  cities: CityOpt[];
  city: CityOpt | null;
  setCityId: (id: string) => void;
  zones: ZoneOpt[];
  reloadZones: () => Promise<void>;
  reloadCities: () => Promise<void>;
}

const Ctx = createContext<AdminCtx | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const sb = supabase();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [cities, setCities] = useState<CityOpt[]>([]);
  const [cityId, setCityId] = useState<string | null>(null);
  const [zones, setZones] = useState<ZoneOpt[]>([]);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!session) {
      setIsAdmin(session === null ? false : null);
      return;
    }
    sb.from('profiles').select('role').eq('id', session.user.id).single()
      .then(({ data }) => setIsAdmin(data?.role === 'admin'));
  }, [session, sb]);

  const reloadCities = useCallback(async () => {
    const { data } = await sb.from('cities').select('id, name, active, center_lat, center_lng, pricing, merchant_momo_number, countries(currency)').order('created_at');
    const list = (data as unknown as CityOpt[]) ?? [];
    setCities(list);
    setCityId((cur) => cur ?? list.find((c) => c.active)?.id ?? list[0]?.id ?? null);
  }, [sb]);

  const reloadZones = useCallback(async () => {
    if (!cityId) return;
    const { data } = await sb.from('zones_geojson').select('*').eq('city_id', cityId).order('code');
    setZones((data as ZoneOpt[]) ?? []);
  }, [cityId, sb]);

  useEffect(() => {
    if (isAdmin) reloadCities();
  }, [isAdmin, reloadCities]);
  useEffect(() => {
    reloadZones();
  }, [reloadZones]);

  return (
    <Ctx.Provider value={{
      session, isAdmin, cities, city: cities.find((c) => c.id === cityId) ?? null, setCityId, zones, reloadZones, reloadCities,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAdmin(): AdminCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdmin hors AdminProvider');
  return v;
}

/** Appel RPC avec message d'erreur ; renvoie null en cas d'échec (et affiche une alerte). */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) {
    alert(error.message);
    return null;
  }
  return data as T;
}

export function currencyOf(city: CityOpt | null): string {
  return city?.countries?.currency ?? 'XOF';
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function monthRange(d = new Date()): { from: string; to: string } {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

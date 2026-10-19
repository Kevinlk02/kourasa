import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { getSupabase, useSession } from '@koursa/ui';

export interface CityInfo {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
}

/** Ville du client (profil), sinon la première ville active (Lomé). */
export function useCity(): CityInfo | null {
  const { profile } = useSession();
  const [city, setCity] = useState<CityInfo | null>(null);
  useEffect(() => {
    const sb = getSupabase();
    let q = sb.from('cities').select('id, name, center_lat, center_lng').eq('active', true);
    if (profile?.city_id) q = q.eq('id', profile.city_id);
    q.order('created_at').limit(1).then(({ data }) => setCity((data?.[0] as CityInfo) ?? null));
  }, [profile?.city_id]);
  return city;
}

/** Position actuelle (précision équilibrée pour économiser la batterie) ; null si refusée. */
export function useCurrentPosition(): { lat: number; lng: number } | null {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const last = await Location.getLastKnownPositionAsync();
      if (last) setPos({ lat: last.coords.latitude, lng: last.coords.longitude });
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPos({ lat: cur.coords.latitude, lng: cur.coords.longitude });
    })().catch(() => undefined);
  }, []);
  return pos;
}

export function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function km(m: number): string {
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

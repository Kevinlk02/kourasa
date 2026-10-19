import { useCallback, useEffect, useState } from 'react';
import type { Courier, Zone } from '@koursa/shared';
import { getSupabase, useSession } from '@koursa/ui';

export interface CourierState {
  courier: (Courier & { city_id: string; current_zone_id: string | null }) | null;
  zones: Zone[];
  balanceDue: number;
  currency: string;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useCourier(): CourierState {
  const { session } = useSession();
  const [courier, setCourier] = useState<CourierState['courier']>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [balanceDue, setBalance] = useState(0);
  const [currency, setCurrency] = useState('XOF');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const sb = getSupabase();
    const uid = session?.user.id;
    if (!uid) return;
    const { data: c } = await sb.from('couriers')
      .select('id, city_id, validation_status, vehicle_model, plate, photo_path, home_zone_id, current_zone_id, online, last_seen_at, rating_avg, rating_count, blocked')
      .eq('id', uid).maybeSingle();
    setCourier(c as CourierState['courier']);
    if (c) {
      const [{ data: z }, { data: w }] = await Promise.all([
        sb.from('zones_geojson').select('id, city_id, code, name, color, active, allow_overflow, geojson').eq('city_id', c.city_id).eq('active', true),
        sb.from('courier_wallets').select('balance_due, currency').eq('courier_id', uid).maybeSingle(),
      ]);
      setZones((z as Zone[]) ?? []);
      setBalance(w?.balance_due ?? 0);
      if (w?.currency) setCurrency(w.currency);
    }
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { courier, zones, balanceDue, currency, loading, reload };
}

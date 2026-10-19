'use client';

// Carte en direct : coursiers en ligne + courses en cours, colorés par zone.
import { useEffect, useRef, useState } from 'react';
import { rpc, useAdmin } from '@/lib/admin';
import { dot, useGoogleMap } from '@/components/GoogleMap';

interface Live {
  couriers: { id: string; name: string; lat: number; lng: number; home_zone_id: string | null; current_zone_id: string | null; busy: boolean; last_seen_at: string }[];
  deliveries: { id: string; status: string; pickup_zone_id: string; pickup_lat: number; pickup_lng: number; dropoff_lat: number; dropoff_lng: number }[];
}

export default function LiveMap() {
  const { city, zones } = useAdmin();
  const { ref, map, error } = useGoogleMap({ lat: city?.center_lat ?? 6.1375, lng: city?.center_lng ?? 1.2123 }, 12);
  const [live, setLive] = useState<Live | null>(null);
  const overlays = useRef<google.maps.MVCObject[]>([]);
  const color = (zoneId: string | null) => zones.find((z) => z.id === zoneId)?.color ?? '#6B6B6B';

  useEffect(() => {
    if (!city) return;
    const load = () => rpc<Live>('admin_live_map', { p_city: city.id }).then(setLive);
    load();
    const i = setInterval(load, 10_000);
    return () => clearInterval(i);
  }, [city]);

  useEffect(() => {
    if (!map) return;
    overlays.current.forEach((o) => (o as google.maps.Marker).setMap(null));
    overlays.current = [];
    for (const z of zones) {
      overlays.current.push(new google.maps.Polygon({
        map, paths: z.geojson.coordinates.map((p) => (p[0] ?? []).map(([lng, lat]) => ({ lat: lat!, lng: lng! }))),
        strokeColor: z.color, strokeWeight: 2, fillColor: z.color, fillOpacity: 0.08, clickable: false,
      }));
    }
    for (const c of live?.couriers ?? []) {
      overlays.current.push(new google.maps.Marker({
        map, position: { lat: c.lat, lng: c.lng }, title: `${c.name}${c.busy ? ' (en course)' : ''}`,
        icon: { ...dot(color(c.home_zone_id), c.busy ? 6 : 9), strokeColor: c.busy ? '#111' : '#fff' },
      }));
    }
    for (const d of live?.deliveries ?? []) {
      overlays.current.push(new google.maps.Marker({
        map, position: { lat: d.pickup_lat, lng: d.pickup_lng }, title: `Course ${d.status}`,
        icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 5, fillColor: color(d.pickup_zone_id), fillOpacity: 1, strokeColor: '#111', strokeWeight: 1.5 },
      }));
      overlays.current.push(new google.maps.Polyline({
        map, path: [{ lat: d.pickup_lat, lng: d.pickup_lng }, { lat: d.dropoff_lat, lng: d.dropoff_lng }],
        strokeColor: color(d.pickup_zone_id), strokeOpacity: 0.7, strokeWeight: 2, geodesic: true,
      }));
    }
  }, [map, live, zones]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Carte en direct</h1>
        <p className="text-sm text-muted">
          {live?.couriers.length ?? 0} coursier(s) en ligne · {live?.deliveries.length ?? 0} course(s) en cours · rafraîchi toutes les 10 s
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {zones.map((z) => <span key={z.id} className="flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: z.color }} />{z.name}</span>)}
        <span>● coursier libre · ◦ petit = en course · ▼ point de récupération</span>
      </div>
      <div className="relative h-[75dvh] overflow-hidden rounded-2xl border border-line">
        <div ref={ref} className="absolute inset-0" />
        {error ? <p className="absolute inset-x-4 top-4 rounded-xl bg-white p-3 text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  );
}

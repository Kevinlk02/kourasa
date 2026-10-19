'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney, t, type DeliveryStatus } from '@koursa/shared';
import { supabase } from '@/lib/supabase';
import { dot, useGoogleMap } from '@/components/GoogleMap';

interface Track {
  status: DeliveryStatus;
  currency: string;
  recipient_name: string;
  dropoff_address: string;
  dropoff_landmark: string;
  dropoff_lat: number;
  dropoff_lng: number;
  payer: 'sender' | 'recipient';
  price: number | null;
  waiting_pickup_fee: number | null;
  waiting_dropoff_fee: number;
  waiting_charging: boolean;
  amount_to_pay: number;
  arrived_dropoff_at: string | null;
  delivered_at: string | null;
  courier: { name: string; plate: string; phone: string; lat: number | null; lng: number | null } | null;
}

const HEADLINE: Partial<Record<DeliveryStatus, string>> = {
  pending: 'Commande en préparation',
  searching: 'Recherche d’un coursier…',
  assigned: 'Le coursier va chercher votre colis',
  picked_up: 'Votre colis est en route',
  delivering: 'Votre colis est en route',
  delivered: 'Colis livré',
  failed: 'Livraison impossible',
  unassigned: 'En attente d’un coursier',
  cancelled_by_client: 'Livraison annulée',
  cancelled_by_courier: 'Livraison annulée',
};

export function Tracking({ token }: { token: string }) {
  const [data, setData] = useState<Track | null | undefined>(undefined);
  const { ref, map } = useGoogleMap({ lat: 6.1375, lng: 1.2123 }, 14);
  const markers = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: d } = await supabase().rpc('track_delivery', { p_token: token });
      if (alive) setData((d as Track | null) ?? null);
    };
    load();
    const i = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(i);
    };
  }, [token]);

  useEffect(() => {
    if (!map || !data) return;
    markers.current.forEach((m) => m.setMap(null));
    markers.current = [new google.maps.Marker({ map, position: { lat: data.dropoff_lat, lng: data.dropoff_lng }, icon: dot('#00A86B', 9), title: 'Livraison' })];
    const b = new google.maps.LatLngBounds({ lat: data.dropoff_lat, lng: data.dropoff_lng });
    if (data.courier?.lat && data.courier.lng) {
      markers.current.push(new google.maps.Marker({ map, position: { lat: data.courier.lat, lng: data.courier.lng }, icon: dot('#2F80ED', 9), title: 'Coursier' }));
      b.extend({ lat: data.courier.lat, lng: data.courier.lng });
      map.fitBounds(b, 60);
    } else {
      map.setCenter(b.getCenter());
    }
  }, [map, data]);

  if (data === undefined) return <div className="p-8 text-center text-muted">{t('common.loading')}</div>;
  if (data === null) return <div className="p-8 text-center">Lien de suivi invalide ou expiré.</div>;

  const active = ['assigned', 'picked_up', 'delivering'].includes(data.status);
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <div ref={ref} className="h-[45dvh] w-full bg-surface" />
      <section className="-mt-4 flex-1 space-y-4 rounded-t-2xl bg-white p-5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        <p className="label">KOURSA · Colis pour {data.recipient_name}</p>
        <h1 className="text-2xl font-bold">
          {data.arrived_dropoff_at && data.status !== 'delivered' ? 'Le coursier est arrivé' : HEADLINE[data.status]}
        </h1>
        <p className="text-muted">{data.dropoff_landmark}{data.dropoff_address ? ` · ${data.dropoff_address}` : ''}</p>

        {active && data.courier ? (
          <div className="flex items-center justify-between rounded-xl bg-surface p-3">
            <div>
              <p className="font-semibold">{data.courier.name}</p>
              <p className="text-sm text-muted">Plaque {data.courier.plate}</p>
            </div>
            <a href={`tel:${data.courier.phone}`} className="btn-sm bg-ink text-white">Appeler</a>
          </div>
        ) : null}

        {data.status !== 'delivered' && data.amount_to_pay > 0 ? (
          <div className="rounded-xl border-2 border-ink p-4">
            <p className="label">À PAYER AU COURSIER (ESPÈCES)</p>
            <p className="text-3xl font-extrabold">{formatMoney(data.amount_to_pay, data.currency)}</p>
            <ul className="mt-2 space-y-0.5 text-sm text-muted">
              {data.price ? <li>Course : {formatMoney(data.price, data.currency)}</li> : null}
              {data.waiting_pickup_fee ? <li>Attente à la récupération : {formatMoney(data.waiting_pickup_fee, data.currency)}</li> : null}
              <li>Attente à la livraison : {formatMoney(data.waiting_dropoff_fee, data.currency)}</li>
            </ul>
          </div>
        ) : null}
        {data.waiting_charging ? (
          <p className="rounded-xl bg-[#FFF6E5] p-3 text-sm">Les 5 minutes d’attente offertes sont passées : 50 F par minute, plafonné à 750 F.</p>
        ) : null}

        {active ? (
          <div className="rounded-xl bg-surface p-3 text-sm">
            <b>Code de réception :</b> vous l’avez reçu par SMS. Donnez-le au coursier <u>uniquement</u> quand vous avez le colis en main.
          </div>
        ) : null}
        {data.status === 'delivered' && data.delivered_at ? (
          <p className="text-muted">Livré le {new Date(data.delivered_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}.</p>
        ) : null}
        <p className="pt-4 text-center text-xs text-muted">Envoyez vous aussi vos colis avec <a className="underline" href="/telecharger">Koursa</a>.</p>
      </section>
    </main>
  );
}

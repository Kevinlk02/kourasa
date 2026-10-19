// Suivi en temps réel : recherche, coursier sur la carte, attente, livraison, note.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, formatMoney, isActive, t, type DeliveryStatus } from '@koursa/shared';
import {
  Avatar, BottomSheet, Body, Button, Caption, KoursaMap, Row, StatusPill, Subtitle, Timer, Title,
  getSupabase, rpcMessage,
} from '@koursa/ui';

interface Delivery {
  id: string;
  status: DeliveryStatus;
  currency: string;
  pickup_lat: number; pickup_lng: number; pickup_landmark: string;
  dropoff_lat: number; dropoff_lng: number; dropoff_landmark: string;
  recipient_name: string;
  payer: 'sender' | 'recipient';
  price_locked: number;
  waiting_pickup_fee: number;
  waiting_dropoff_fee: number;
  total_collected: number | null;
  arrived_pickup_at: string | null;
  arrived_dropoff_at: string | null;
  picked_up_at: string | null;
  cancel_reason: string | null;
}
interface CourierInfo { name: string; phone: string; plate: string; vehicle_model: string; photo_path: string | null; rating_avg: number | null; lat: number | null; lng: number | null }
interface Waiting { stop: 'pickup' | 'dropoff' | null; arrived?: boolean; charging: boolean; fee: number; charging_since?: string }

const COLS = 'id, status, currency, pickup_lat, pickup_lng, pickup_landmark, dropoff_lat, dropoff_lng, dropoff_landmark, recipient_name, payer, price_locked, waiting_pickup_fee, waiting_dropoff_fee, total_collected, arrived_pickup_at, arrived_dropoff_at, picked_up_at, cancel_reason';

export default function Track() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sb = getSupabase();
  const [d, setD] = useState<Delivery | null>(null);
  const [courier, setCourier] = useState<CourierInfo | null>(null);
  const [courierPos, setCourierPos] = useState<{ lat: number; lng: number } | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [rated, setRated] = useState(false);

  const load = useCallback(async () => {
    const { data } = await sb.from('deliveries').select(COLS).eq('id', id).single();
    if (data) setD(data as Delivery);
  }, [id, sb]);

  useEffect(() => {
    load();
    sb.from('ratings').select('stars').eq('delivery_id', id).maybeSingle().then(({ data }) => setRated(!!data));
    const ch = sb.channel(`delivery-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deliveries', filter: `id=eq.${id}` },
        (p) => setD((prev) => (prev ? { ...prev, ...(p.new as Partial<Delivery>) } : prev)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'courier_locations', filter: `delivery_id=eq.${id}` },
        (p) => setCourierPos({ lat: (p.new as { lat: number }).lat, lng: (p.new as { lng: number }).lng }))
      .subscribe();
    // Filet de sécurité 3G : si le temps réel décroche, on recharge toutes les 20 s.
    const poll = setInterval(load, 20_000);
    return () => {
      clearInterval(poll);
      sb.removeChannel(ch);
    };
  }, [id, load, sb]);

  const hasCourier = d && ['assigned', 'picked_up', 'delivering'].includes(d.status);
  useEffect(() => {
    if (!hasCourier) return;
    sb.rpc('delivery_courier_info', { p_delivery: id }).then(({ data }) => {
      if (!data) return;
      const c = data as CourierInfo;
      setCourier(c);
      if (c.lat && c.lng) setCourierPos((prev) => prev ?? { lat: c.lat!, lng: c.lng! });
    });
  }, [hasCourier, id, sb]);

  // Attente : le client voit « arrivé », puis le compteur seulement quand les frais commencent.
  const arrived = d && ((d.status === 'assigned' && d.arrived_pickup_at) || (d.status !== 'assigned' && d.arrived_dropoff_at));
  useEffect(() => {
    if (!arrived || !d || !isActive(d.status)) {
      setWaiting(null);
      return;
    }
    const tick = () => sb.rpc('client_waiting', { p_delivery: id }).then(({ data }) => setWaiting(data as Waiting));
    tick();
    const i = setInterval(tick, 15_000);
    return () => clearInterval(i);
  }, [arrived, d?.status, id, sb]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(fn: string) {
    setBusy(true);
    setError(null);
    const { error: e } = await sb.rpc(fn, { p_delivery: id });
    setBusy(false);
    if (e) setError(rpcMessage(e));
    else load();
  }

  async function rate() {
    setBusy(true);
    const { error: e } = await sb.rpc('rate_delivery', { p_delivery: id, p_stars: stars });
    setBusy(false);
    if (e) setError(rpcMessage(e));
    else setRated(true);
  }

  if (!d) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>;

  const markers = [
    { id: 'pickup', kind: 'pickup' as const, lat: d.pickup_lat, lng: d.pickup_lng },
    { id: 'dropoff', kind: 'dropoff' as const, lat: d.dropoff_lat, lng: d.dropoff_lng },
    ...(courierPos && hasCourier ? [{ id: 'courier', kind: 'courier' as const, ...courierPos }] : []),
  ];

  const headline = (() => {
    switch (d.status) {
      case 'assigned': return d.arrived_pickup_at ? t('track.arrivedPickup') : t('track.assigned');
      case 'picked_up': return t('track.pickedUp');
      case 'delivering': return d.arrived_dropoff_at ? t('track.arrivedDropoff') : t('track.delivering');
      case 'delivered': return t('track.delivered');
      default: return t(`status.${d.status}`);
    }
  })();

  return (
    <View style={{ flex: 1 }}>
      <KoursaMap center={{ lat: d.pickup_lat, lng: d.pickup_lng }} markers={markers} fitToMarkers bottomPadding={340} />
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={{ position: 'absolute', top: 48, left: 16, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, elevation: 4 }}>
        <Text style={{ fontWeight: '600' }}>← {t('common.back')}</Text>
      </Pressable>
      <BottomSheet scroll>
        <Row style={{ justifyContent: 'space-between' }}>
          <Subtitle style={{ flex: 1 }}>{headline}</Subtitle>
          <StatusPill status={d.status} />
        </Row>

        {d.status === 'searching' || d.status === 'pending' ? (
          <>
            <Row><ActivityIndicator color={colors.accent} /><Body>{t('search.title')}</Body></Row>
            <Button title={t('search.cancel')} variant="secondary" onPress={() => act('client_cancel')} loading={busy} />
          </>
        ) : null}

        {d.status === 'unassigned' ? (
          <>
            <Body>{t('search.unassigned')}</Body>
            <Button title={t('common.retry')} onPress={() => act('client_retry')} loading={busy} />
            <Button title={t('search.cancel')} variant="ghost" onPress={() => act('client_cancel')} />
          </>
        ) : null}

        {hasCourier && courier ? (
          <Row>
            <Avatar name={courier.name} uri={courier.photo_path ? sb.storage.from('courier-avatars').getPublicUrl(courier.photo_path).data.publicUrl : null} />
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '600' }}>{courier.name}{courier.rating_avg ? ` · ★ ${courier.rating_avg}` : ''}</Body>
              <Caption>{courier.vehicle_model} · {courier.plate}</Caption>
            </View>
            <Pressable onPress={() => Linking.openURL(`tel:${courier.phone}`)} accessibilityRole="button"
              style={{ backgroundColor: colors.surface, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontWeight: '600' }}>📞 {t('common.call')}</Text>
            </Pressable>
          </Row>
        ) : null}

        {waiting?.charging ? (
          <View style={{ backgroundColor: '#FFF6E5', padding: 12, borderRadius: 12, gap: 4 }}>
            <Body style={{ fontWeight: '600' }}>{t('track.waitingCharging', { amount: formatMoney(waiting.fee, d.currency) })}</Body>
            <Timer since={waiting.charging_since} style={{ fontSize: 20 }} />
            <Caption>{d.status === 'assigned' ? 'Facturé à l\'expéditeur' : 'Payé par le destinataire'}</Caption>
          </View>
        ) : null}

        {hasCourier ? <Caption>{t('track.code')} ({d.recipient_name}).</Caption> : null}

        {d.status === 'delivered' ? (
          <View style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body>Total</Body>
              <Title>{formatMoney(d.price_locked + d.waiting_pickup_fee + d.waiting_dropoff_fee, d.currency)}</Title>
            </Row>
            <Caption>Course {formatMoney(d.price_locked, d.currency)} · Attente {formatMoney(d.waiting_pickup_fee + d.waiting_dropoff_fee, d.currency)}</Caption>
            {!rated ? (
              <>
                <Subtitle>{t('rating.title')}</Subtitle>
                <Row style={{ justifyContent: 'center', gap: 12 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} onPress={() => setStars(n)} accessibilityLabel={`${n} étoiles`}>
                      <Text style={{ fontSize: 36, color: n <= stars ? '#F2C94C' : colors.border }}>★</Text>
                    </Pressable>
                  ))}
                </Row>
                <Button title={t('common.confirm')} onPress={rate} disabled={!stars} loading={busy} />
              </>
            ) : <Body>{t('rating.thanks')}</Body>}
          </View>
        ) : null}

        {d.status === 'failed' ? <Body>Le destinataire était injoignable : le coursier vous rapporte le colis.</Body> : null}
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      </BottomSheet>
    </View>
  );
}

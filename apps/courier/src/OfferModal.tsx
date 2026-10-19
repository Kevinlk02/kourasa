// Proposition de course plein écran : zone, distance jusqu'au colis, trajet, gain, 20 s pour accepter.
import { useEffect, useState } from 'react';
import { Modal, Vibration, View } from 'react-native';
import { colors, formatMoney, t } from '@koursa/shared';
import { Body, Button, Caption, Row, Timer, Title, ZoneBadge, callFunction, getSupabase, rpcMessage } from '@koursa/ui';

export interface Offer {
  id: string;
  delivery_id: string;
  expires_at: string;
  summary: {
    pickup_zone_name: string;
    dropoff_zone_name: string | null;
    pickup_distance_m: number;
    trip_distance_m: number;
    courier_gain: number;
    currency: string;
    size: 'small' | 'medium' | 'large';
    payer: 'sender' | 'recipient';
    pickup_address: string;
    pickup_landmark: string;
    dropoff_address: string;
    is_restaurant: boolean;
  };
}

const km = (m: number) => `${(m / 1000).toFixed(1).replace('.', ',')} km`;

export function OfferModal({ offer, zoneColor, onAccepted, onClose }: {
  offer: Offer;
  zoneColor: string;
  onAccepted: (deliveryId: string) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const s = offer.summary;

  useEffect(() => {
    Vibration.vibrate([0, 400, 200, 400]);
    const ms = new Date(offer.expires_at).getTime() - Date.now();
    const id = setTimeout(onClose, Math.max(0, ms));
    return () => clearTimeout(id);
  }, [offer.id, offer.expires_at, onClose]);

  async function accept() {
    setBusy('accept');
    setError(null);
    try {
      const r = await callFunction<{ delivery_id: string }>('accept-offer', { offer_id: offer.id });
      onAccepted(r.delivery_id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function decline() {
    setBusy('decline');
    const { error: e } = await getSupabase().rpc('decline_offer', { p_offer: offer.id });
    if (e) setError(rpcMessage(e));
    onClose();
  }

  return (
    <Modal visible animationType="fade" onRequestClose={decline} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 56, gap: 18 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Title>{t('courier.offer.title')}</Title>
          <Timer until={offer.expires_at} style={{ color: colors.danger }} />
        </Row>
        <ZoneBadge name={s.pickup_zone_name} color={zoneColor} />
        <View style={{ gap: 6 }}>
          <Title style={{ fontSize: 40, color: colors.accent }}>{formatMoney(s.courier_gain, s.currency)}</Title>
          <Caption>{t('courier.offer.gain', { amount: '' }).trim()}</Caption>
        </View>
        <View style={{ gap: 10 }}>
          <Body style={{ fontSize: 18 }}>📍 {t('courier.offer.toPickup', { distance: km(s.pickup_distance_m) })}</Body>
          <Body style={{ fontSize: 18 }}>🛵 {t('courier.offer.trip', { distance: km(s.trip_distance_m) })}{s.dropoff_zone_name && s.dropoff_zone_name !== s.pickup_zone_name ? ` → ${s.dropoff_zone_name}` : ''}</Body>
          <Body>📦 {t(`size.${s.size}`)} · {s.payer === 'recipient' ? 'Payé à la livraison' : 'Payé à la récupération'}</Body>
          {s.is_restaurant ? <Body>🍽️ Restaurant : 15 min avant facturation de l'attente</Body> : null}
          <Caption numberOfLines={2}>{s.pickup_landmark || s.pickup_address}</Caption>
        </View>
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        <View style={{ flex: 1 }} />
        <Button title={t('courier.offer.accept')} onPress={accept} loading={busy === 'accept'} disabled={!!busy} />
        <Button title={t('courier.offer.decline')} variant="secondary" onPress={decline} loading={busy === 'decline'} disabled={!!busy} />
      </View>
    </Modal>
  );
}

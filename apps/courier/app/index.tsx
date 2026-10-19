// Accueil coursier : zone d'attache sur la carte, En ligne / Hors ligne, offres, course en cours.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, formatMoney, t } from '@koursa/shared';
import {
  Banner, BottomSheet, Body, Button, Caption, KoursaMap, Loading, Row, Screen, Subtitle, Title, ZoneBadge,
  getSupabase, multiPolygonToRings, rpcMessage, useSession,
} from '@koursa/ui';
import { useCourier } from '../src/useCourier';
import { OfferModal, type Offer } from '../src/OfferModal';
import { currentPosition, onZoneUpdate, requestPermissions, startTracking, stopTracking } from '../src/tracking';

export default function Home() {
  const sb = getSupabase();
  const { signOut } = useSession();
  const { courier, zones, balanceDue, currency, loading, reload } = useCourier();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [inHome, setInHome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const homeZone = zones.find((z) => z.id === courier?.home_zone_id);
  const polygons = useMemo(() => zones.map((z) => ({
    id: z.id, color: z.color, label: z.name, rings: multiPolygonToRings(z.geojson),
  })), [zones]);

  const refreshActive = useCallback(async () => {
    const { data } = await sb.rpc('courier_current_delivery');
    setActiveId((data as { id: string } | null)?.id ?? null);
  }, [sb]);

  useFocusEffect(useCallback(() => {
    reload();
    refreshActive();
    currentPosition().then(setPos).catch(() => undefined);
  }, [reload, refreshActive]));

  useEffect(() => onZoneUpdate((r) => setInHome(r.in_home_zone)), []);
  useEffect(() => {
    if (courier) setInHome(!courier.current_zone_id || courier.current_zone_id === courier.home_zone_id);
  }, [courier]);

  // Offres en temps réel (+ rattrapage d'une offre en cours au démarrage).
  useEffect(() => {
    if (!courier?.id) return;
    const pick = () => sb.from('delivery_offers').select('id, delivery_id, expires_at, summary')
      .eq('courier_id', courier.id).eq('response', 'pending').gt('expires_at', new Date().toISOString())
      .order('sent_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => data && setOffer(data as Offer));
    pick();
    const ch = sb.channel(`offers-${courier.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_offers', filter: `courier_id=eq.${courier.id}` },
        (p) => setOffer(p.new as Offer))
      .subscribe();
    const poll = setInterval(pick, 15_000);
    return () => {
      clearInterval(poll);
      sb.removeChannel(ch);
    };
  }, [courier?.id, sb]);

  async function toggleOnline() {
    if (!courier) return;
    setBusy(true);
    setError(null);
    try {
      if (!courier.online) {
        const permError = await requestPermissions();
        if (permError) throw new Error(permError);
        const p = await currentPosition();
        setPos(p);
        const { data, error } = await sb.rpc('courier_set_online', { p_online: true, p_lat: p.lat, p_lng: p.lng });
        if (error) throw new Error(rpcMessage(error));
        setInHome((data as { in_home_zone: boolean }).in_home_zone);
        await startTracking();
      } else {
        await stopTracking();
        const { error } = await sb.rpc('courier_set_online', { p_online: false });
        if (error) throw new Error(rpcMessage(error));
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reportRestaurant() {
    try {
      const p = await currentPosition();
      const { error } = await sb.rpc('report_venue', { p_lat: p.lat, p_lng: p.lng, p_name: 'Signalé par un coursier' });
      if (error) throw new Error(rpcMessage(error));
      Alert.alert('Merci', 'Le lieu sera vérifié par l\'équipe.');
    } catch (e) {
      Alert.alert('Erreur', (e as Error).message);
    }
  }

  if (loading) return <Loading />;
  if (!courier) return <Redirect to="/signup" />;
  if (courier.validation_status === 'pending') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
          <Title>{t('courier.pending.title')}</Title>
          <Body>{t('courier.pending.body')}</Body>
        </View>
        <Button title="Actualiser" variant="secondary" onPress={reload} />
        <Button title={t('auth.logout')} variant="ghost" onPress={signOut} />
      </Screen>
    );
  }
  if (courier.validation_status !== 'validated') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
          <Title>{courier.validation_status === 'rejected' ? 'Dossier refusé' : t('courier.suspended')}</Title>
          {courier.validation_status === 'rejected' ? <Body>Corrigez vos documents et renvoyez votre dossier.</Body> : null}
        </View>
        {courier.validation_status === 'rejected' ? <Button title="Renvoyer mon dossier" onPress={() => router.push('/signup')} /> : null}
        <Button title={t('auth.logout')} variant="ghost" onPress={signOut} />
      </Screen>
    );
  }

  const center = pos ?? (homeZone ? multiPolygonToRings(homeZone.geojson)[0]?.[0] : null) ?? { lat: 6.1375, lng: 1.2123 };

  return (
    <View style={{ flex: 1 }}>
      <KoursaMap center={center} zoom={13} polygons={polygons} showsUserLocation bottomPadding={300}
        markers={pos ? [{ id: 'me', kind: 'courier', ...pos }] : []} />
      <View style={{ position: 'absolute', top: 48, left: 16, right: 16, gap: 8 }}>
        {courier.blocked ? (
          <Banner tone="danger" text={t('courier.blocked', { amount: formatMoney(balanceDue, currency) })} onPress={() => router.push('/earnings')} />
        ) : null}
        {courier.online && !inHome ? <Banner text={t('courier.outOfZone')} /> : null}
        {activeId ? <Banner tone="info" text="Course en cours — toucher pour continuer" onPress={() => router.push('/course')} /> : null}
      </View>
      <BottomSheet>
        <Row style={{ justifyContent: 'space-between' }}>
          <Subtitle>{courier.online ? `🟢 ${t('courier.online')}` : `⚪ ${t('courier.offline')}`}</Subtitle>
          {homeZone ? <ZoneBadge name={homeZone.name} color={homeZone.color} /> : <Caption>Zone non attribuée</Caption>}
        </Row>
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        <Button title={courier.online ? t('courier.goOffline') : t('courier.goOnline')} variant={courier.online ? 'secondary' : 'primary'}
          onPress={toggleOnline} loading={busy} disabled={courier.blocked && !courier.online} />
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Link label={t('courier.earnings')} onPress={() => router.push('/earnings')} />
          <Link label={t('courier.reportRestaurant')} onPress={reportRestaurant} />
          <Link label="Batterie" onPress={() => router.push('/battery')} />
          <Link label={t('auth.logout')} muted onPress={async () => { await stopTracking(); await sb.rpc('courier_set_online', { p_online: false }); signOut(); }} />
        </Row>
      </BottomSheet>
      {offer ? (
        <OfferModal offer={offer} zoneColor={zones.find((z) => z.name === offer.summary.pickup_zone_name)?.color ?? colors.accent}
          onClose={() => setOffer(null)}
          onAccepted={() => { setOffer(null); router.push('/course'); }} />
      ) : null}
    </View>
  );
}

function Link({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 6 }}>
      <Text style={{ fontSize: 15, fontWeight: muted ? '400' : '600', color: muted ? colors.muted : colors.text }}>{label}</Text>
    </Pressable>
  );
}

function Redirect({ to }: { to: '/signup' }) {
  useEffect(() => {
    router.replace(to);
  }, [to]);
  return <Loading />;
}

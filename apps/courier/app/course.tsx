/**
 * Déroulé de la course : En route → Je suis arrivé (GPS < 100 m, minuteur d'attente) → Colis récupéré
 * → En route → Je suis arrivé → Montant à encaisser + code à 4 chiffres → Livré.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  DEFAULT_PRICING, colors, courierStep, formatMoney, navigationUrl, t, waitingFee,
  type CourierDelivery, type IncidentKind, type WaitingParams,
} from '@koursa/shared';
import {
  BottomSheet, Body, Button, Caption, Choice, Divider, Input, KoursaMap, Row, Subtitle, Timer, Title,
  getSupabase, rpcMessage,
} from '@koursa/ui';
import { currentPosition } from '../src/tracking';
import { takePhoto, uploadPhoto } from '../src/upload';

type Current = CourierDelivery & { note: string | null; waiting_rule: WaitingParams; amount_collected_pickup: number | null };
interface Collect { price: number; waiting_pickup_fee: number; waiting_dropoff_fee: number; at_dropoff: number; payer: 'sender' | 'recipient'; currency: string }
interface Done { at_dropoff: number; total_collected: number; currency: string; waiting_refused: boolean }

export default function Course() {
  const sb = getSupabase();
  const [d, setD] = useState<Current | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collect, setCollect] = useState<Collect | null>(null);
  const [code, setCode] = useState('');
  const [refused, setRefused] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [incident, setIncident] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const { data, error: e } = await sb.rpc('courier_current_delivery');
    if (e) setError(rpcMessage(e));
    setD((data as Current | null) ?? null);
  }, [sb]);

  useEffect(() => {
    load();
    const i = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(i);
  }, [load]);

  const step = d ? courierStep(d) : 'done';

  // Montant à encaisser (calculé serveur) rafraîchi pendant l'attente au point de livraison.
  useEffect(() => {
    if (step !== 'at_dropoff' || !d) return;
    const tick = () => sb.rpc('collect_preview', { p_delivery: d.id }).then(({ data }) => data && setCollect(data as Collect));
    tick();
    const i = setInterval(tick, 15_000);
    return () => clearInterval(i);
  }, [step, d?.id, sb]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => PromiseLike<{ data?: unknown; error: { message?: string } | null }>, after?: (data: unknown) => void) {
    setBusy(true);
    setError(null);
    try {
      const { data, error: e } = await fn();
      if (e) throw new Error(rpcMessage(e));
      after?.(data);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function arrive() {
    if (!d) return;
    setBusy(true);
    setError(null);
    try {
      const p = await currentPosition();
      await run(() => sb.rpc('courier_arrive', { p_delivery: d.id, p_lat: p.lat, p_lng: p.lng }));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function pickedUp(withPhoto: boolean) {
    if (!d) return;
    let path: string | undefined;
    if (withPhoto) {
      try {
        const ph = await takePhoto();
        if (ph) path = await uploadPhoto('parcel-photos', `${d.id}-pickup`, ph.base64);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    await run(() => sb.rpc('courier_picked_up', { p_delivery: d.id, p_photo_path: path ?? null }), (r) => {
      const res = r as { collect_now: number; waiting_pickup_fee: number };
      if (res.collect_now > 0) {
        Alert.alert('À encaisser maintenant', `${formatMoney(res.collect_now, d.currency)} auprès de l'expéditeur` +
          (res.waiting_pickup_fee ? `\n(dont attente ${formatMoney(res.waiting_pickup_fee, d.currency)})` : ''));
      }
    });
  }

  async function complete() {
    if (!d) return;
    await run(() => sb.rpc('courier_complete', { p_delivery: d.id, p_code: code, p_waiting_refused: refused }), (r) => setDone(r as Done));
  }

  function clientAbsent() {
    if (!d) return;
    Alert.alert(t('courier.clientAbsent'), step === 'at_pickup'
      ? 'La course sera annulée avec frais pour l\'expéditeur.'
      : 'Le colis retourne à l\'expéditeur avec frais de retour.', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => run(() => sb.rpc('courier_client_absent', { p_delivery: d.id })) },
    ]);
  }

  function withdraw() {
    if (!d) return;
    Alert.alert('Se désister ?', 'La course sera proposée à un autre coursier.', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => run(() => sb.rpc('courier_cancel', { p_delivery: d.id, p_reason: 'désistement' })) },
    ]);
  }

  if (done) {
    return (
      <View style={{ flex: 1, padding: 24, paddingTop: 80, gap: 16, backgroundColor: colors.background }}>
        <Title>✅ {t('track.delivered')}</Title>
        <Body>Encaissé à la livraison</Body>
        <Title style={{ fontSize: 44 }}>{formatMoney(done.at_dropoff, done.currency)}</Title>
        <Caption>Total encaissé sur la course : {formatMoney(done.total_collected, done.currency)}</Caption>
        {done.waiting_refused ? <Caption>Frais d'attente refusés : l'équipe s'en occupe, vous n'êtes pas pénalisé.</Caption> : null}
        <View style={{ flex: 1 }} />
        <Button title="Retour à l'accueil" onPress={() => router.replace('/')} />
      </View>
    );
  }
  if (d === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>;
  if (d === null) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <Body>Aucune course en cours.</Body>
        <Button title="Retour à l'accueil" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const atPickupSide = step === 'to_pickup' || step === 'at_pickup';
  const target = atPickupSide ? { lat: d.pickup_lat, lng: d.pickup_lng } : { lat: d.dropoff_lat, lng: d.dropoff_lng };
  const arrivedAt = step === 'at_pickup' ? d.arrived_pickup_at : step === 'at_dropoff' ? d.arrived_dropoff_at : null;
  const grace = step === 'at_pickup' ? d.pickup_grace_min : d.dropoff_grace_min;
  const rule = d.waiting_rule ?? DEFAULT_PRICING.waiting;
  const w = arrivedAt ? waitingFee(rule, grace, new Date(arrivedAt).getTime(), now) : null;
  const phone = atPickupSide ? d.sender_phone : d.recipient_phone;

  return (
    <View style={{ flex: 1 }}>
      <KoursaMap center={target} zoom={16} showsUserLocation bottomPadding={380}
        markers={[{ id: 'target', kind: atPickupSide ? 'pickup' : 'dropoff', ...target }]} />
      <Pressable onPress={() => router.replace('/')} style={{ position: 'absolute', top: 48, left: 16, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, elevation: 4 }}>
        <Text style={{ fontWeight: '600' }}>← Accueil</Text>
      </Pressable>
      <BottomSheet scroll maxHeight="80%">
        <Subtitle>{t(`courier.step.${{ to_pickup: 'toPickup', at_pickup: 'atPickup', to_dropoff: 'toDropoff', at_dropoff: 'atDropoff', done: 'toPickup' }[step] as 'toPickup'}`)}</Subtitle>
        <View style={{ gap: 2 }}>
          <Body style={{ fontWeight: '600' }}>{atPickupSide ? d.pickup_landmark : d.dropoff_landmark}</Body>
          <Caption numberOfLines={2}>{atPickupSide ? d.pickup_address : d.dropoff_address}</Caption>
          <Caption>{atPickupSide ? `Expéditeur : ${d.sender_name ?? ''}` : `Destinataire : ${d.recipient_name}`} · {t(`size.${d.size}`)}</Caption>
          {d.note ? <Caption>Note : {d.note}</Caption> : null}
          {step === 'to_pickup' || step === 'at_pickup' ? (
            <Caption style={{ color: colors.text }}>⏱ {d.pickup_is_restaurant ? t('courier.grace.restaurant', { min: d.pickup_grace_min }) : t('courier.grace.normal', { min: d.pickup_grace_min })}</Caption>
          ) : null}
        </View>

        <Row>
          <Button title={`🧭 ${t('courier.route')}`} variant="secondary" style={{ flex: 1, alignSelf: 'auto' }} onPress={() => Linking.openURL(navigationUrl(target.lat, target.lng))} />
          {phone ? <Button title={`📞 ${t('common.call')}`} variant="secondary" style={{ flex: 1, alignSelf: 'auto' }} onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
        </Row>

        {w ? (
          <View style={{ backgroundColor: w.charging ? '#FFF6E5' : colors.surface, padding: 12, borderRadius: 12, gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Caption>Attente</Caption>
              <Timer since={arrivedAt} style={{ fontSize: 22 }} />
            </Row>
            <Body>{w.charging ? `Frais d'attente : ${formatMoney(w.fee, d.currency)}${step === 'at_dropoff' ? ' (payés par le destinataire)' : ''}` : `${grace} min offertes, puis ${rule.fee_per_min} F/min`}</Body>
          </View>
        ) : null}

        {step === 'to_pickup' || (step === 'to_dropoff' && d.status === 'delivering') ? (
          <Button title={t('courier.arrived')} onPress={arrive} loading={busy} />
        ) : null}

        {step === 'at_pickup' ? (
          <>
            <Button title={t('courier.pickedUp')} onPress={() => pickedUp(false)} loading={busy} />
            <Button title="📷 Colis récupéré avec photo" variant="secondary" onPress={() => pickedUp(true)} disabled={busy} />
          </>
        ) : null}

        {step === 'to_dropoff' && d.status === 'picked_up' ? (
          <Button title={t('courier.startDropoff')} onPress={() => run(() => sb.rpc('courier_start_dropoff', { p_delivery: d.id }))} loading={busy} />
        ) : null}

        {step === 'at_dropoff' ? (
          <View style={{ gap: 12 }}>
            <Divider />
            <Caption>{t('courier.collect.title')}</Caption>
            <Title style={{ fontSize: 44 }}>{collect ? formatMoney(refused ? collect.at_dropoff - collect.waiting_dropoff_fee : collect.at_dropoff, collect.currency) : '…'}</Title>
            {collect ? (
              <View style={{ gap: 2 }}>
                {collect.payer === 'recipient' ? <Caption>{t('courier.collect.price')} : {formatMoney(collect.price, collect.currency)}</Caption> : <Caption>Course déjà payée par l'expéditeur</Caption>}
                {collect.payer === 'recipient' && collect.waiting_pickup_fee ? <Caption>{t('courier.collect.waitingPickup')} : {formatMoney(collect.waiting_pickup_fee, collect.currency)}</Caption> : null}
                <Caption>{t('courier.collect.waitingDropoff')} : {formatMoney(collect.waiting_dropoff_fee, collect.currency)}</Caption>
              </View>
            ) : null}
            {collect && collect.waiting_dropoff_fee > 0 ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Body>{t('courier.collect.refused')}</Body>
                <Switch value={refused} onValueChange={setRefused} />
              </Row>
            ) : null}
            <Input label={t('courier.enterCode')} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad" maxLength={4} placeholder="••••" style={{ fontSize: 28, letterSpacing: 12, textAlign: 'center' }} />
            <Button title={t('courier.deliver')} onPress={complete} loading={busy} disabled={code.length !== 4} />
          </View>
        ) : null}

        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}

        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Pressable onPress={() => setIncident(true)}><Text style={{ color: colors.danger, fontWeight: '600', paddingVertical: 6 }}>{t('courier.incident')}</Text></Pressable>
          {w?.cap_reached ? <Pressable onPress={clientAbsent}><Text style={{ fontWeight: '600', paddingVertical: 6 }}>{t('courier.clientAbsent')}</Text></Pressable> : null}
          {d.status === 'assigned' ? <Pressable onPress={withdraw}><Text style={{ color: colors.muted, paddingVertical: 6 }}>Se désister</Text></Pressable> : null}
        </Row>
      </BottomSheet>
      {incident ? <IncidentModal deliveryId={d.id} onClose={() => setIncident(false)} /> : null}
    </View>
  );
}

function IncidentModal({ deliveryId, onClose }: { deliveryId: string; onClose: () => void }) {
  const [kind, setKind] = useState<IncidentKind>('breakdown');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    const { error: e } = await getSupabase().rpc('report_incident', { p_delivery: deliveryId, p_kind: kind, p_description: text });
    setBusy(false);
    if (e) setError(rpcMessage(e));
    else {
      Alert.alert('Incident signalé', 'L\'équipe va le vérifier. Pas de pénalité de retard si l\'incident est validé.');
      onClose();
    }
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 12 }}>
          <Subtitle>{t('courier.incident')}</Subtitle>
          <Row style={{ flexWrap: 'wrap' }}>
            {(['breakdown', 'accident', 'police_check', 'other'] as IncidentKind[]).map((k) => (
              <Choice key={k} label={t(`incident.${k}`)} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </Row>
          <Input value={text} onChangeText={setText} placeholder="Détails (optionnel)" multiline maxLength={500} />
          {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
          <Button title="Envoyer" onPress={send} loading={busy} />
          <Button title={t('common.cancel')} variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

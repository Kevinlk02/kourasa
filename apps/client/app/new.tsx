// Créer une course : récupération → livraison → destinataire, taille, payeur → récapitulatif avec prix.
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import {
  colors, createDeliveryRequestSchema, formatMoney, t, toE164,
  type PackageSize, type Payer, type QuoteResponse,
} from '@koursa/shared';
import {
  BottomSheet, Body, Button, Caption, Choice, Divider, Input, KoursaMap, PhoneInput, Row, Subtitle, Title,
  callFunction, useSession,
} from '@koursa/ui';
import { PlacePicker, type PlaceDraft } from '../src/PlacePicker';
import { km, useCity } from '../src/hooks';

type Step = 'pickup' | 'dropoff' | 'details' | 'summary';
const SIZES: PackageSize[] = ['small', 'medium', 'large'];

export default function NewDelivery() {
  const city = useCity();
  const { country } = useSession();
  const [step, setStep] = useState<Step>('pickup');
  const [pickup, setPickup] = useState<PlaceDraft | null>(null);
  const [dropoff, setDropoff] = useState<PlaceDraft | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientLocal, setRecipientLocal] = useState('');
  const [size, setSize] = useState<PackageSize>('small');
  const [payer, setPayer] = useState<Payer>('sender');
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dial = country?.dial_code ?? '+228';

  // Devis calculé serveur dès que le récapitulatif s'affiche (ou que la taille change).
  useEffect(() => {
    if (step !== 'summary' || !city || !pickup || !dropoff) return;
    setLoading(true);
    setError(null);
    setQuote(null);
    callFunction<QuoteResponse>('quote', { city_id: city.id, pickup: pickup.point, dropoff: dropoff.point, size })
      .then(setQuote)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [step, size, city, pickup, dropoff]);

  if (!city) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>;
  const center = { lat: city.center_lat, lng: city.center_lng };

  if (step === 'pickup') {
    return <PlacePicker key="pickup" title={t('create.pickup')} cityId={city.id} center={center} initial={pickup}
      onBack={() => router.back()} onDone={(p) => { setPickup(p); setStep('dropoff'); }} />;
  }
  if (step === 'dropoff') {
    return <PlacePicker key="dropoff" title={t('create.dropoff')} cityId={city.id} center={pickup?.point ?? center} initial={dropoff}
      onBack={() => setStep('pickup')} onDone={(p) => { setDropoff(p); setStep('details'); }} />;
  }

  const markers = [
    ...(pickup ? [{ id: 'pickup', kind: 'pickup' as const, ...pickup.point }] : []),
    ...(dropoff ? [{ id: 'dropoff', kind: 'dropoff' as const, ...dropoff.point }] : []),
  ];

  async function order() {
    if (!city || !pickup || !dropoff || !quote) return;
    const payload = {
      city_id: city.id,
      pickup: { point: pickup.point, address: pickup.address, landmark: pickup.landmark, place_id: pickup.place_id, session_token: pickup.session_token, manual_pin: pickup.manual_pin },
      dropoff: { point: dropoff.point, address: dropoff.address, landmark: dropoff.landmark, place_id: dropoff.place_id, session_token: dropoff.session_token, manual_pin: dropoff.manual_pin },
      recipient_name: recipientName.trim(),
      recipient_phone: toE164(dial, recipientLocal),
      size,
      payer,
      note: note.trim() || undefined,
      expected_price: quote.price,
    };
    const parsed = createDeliveryRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Vérifiez les informations');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await callFunction<{ delivery_id: string }>('create-delivery', parsed.data);
      router.replace(`/delivery/${r.delivery_id}`);
    } catch (e) {
      const err = e as Error & { error?: string; price?: number };
      if (err.error === 'price_changed' && err.price && quote) setQuote({ ...quote, price: err.price });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (step === 'details') {
    const ok = recipientName.trim().length >= 2 && recipientLocal.replace(/\D/g, '').length >= 8;
    return (
      <View style={{ flex: 1 }}>
        <KoursaMap center={center} markers={markers} fitToMarkers bottomPadding={480} />
        <BottomSheet scroll maxHeight="85%">
          <Subtitle>{t('create.recipient')}</Subtitle>
          <Input value={recipientName} onChangeText={setRecipientName} placeholder={t('create.recipient.name')} autoComplete="name" />
          <PhoneInput dialCode={dial} value={recipientLocal} onChangeText={setRecipientLocal} placeholder={t('auth.phone.placeholder')} />
          <Subtitle>{t('create.size')}</Subtitle>
          <Row>{SIZES.map((s) => <Choice key={s} label={t(`size.${s}`)} hint={t(`size.${s}.hint`)} selected={size === s} onPress={() => setSize(s)} />)}</Row>
          <Subtitle>{t('create.payer')}</Subtitle>
          <Row>
            <Choice label={t('payer.sender')} selected={payer === 'sender'} onPress={() => setPayer('sender')} />
            <Choice label={t('payer.recipient')} selected={payer === 'recipient'} onPress={() => setPayer('recipient')} />
          </Row>
          <Input value={note} onChangeText={setNote} placeholder="Note pour le coursier (optionnel)" maxLength={300} />
          <Button title={t('common.continue')} disabled={!ok} onPress={() => setStep('summary')} />
          <Button title={t('common.back')} variant="ghost" onPress={() => setStep('dropoff')} />
        </BottomSheet>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <KoursaMap center={center} markers={markers} fitToMarkers bottomPadding={420} />
      <BottomSheet scroll maxHeight="80%">
        <Subtitle>{t('create.summary')}</Subtitle>
        <View style={{ gap: 4 }}>
          <Caption>{t('create.pickup')}</Caption>
          <Body numberOfLines={1}>{pickup?.landmark}</Body>
          <Caption>{t('create.dropoff')}</Caption>
          <Body numberOfLines={1}>{dropoff?.landmark} · {recipientName}</Body>
          <Caption>{t(`size.${size}`)} · {payer === 'sender' ? t('payer.sender') : t('payer.recipient')}</Caption>
        </View>
        <Divider />
        {loading && !quote ? <ActivityIndicator color={colors.accent} /> : null}
        {quote ? (
          <View style={{ gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body>{t('create.price')}</Body>
              <Title>{formatMoney(quote.price, quote.currency)}</Title>
            </Row>
            <Caption>{km(quote.distance_m)} · {quote.pickup_zone.name}{quote.dropoff_zone && quote.dropoff_zone.id !== quote.pickup_zone.id ? ` → ${quote.dropoff_zone.name}` : ''}</Caption>
            <Body style={{ color: colors.muted }}>{t('create.waitingLine', { grace: quote.waiting_grace_min, fee: quote.waiting_fee_per_min })}</Body>
          </View>
        ) : null}
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        <Button title={quote ? `${t('create.order')} · ${formatMoney(quote.price, quote.currency)}` : t('create.order')}
          onPress={order} loading={loading && !!quote} disabled={!quote} />
        <Button title={t('common.back')} variant="ghost" onPress={() => setStep('details')} />
      </BottomSheet>
    </View>
  );
}

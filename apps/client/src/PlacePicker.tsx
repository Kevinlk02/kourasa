/**
 * Choix d'un point : lieux récents/favoris d'abord (gratuit), position actuelle,
 * recherche Google (debounce 350 ms, 3 caractères min., session token), ou épingle sur la carte.
 * Le repère est obligatoire : c'est lui qui fait la livraison.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { colors, t, type SavedPlace } from '@koursa/shared';
import type { PlaceInput } from '@koursa/shared/schemas';
import {
  BottomSheet, Body, Button, Caption, Divider, Input, KoursaMap, ListItem, MapPin, Subtitle,
  callFunction, getSupabase,
} from '@koursa/ui';
import { newSessionToken } from './hooks';

interface Suggestion { place_id: string; main: string; secondary: string }

export interface PlaceDraft extends PlaceInput {
  label: string;
}

type Mode = 'list' | 'map' | 'landmark';

export function PlacePicker({ title, cityId, center, initial, onDone, onBack }: {
  title: string;
  cityId: string;
  center: { lat: number; lng: number };
  initial?: PlaceDraft | null;
  onDone: (p: PlaceDraft) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initial ? 'landmark' : 'list');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlaceDraft | null>(initial ?? null);
  const [landmark, setLandmark] = useState(initial?.landmark ?? '');
  const [pin, setPin] = useState(center);
  const [pinLabel, setPinLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionToken = useMemo(newSessionToken, []);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getSupabase().rpc('my_places', { p_limit: 8 }).then(({ data }) => setSaved((data as SavedPlace[]) ?? []));
  }, []);

  // Autocomplétion Google : debounce 350 ms, 3 caractères minimum.
  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await callFunction<{ suggestions: Suggestion[] }>('places-autocomplete', {
          input: query.trim(), session_token: sessionToken, city_id: cityId,
        });
        setSuggestions(r.suggestions);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [query, cityId, sessionToken]);

  function choose(p: Omit<PlaceDraft, 'landmark'> & { landmark?: string }) {
    setDraft({ ...p, landmark: p.landmark ?? '' });
    setLandmark(p.landmark ?? '');
    setError(null);
    setMode('landmark');
  }

  async function pickSuggestion(s: Suggestion) {
    setBusy(true);
    try {
      const d = await callFunction<{ lat: number; lng: number; name: string; address: string }>('place-details', {
        place_id: s.place_id, session_token: sessionToken,
      });
      choose({
        point: { lat: d.lat, lng: d.lng }, address: d.address || `${s.main}, ${s.secondary}`, label: s.main,
        place_id: s.place_id, session_token: sessionToken, manual_pin: false,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function useCurrent() {
    setBusy(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Autorisez la localisation ou choisissez sur la carte');
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const point = { lat: cur.coords.latitude, lng: cur.coords.longitude };
      let label = t('create.current');
      try {
        label = (await callFunction<{ label: string }>('reverse-geocode', point)).label || label;
      } catch {
        /* libellé optionnel */
      }
      choose({ point, address: label, label, place_id: null, manual_pin: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onPinMove(c: { lat: number; lng: number }) {
    setPin(c);
    if (geoTimer.current) clearTimeout(geoTimer.current);
    // Reverse geocode seulement quand l'épingle s'arrête.
    geoTimer.current = setTimeout(async () => {
      try {
        setPinLabel((await callFunction<{ label: string }>('reverse-geocode', c)).label);
      } catch {
        setPinLabel('');
      }
    }, 700);
  }

  if (mode === 'map') {
    return (
      <View style={{ flex: 1 }}>
        <KoursaMap center={pin} zoom={17} onCenterChange={onPinMove} showsUserLocation bottomPadding={220} />
        <MapPin />
        <BottomSheet>
          <Subtitle>{title}</Subtitle>
          <Caption>{t('create.pin')}</Caption>
          <Body numberOfLines={2}>{pinLabel || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`}</Body>
          <Button title={t('create.usePin')} onPress={() => choose({
            point: pin, address: pinLabel, label: pinLabel || 'Point sur la carte', place_id: null, manual_pin: true,
          })} />
          <Button title={t('common.back')} variant="ghost" onPress={() => setMode('list')} />
        </BottomSheet>
      </View>
    );
  }

  if (mode === 'landmark' && draft) {
    return (
      <View style={{ flex: 1 }}>
        <KoursaMap center={draft.point} zoom={17} markers={[{ id: 'p', kind: 'pickup', ...draft.point }]} bottomPadding={300} />
        <BottomSheet scroll>
          <Subtitle>{title}</Subtitle>
          <Body numberOfLines={2}>{draft.address || draft.label}</Body>
          <Input label={t('create.landmark')} value={landmark} onChangeText={setLandmark}
            placeholder={t('create.landmark.hint')} multiline maxLength={300} error={error} autoFocus={!landmark} />
          <Button title={t('common.continue')} onPress={() => {
            if (landmark.trim().length < 3) {
              setError(t('create.landmark.required'));
              return;
            }
            onDone({ ...draft, landmark: landmark.trim() });
          }} />
          <Button title="Changer de lieu" variant="ghost" onPress={() => setMode('list')} />
        </BottomSheet>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 48 }}>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <Pressable onPress={onBack}><Text style={{ fontSize: 16, color: colors.muted }}>← {t('common.back')}</Text></Pressable>
        <Subtitle>{title}</Subtitle>
        <Input value={query} onChangeText={setQuery} placeholder={t('create.search')} autoFocus autoCorrect={false} />
        {error ? <Caption style={{ color: colors.danger }}>{error}</Caption> : null}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 4 }}>
        {busy || searching ? <ActivityIndicator color={colors.accent} /> : null}
        {suggestions.map((s) => (
          <ListItem key={s.place_id} title={s.main} subtitle={s.secondary} onPress={() => pickSuggestion(s)} />
        ))}
        {suggestions.length === 0 ? (
          <>
            <ListItem title={`📍 ${t('create.current')}`} onPress={useCurrent} />
            <ListItem title={`🗺️ Choisir sur la carte`} onPress={() => setMode('map')} />
            {saved.length ? <><Divider /><Caption style={{ marginTop: 8 }}>{t('create.recent')}</Caption></> : null}
            {saved.map((s) => (
              <ListItem key={s.id} title={`${s.favorite ? '★ ' : ''}${s.label || s.address}`} subtitle={s.landmark || s.address}
                onPress={() => choose({
                  point: { lat: s.lat, lng: s.lng }, address: s.address, label: s.label || s.address,
                  landmark: s.landmark, place_id: s.place_id, manual_pin: !s.place_id,
                })} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

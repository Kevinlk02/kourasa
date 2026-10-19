// Accueil : carte plein écran centrée sur la position + bottom sheet « Où livrer ? ».
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius, t, type DeliveryStatus } from '@koursa/shared';
import { BottomSheet, KoursaMap, ListItem, Row, StatusPill, Title, getSupabase, useSession } from '@koursa/ui';
import { useCity, useCurrentPosition } from '../src/hooks';

interface ActiveRow { id: string; status: DeliveryStatus; recipient_name: string; dropoff_landmark: string }

export default function Home() {
  const { profile, signOut } = useSession();
  const city = useCity();
  const pos = useCurrentPosition();
  const [active, setActive] = useState<ActiveRow[]>([]);
  const center = pos ?? (city ? { lat: city.center_lat, lng: city.center_lng } : { lat: 6.1375, lng: 1.2123 });

  useFocusEffect(useCallback(() => {
    getSupabase().from('deliveries').select('id, status, recipient_name, dropoff_landmark')
      .eq('client_id', profile?.id ?? '')
      .in('status', ['pending', 'searching', 'assigned', 'picked_up', 'delivering', 'unassigned'])
      .order('created_at', { ascending: false }).limit(3)
      .then(({ data }) => setActive((data as ActiveRow[]) ?? []));
  }, [profile?.id]));

  return (
    <View style={{ flex: 1 }}>
      <KoursaMap center={center} zoom={15} showsUserLocation bottomPadding={260}
        markers={pos ? [{ id: 'me', kind: 'me', ...pos }] : []} />
      <BottomSheet>
        <Title>{t('home.where')}</Title>
        <Pressable onPress={() => router.push('/new')} role="button"
          style={{ height: 56, borderRadius: radius.button, backgroundColor: colors.surface, justifyContent: 'center', paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 17, color: colors.muted }}>🔍  {t('create.dropoff')}</Text>
        </Pressable>
        {active.map((d) => (
          <ListItem key={d.id} title={`${t('home.active')} · ${d.recipient_name}`} subtitle={d.dropoff_landmark}
            right={<StatusPill status={d.status} />} onPress={() => router.push(`/delivery/${d.id}`)} />
        ))}
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.push('/history')}><Text style={{ fontSize: 16, fontWeight: '600' }}>{t('home.history')}</Text></Pressable>
          <Pressable onPress={signOut}><Text style={{ fontSize: 14, color: colors.muted }}>{t('auth.logout')}</Text></Pressable>
        </Row>
      </BottomSheet>
    </View>
  );
}

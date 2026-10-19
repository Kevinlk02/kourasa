import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { colors, formatMoney, t, type DeliveryStatus } from '@koursa/shared';
import { Body, ListItem, Screen, StatusPill, Title, getSupabase } from '@koursa/ui';

interface Row {
  id: string; status: DeliveryStatus; created_at: string; dropoff_landmark: string; recipient_name: string;
  price_locked: number; currency: string; rated: boolean;
}

export default function History() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    getSupabase().rpc('client_history', { p_limit: 50 }).then(({ data }) => setRows((data as Row[]) ?? []));
  }, []);
  return (
    <Screen>
      <Pressable onPress={() => router.back()}><Text style={{ color: colors.muted, fontSize: 16 }}>← {t('common.back')}</Text></Pressable>
      <Title>{t('history.title')}</Title>
      {rows === null ? <ActivityIndicator color={colors.accent} /> : null}
      {rows?.length === 0 ? <Body>{t('history.empty')}</Body> : null}
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <ListItem
            title={`${item.recipient_name} · ${formatMoney(item.price_locked, item.currency)}`}
            subtitle={`${new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${item.dropoff_landmark}${item.status === 'delivered' && !item.rated ? ' · à noter' : ''}`}
            right={<StatusPill status={item.status} />}
            onPress={() => router.push(`/delivery/${item.id}`)}
          />
        )}
      />
    </Screen>
  );
}

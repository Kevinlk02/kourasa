// Gains du jour / de la semaine et commission due (remboursement par mobile money, validé dans l'admin).
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, formatMoney, t } from '@koursa/shared';
import { Body, Caption, Divider, Row, Subtitle, Title, getSupabase } from '@koursa/ui';

interface Earnings {
  deliveries: number; gross_collected: number; courses_share: number; waiting_share: number;
  incentives: number; penalties: number; commission: number; balance_due: number; block_threshold: number;
  merchant_momo_number: string | null; currency: string;
}
interface Tx { id: string; type: string; amount: number; created_at: string; note: string | null }

const TX_LABEL: Record<string, string> = {
  commission: 'Commission', incentive: 'Incitation', penalty: 'Pénalité de retard',
  repayment: 'Remboursement', adjustment: 'Ajustement', waiting: 'Attente',
};

function startOfDay() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function startOfWeek() { const d = startOfDay(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }

export default function EarningsScreen() {
  const sb = getSupabase();
  const [today, setToday] = useState<Earnings | null>(null);
  const [week, setWeek] = useState<Earnings | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);

  useEffect(() => {
    const end = new Date(Date.now() + 86_400_000).toISOString();
    sb.rpc('courier_earnings', { p_from: startOfDay().toISOString(), p_to: end }).then(({ data }) => setToday(data as Earnings));
    sb.rpc('courier_earnings', { p_from: startOfWeek().toISOString(), p_to: end }).then(({ data }) => setWeek(data as Earnings));
    sb.from('wallet_transactions').select('id, type, amount, created_at, note').order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setTxs((data as Tx[]) ?? []));
  }, [sb]);

  if (!today || !week) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>;
  const cur = today.currency ?? 'XOF';

  const Block = ({ title, e }: { title: string; e: Earnings }) => (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 4 }}>
      <Caption>{title} · {e.deliveries} course{e.deliveries > 1 ? 's' : ''}</Caption>
      <Title>{formatMoney(e.courses_share + e.waiting_share + e.incentives - e.penalties, cur)}</Title>
      <Caption>Courses {formatMoney(e.courses_share, cur)} · Attente {formatMoney(e.waiting_share, cur)}</Caption>
      <Caption>Incitations +{formatMoney(e.incentives, cur)} · Pénalités −{formatMoney(e.penalties, cur)}</Caption>
      <Caption>Encaissé en espèces : {formatMoney(e.gross_collected, cur)}</Caption>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, gap: 14, backgroundColor: colors.background }}>
      <Pressable onPress={() => router.back()}><Text style={{ color: colors.muted, fontSize: 16 }}>← {t('common.back')}</Text></Pressable>
      <Title>{t('courier.earnings')}</Title>
      <Block title={t('courier.earnings.today')} e={today} />
      <Block title={t('courier.earnings.week')} e={week} />

      <View style={{ borderRadius: 12, padding: 14, gap: 6, borderWidth: 2, borderColor: week.balance_due > week.block_threshold ? colors.danger : colors.border }}>
        <Caption>{t('courier.commission')}</Caption>
        <Title style={{ color: week.balance_due > week.block_threshold ? colors.danger : colors.text }}>{formatMoney(Math.max(0, week.balance_due), cur)}</Title>
        <Caption>Blocage au-delà de {formatMoney(week.block_threshold, cur)}</Caption>
        <Body>{t('courier.commission.howto')}</Body>
        {week.merchant_momo_number ? <Body style={{ fontWeight: '700' }}>Numéro marchand : {week.merchant_momo_number}</Body> : null}
      </View>

      <Subtitle>Mouvements</Subtitle>
      {txs.map((x) => (
        <View key={x.id}>
          <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
            <View style={{ flex: 1 }}>
              <Body>{TX_LABEL[x.type] ?? x.type}</Body>
              <Caption>{new Date(x.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{x.note ? ` · ${x.note}` : ''}</Caption>
            </View>
            <Body style={{ fontWeight: '600', color: x.amount > 0 ? colors.danger : colors.accent }}>{x.amount > 0 ? '+' : '−'}{formatMoney(Math.abs(x.amount), cur)}</Body>
          </Row>
          <Divider />
        </View>
      ))}
      <Caption>+ = augmente votre dette envers Koursa · − = la réduit.</Caption>
    </ScrollView>
  );
}
